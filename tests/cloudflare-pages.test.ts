import assert from "node:assert/strict";
import test from "node:test";
import { handleRavioRequest } from "../cloudflare/worker.mjs";

test("Pages API health endpoint responds successfully", async () => {
  const response = await handleRavioRequest(
    new Request("https://ravio.pages.dev/api/health"),
    {}
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { ok: boolean; service: string; geminiConfigured: boolean };
  assert.equal(body.ok, true);
  assert.equal(body.service, "ravio-api");
  assert.equal(body.geminiConfigured, false);
});

test("same-origin and Capacitor APK origins receive CORS permission while evil origins get 403", async () => {
  for (const origin of ["https://ravio.pages.dev", "https://localhost", "capacitor://localhost"]) {
    const response = await handleRavioRequest(
      new Request("https://ravio.pages.dev/api/health", { headers: { Origin: origin } }),
      {}
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  }

  const preflight = await handleRavioRequest(
    new Request("https://ravio.pages.dev/api/gemini/script", {
      method: "OPTIONS",
      headers: { Origin: "https://localhost" },
    }),
    {}
  );
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), "https://localhost");

  const blocked = await handleRavioRequest(
    new Request("https://ravio.pages.dev/api/health", {
      headers: { Origin: "https://evil.example.com" },
    }),
    {}
  );
  assert.equal(blocked.status, 403);
});

test("RSS proxy rejects loopback, IPv6, and cloud metadata IPs", async () => {
  for (const target of [
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "ftp://example.com/rss.xml",
  ]) {
    const response = await handleRavioRequest(
      new Request("https://ravio.pages.dev/api/rss?url=" + encodeURIComponent(target)),
      {}
    );
    assert.equal(response.status, 400);
  }
});

test("Gemini endpoint reports missing server secret and enforces optional RAVIO_API_SECRET", async () => {
  const missingKey = await handleRavioRequest(
    new Request("https://ravio.pages.dev/api/gemini/script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ title: "test" }] }),
    }),
    {}
  );
  assert.equal(missingKey.status, 503);
  const body = (await missingKey.json()) as { error: string };
  assert.match(body.error, /GEMINI_API_KEY/);

  const unauthorized = await handleRavioRequest(
    new Request("https://ravio.pages.dev/api/gemini/script", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer wrong" },
      body: JSON.stringify({ items: [{ title: "test" }] }),
    }),
    { RAVIO_API_SECRET: "top-secret", GEMINI_API_KEY: "dummy" }
  );
  assert.equal(unauthorized.status, 401);
});

test("Gemini script endpoint falls back to next model when primary model returns 503 UNAVAILABLE", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls++;
    if (calls === 1) {
      return new Response(
        JSON.stringify({
          error: { code: 503, status: "UNAVAILABLE", message: "This model is currently experiencing high demand." },
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    broadcastTitle: "بولتن فناوری",
                    script: "سلام، این یک آزمایش است.",
                    cards: [{ id: "1", persianTitle: "تست", persianSummary: "خلاصه", topic: "فناوری" }],
                  }),
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    const response = await handleRavioRequest(
      new Request("https://ravio.pages.dev/api/gemini/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ id: "1", title: "AI test", description: "desc", source: "Test", link: "https://example.com" }],
          categoryLabel: "فناوری",
          model: "gemini-2.5-flash",
        }),
      }),
      { GEMINI_API_KEY: "test-key" }
    );
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
    const data = (await response.json()) as { broadcastTitle: string; modelUsed: string };
    assert.equal(data.broadcastTitle, "بولتن فناوری");
    assert.equal(data.modelUsed, "gemini-2.5-flash-lite");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Pages API health endpoint reports fallback Gemini and OpenRouter flags without leaking secrets", async () => {
  const secrets = {
    GEMINI_API_KEY: "AIzaSyPrimarySecretValue1234567890",
    GEMINI_API_KEY_FALLBACK: "AIzaSyFallbackSecretValue1234567890",
    OPENROUTER_API_KEY: "sk-or-v1-secret-openrouter-value-987654",
  };
  const response = await handleRavioRequest(
    new Request("https://ravio.pages.dev/api/health"),
    secrets
  );
  assert.equal(response.status, 200);
  const rawText = await response.text();
  assert.doesNotMatch(rawText, /AIzaSy/);
  assert.doesNotMatch(rawText, /sk-or-v1/);

  const body = JSON.parse(rawText) as {
    ok: boolean;
    geminiConfigured: boolean;
    fallbackGeminiConfigured: boolean;
    openRouterConfigured: boolean;
  };
  assert.equal(body.ok, true);
  assert.equal(body.geminiConfigured, true);
  assert.equal(body.fallbackGeminiConfigured, true);
  assert.equal(body.openRouterConfigured, true);
});

test("Gemini script endpoint switches from primary key to GEMINI_API_KEY_FALLBACK on 429 quota", async () => {
  const originalFetch = globalThis.fetch;
  const calledKeys: string[] = [];

  globalThis.fetch = (async (input) => {
    const url = String(input);
    const key = new URL(url).searchParams.get("key") || "";
    calledKeys.push(key);
    if (key === "primary-key") {
      return new Response(
        JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    broadcastTitle: "بولتن کلید دوم",
                    script: "پخش با کلید پشتیبان انجام شد.",
                    cards: [{ id: "1", persianTitle: "تیتر", persianSummary: "خلاصه", topic: "خبر" }],
                  }),
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    const response = await handleRavioRequest(
      new Request("https://ravio.pages.dev/api/gemini/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ id: "1", title: "News", description: "Desc", source: "BBC", link: "https://example.com" }],
          categoryLabel: "خبر",
        }),
      }),
      {
        GEMINI_API_KEY: "primary-key",
        GEMINI_API_KEY_FALLBACK: "backup-key",
      }
    );
    assert.equal(response.status, 200);
    assert.deepEqual(calledKeys, ["primary-key", "backup-key"]);
    const data = (await response.json()) as { broadcastTitle: string };
    assert.equal(data.broadcastTitle, "بولتن کلید دوم");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gemini TTS endpoint switches from primary key to GEMINI_API_KEY_FALLBACK on 429 quota", async () => {
  const originalFetch = globalThis.fetch;
  const calledKeys: string[] = [];
  const samplePcmBase64 = Buffer.from(new Uint8Array(16)).toString("base64");

  globalThis.fetch = (async (input) => {
    const url = String(input);
    const key = new URL(url).searchParams.get("key") || "";
    calledKeys.push(key);
    if (key === "primary-tts-key") {
      return new Response(
        JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: samplePcmBase64 } }],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    const response = await handleRavioRequest(
      new Request("https://ravio.pages.dev/api/gemini/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "سلام، این یک آزمایش صوتی است.",
          voiceName: "Kore",
        }),
      }),
      {
        GEMINI_API_KEY: "primary-tts-key",
        GEMINI_API_KEY_FALLBACK: "backup-tts-key",
      }
    );
    assert.equal(response.status, 200);
    assert.deepEqual(calledKeys, ["primary-tts-key", "backup-tts-key"]);
    const data = (await response.json()) as { audioBase64: string; mimeType: string };
    assert.equal(data.mimeType, "audio/wav");
    const wavBytes = Buffer.from(data.audioBase64, "base64");
    assert.equal(wavBytes.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(wavBytes.subarray(8, 12).toString("ascii"), "WAVE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gemini script endpoint falls back to server OpenRouter key when all Gemini keys fail", async () => {
  const originalFetch = globalThis.fetch;
  const targets: string[] = [];

  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    targets.push(url);
    if (url.includes("generativelanguage.googleapis.com")) {
      return new Response(
        JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("Authorization"), "Bearer sk-or-v1-test-fallback");
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                broadcastTitle: "بولتن جایگزین OpenRouter",
                script: "این بولتن از طریق سرور OpenRouter تولید شد.",
                cards: [
                  {
                    id: "item-42",
                    persianTitle: "تیتر فارسی جایگزین",
                    persianSummary: "خلاصه فارسی از OpenRouter",
                    topic: "فناوری",
                  },
                ],
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    const response = await handleRavioRequest(
      new Request("https://ravio.pages.dev/api/gemini/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              id: "item-42",
              title: "AI Breakthrough",
              description: "Details",
              source: "Tech",
              link: "https://example.com/42",
            },
          ],
          categoryLabel: "فناوری",
        }),
      }),
      {
        GEMINI_API_KEY: "key-1",
        GEMINI_API_KEY_FALLBACK: "key-2",
        OPENROUTER_API_KEY: "sk-or-v1-test-fallback",
        OPENROUTER_FALLBACK_MODEL: "google/gemini-2.5-flash",
      }
    );
    assert.equal(response.status, 200);
    assert.ok(targets.some((t) => t === "https://openrouter.ai/api/v1/chat/completions"));
    const data = (await response.json()) as {
      broadcastTitle: string;
      modelUsed: string;
      cards: Array<{ id: string; persianTitle: string }>;
    };
    assert.equal(data.broadcastTitle, "بولتن جایگزین OpenRouter");
    assert.equal(data.modelUsed, "openrouter/google/gemini-2.5-flash");
    assert.equal(data.cards[0]?.id, "item-42");
    assert.equal(data.cards[0]?.persianTitle, "تیتر فارسی جایگزین");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
