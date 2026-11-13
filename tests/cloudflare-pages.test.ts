import assert from "node:assert/strict";
import test from "node:test";
import { handleRavioRequest } from "../cloudflare/worker.mjs";

test("Pages API health endpoint responds successfully", async () => {
  const response = await handleRavioRequest(new Request("https://ravio.pages.dev/api/health"), {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, "ravio-api");
});

test("same-origin browser requests receive CORS permission", async () => {
  const response = await handleRavioRequest(new Request("https://ravio.pages.dev/api/health", { headers: { Origin: "https://ravio.pages.dev" } }), {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://ravio.pages.dev");
});

test("RSS proxy rejects loopback and cloud metadata IPs", async () => {
  for (const target of ["http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/"]) {
    const response = await handleRavioRequest(new Request("https://ravio.pages.dev/api/rss?url=" + encodeURIComponent(target)), {});
    assert.equal(response.status, 400);
  }
});

test("Gemini endpoint reports missing server secret without leaking credentials", async () => {
  const response = await handleRavioRequest(new Request("https://ravio.pages.dev/api/gemini/script", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [{ title: "test" }] })
  }), {});
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.match(body.error, /GEMINI_API_KEY/);
});
