const MAX_RSS = 2 * 1024 * 1024;
const MAX_ITEMS = 20;
const MAX_TTS = 12000;
const limits = new Map();

const reply = (value, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });

function getGeminiKeys(env) {
  const raw = [
    env?.GEMINI_API_KEY || "",
    env?.GEMINI_API_KEY_FALLBACK || "",
    ...String(env?.GEMINI_API_KEYS || "").split(/[\s,;]+/),
  ];
  return [...new Set(raw.map((k) => String(k).trim()).filter(Boolean))];
}

function getOpenRouterKey(env) {
  return String(env?.OPENROUTER_API_KEY || "").trim();
}

function cors(origin, env, requestUrl) {
  const allow = new Set([
    "https://localhost",
    "http://localhost",
    "capacitor://localhost",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);

  if (env.APP_URL) {
    try {
      allow.add(new URL(env.APP_URL).origin);
    } catch {
      // Ignore malformed APP_URL
    }
  }

  for (const entry of String(env.ALLOWED_ORIGINS || "").split(",")) {
    const clean = entry.trim().replace(/\/+$/, "");
    if (clean) allow.add(clean);
  }

  try {
    if (origin && new URL(requestUrl).origin === origin) {
      allow.add(origin);
    }
  } catch {
    // Ignore malformed URL
  }

  if (origin && (allow.has("*") || allow.has(origin))) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Ravio-Secret",
      Vary: "Origin",
    };
  }

  return { Vary: "Origin" };
}

function limit(key, max, windowMs) {
  const now = Date.now();
  const active = (limits.get(key) || []).filter((t) => now - t < windowMs);
  if (active.length >= max) {
    limits.set(key, active);
    return Math.max(1, Math.ceil((windowMs - (now - active[0])) / 1000));
  }
  active.push(now);
  limits.set(key, active);
  if (limits.size > 5000) {
    for (const [k, v] of limits) {
      if (!v.length || now - v[v.length - 1] > 900000) {
        limits.delete(k);
      }
    }
  }
  return 0;
}

function private4(host) {
  const p = host.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function safeUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw Error("آدرس فید نامعتبر است.");
  }

  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    !h ||
    [
      "localhost",
      "localhost.localdomain",
      "localdomain",
      "ip6-localhost",
      "ip6-loopback",
      "metadata",
      "metadata.google.internal",
      "metadata.goog",
      "metadata.azure.internal",
      "instance-data",
      "169.254.169.254",
      "0.0.0.0",
      "::",
      "::1",
    ].includes(h) ||
    /\.(local|localhost|localdomain|internal)$/.test(h) ||
    h.startsWith("fe80:") ||
    h.startsWith("fc") ||
    h.startsWith("fd") ||
    h.startsWith("::ffff:") ||
    (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) && private4(h)) ||
    h.includes(":")
  ) {
    throw Error("دسترسی به آدرس‌های محلی یا شبکه خصوصی برای فید مجاز نیست.");
  }

  return u;
}

function rssType(val) {
  return (
    !val ||
    [
      "application/rss+xml",
      "application/atom+xml",
      "application/xml",
      "text/xml",
      "application/rdf+xml",
      "text/plain",
    ].includes(val.split(";")[0].trim().toLowerCase())
  );
}

function xmlLike(val) {
  const s = val.replace(/^\uFEFF/, "").trimStart().slice(0, 600).toLowerCase();
  return (
    !!s &&
    !s.startsWith("<!doctype html") &&
    !s.startsWith("<html") &&
    (s.startsWith("<?xml") || s.includes("<rss") || s.includes("<feed") || s.includes("<rdf:rdf"))
  );
}

async function limitedText(r) {
  if (Number(r.headers.get("content-length") || 0) > MAX_RSS) {
    throw Error("حجم فید خبری بیش از حد مجاز است.");
  }
  const reader = r.body?.getReader();
  if (!reader) {
    const t = await r.text();
    if (new TextEncoder().encode(t).length > MAX_RSS) {
      throw Error("حجم فید خبری بیش از حد مجاز است.");
    }
    return t;
  }
  const chunks = [];
  let n = 0;
  while (true) {
    const x = await reader.read();
    if (x.done) break;
    n += x.value.byteLength;
    if (n > MAX_RSS) {
      await reader.cancel().catch(() => {});
      throw Error("حجم فید خبری بیش از حد مجاز است.");
    }
    chunks.push(x.value);
  }
  const all = new Uint8Array(n);
  let p = 0;
  for (const c of chunks) {
    all.set(c, p);
    p += c.length;
  }
  return new TextDecoder().decode(all);
}

async function fetchFeed(raw, signal) {
  let current = safeUrl(raw).toString();
  for (let i = 0; i <= 3; i++) {
    const r = await fetch(current, {
      redirect: "manual",
      signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RavioNewsBot/1.0)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        "Cache-Control": "no-cache, no-store, max-age=0",
        Pragma: "no-cache",
      },
    });
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get("location");
      await r.body?.cancel().catch(() => {});
      if (!loc) throw Error("تغییر مسیر نامعتبر در فید خبری.");
      current = safeUrl(new URL(loc, current).toString()).toString();
      continue;
    }
    return r;
  }
  throw Error("تعداد تغییر مسیرهای آدرس فید بیش از حد مجاز است.");
}

function prepareTts(raw) {
  const pairs = [
    [/\bAI\b/gi, "هوش مصنوعی"],
    [/\bUSA\b/gi, "آمریکا"],
    [/\bU\.S\.A?\.?\b/gi, "آمریکا"],
    [/\bUK\b/gi, "بریتانیا"],
    [/\bEU\b/gi, "اتحادیه اروپا"],
    [/\bUN\b/gi, "سازمان ملل"],
    [/\bNATO\b/gi, "ناتو"],
    [/\bBBC\b/gi, "بی‌بی‌سی"],
    [/\bCNN\b/gi, "سی‌ان‌ان"],
    [/\bCENTCOM\b/gi, "سِنت‌کام"],
    [/\bADNOC\b/gi, "اَدنوک"],
    [/\bIMF\b/gi, "صندوق بین‌المللی پول"],
    [/\bGDP\b/gi, "تولید ناخالص داخلی"],
    [/\bCEO\b/gi, "مدیرعامل"],
    [/\bAPI\b/gi, "ای‌پی‌آی"],
    [/\bRSS\b/gi, "آر‌اس‌اس"],
    [/\bGPS\b/gi, "جی‌پی‌اس"],
    [/\bVIP\b/gi, "وی‌آی‌پی"],
  ];
  let s = raw
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[*#_`[\]<>~|]/g, " ")
    .replace(/(\d+(?:[.,]\d+)?)\s*%/g, "$1 درصد")
    .replace(/\$\s*(\d+(?:[.,]\d+)?)/g, "$1 دلار")
    .replace(/€\s*(\d+(?:[.,]\d+)?)/g, "$1 یورو")
    .replace(/£\s*(\d+(?:[.,]\d+)?)/g, "$1 پوند")
    .replace(/\s*&\s*/g, " و ")
    .replace(/\.{2,}/g, ".")
    .replace(/[()«»"]/g, " ");
  for (const [p, r] of pairs) s = s.replace(p, r);
  const d = "۰۱۲۳۴۵۶۷۸۹";
  return s
    .replace(/\d/g, (x) => d[Number(x)])
    .replace(/\s+([،.؟!؛:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function splitText(s, max = 2200) {
  s = s.replace(/\s+/g, " ").trim();
  if (s.length <= max) return [s];
  const out = [];
  let cur = "";
  for (const part of s.split(/(?<=[.!?؟۔\n])\s+/)) {
    if ((cur + " " + part).trim().length > max) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      if (part.length > max) {
        for (let i = 0; i < part.length; i += max) out.push(part.slice(i, i + max));
      } else {
        cur = part;
      }
    } else {
      cur = (cur + " " + part).trim();
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.length ? out : [s];
}

function from64(s) {
  const b = atob(s);
  const a = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
  return a;
}

function to64(a) {
  let s = "";
  for (let i = 0; i < a.length; i += 32768) {
    s += String.fromCharCode(...a.subarray(i, i + 32768));
  }
  return btoa(s);
}

function pcm(a) {
  if (
    a.length > 44 &&
    new TextDecoder().decode(a.subarray(0, 4)) === "RIFF" &&
    new TextDecoder().decode(a.subarray(8, 12)) === "WAVE"
  ) {
    const v = new DataView(a.buffer, a.byteOffset, a.byteLength);
    for (let p = 12; p + 8 <= a.length; ) {
      const id = new TextDecoder().decode(a.subarray(p, p + 4));
      const n = v.getUint32(p + 4, true);
      if (id === "data") return a.subarray(p + 8, Math.min(a.length, p + 8 + n));
      p += 8 + n + (n % 2);
    }
    return a.subarray(44);
  }
  return a;
}

function wav(p) {
  const a = new Uint8Array(44 + p.length);
  const v = new DataView(a.buffer);
  const w = (s, o) => {
    for (let i = 0; i < s.length; i++) a[o + i] = s.charCodeAt(i);
  };
  w("RIFF", 0);
  v.setUint32(4, 36 + p.length, true);
  w("WAVE", 8);
  w("fmt ", 12);
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 24000, true);
  v.setUint32(28, 48000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w("data", 36);
  v.setUint32(40, p.length, true);
  a.set(p, 44);
  return a;
}

function parseModelJson(rawText) {
  const trimmed = String(rawText || "{}").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw Error("پاسخ مدل هوش مصنوعی در قالب JSON معتبر نبود.");
  }
}

function isRetryableModelError(err) {
  const s = String(err?.message || err || "").toLowerCase();
  return (
    s.includes("404") ||
    s.includes("not_found") ||
    s.includes("not found") ||
    s.includes("503") ||
    s.includes("unavailable") ||
    s.includes("high demand") ||
    s.includes("overloaded")
  );
}

function isRetryableKeyError(err) {
  const s = String(err?.message || err || "").toLowerCase();
  return (
    s.includes("429") ||
    s.includes("quota") ||
    s.includes("resource_exhausted") ||
    s.includes("rate limit") ||
    s.includes("401") ||
    s.includes("403") ||
    s.includes("api_key_invalid") ||
    s.includes("api key") ||
    s.includes("permission_denied") ||
    isRetryableModelError(err)
  );
}

function mapped(e) {
  const s = String(e?.message || e || "").replace(
    /AIza[0-9A-Za-z_-]{20,}|sk-or-[0-9A-Za-z_-]{10,}/g,
    "[REDACTED]"
  );
  const l = s.toLowerCase();
  if (/401|403|api key|api_key_invalid|permission_denied/.test(l)) {
    return {
      status: 401,
      message: "کلید API سرویس Gemini در تنظیمات سرور نامعتبر است یا تعریف نشده است.",
    };
  }
  if (/429|quota|resource_exhausted|rate limit/.test(l)) {
    return {
      status: 429,
      message: "سهمیه یا محدودیت نرخ درخواست سرویس Gemini تکمیل شده است. لطفاً کمی بعد تلاش کنید.",
    };
  }
  if (/503|unavailable|high demand|overloaded/.test(l)) {
    return {
      status: 503,
      message: "مدل‌های هوش مصنوعی Gemini موقتاً با ترافیک بالا مواجه هستند؛ چند لحظه بعد دوباره تلاش کنید.",
    };
  }
  if (/timeout|abort/.test(l)) {
    return { status: 504, message: "زمان انتظار برای پاسخ سرویس Gemini به پایان رسید." };
  }
  return { status: 500, message: s || "خطا در ارتباط با سرویس هوش مصنوعی Gemini" };
}

async function geminiWithKey(apiKey, model, body) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), 85000);
  try {
    const u =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model) +
      ":generateContent?key=" +
      encodeURIComponent(apiKey);
    const r = await fetch(u, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: c.signal,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw Error(
        r.status +
          " " +
          (d?.error?.status || "") +
          " " +
          (d?.error?.message || "Gemini API error")
      );
    }
    return d;
  } finally {
    clearTimeout(timer);
  }
}

async function gemini(env, model, body) {
  const keys = getGeminiKeys(env);
  if (!keys.length) {
    throw Object.assign(Error("GEMINI_API_KEY missing"), { status: 503 });
  }

  let lastErr;
  for (let i = 0; i < keys.length; i++) {
    try {
      return await geminiWithKey(keys[i], model, body);
    } catch (e) {
      lastErr = e;
      if (i < keys.length - 1 && isRetryableKeyError(e)) {
        continue;
      }
      throw e;
    }
  }
  throw lastErr || Error("Gemini API error");
}

async function openRouterScriptFallback(env, { system, userPrompt, list }) {
  const orKey = getOpenRouterKey(env);
  if (!orKey) return null;

  const customOrModel = String(env.OPENROUTER_FALLBACK_MODEL || "").trim();
  const orModels = [
    ...new Set(
      [
        customOrModel,
        "google/gemini-2.5-flash",
        "deepseek/deepseek-chat-v3-0324:free",
        "meta-llama/llama-3.3-70b-instruct:free",
      ].filter(Boolean)
    ),
  ];

  const schemaHint = `\n\nخروجی باید دقیقاً یک آبجکت JSON معتبر با این کلیدها باشد:
{
  "broadcastTitle": "عنوان کوتاه فارسی بخش خبری",
  "script": "متن کامل و یکپارچه گوینده رادیو به زبان فارسی",
  "cards": [{ "id": "شناسه عین ورودی", "persianTitle": "تیتر فارسی", "persianSummary": "خلاصه دو خطی فارسی", "topic": "موضوع کوتاه" }]
}`;

  let lastErr;
  for (const orModel of orModels) {
    const c = new AbortController();
    const timer = setTimeout(() => c.abort(), 45000);
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + orKey,
          "X-Title": "Ravio News Radio",
        },
        body: JSON.stringify({
          model: orModel,
          messages: [
            { role: "system", content: system + schemaHint },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.5,
        }),
        signal: c.signal,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw Error(r.status + " " + (d?.error?.message || "OpenRouter API error"));
      }
      const txt = d?.choices?.[0]?.message?.content;
      if (!txt) throw Error("پاسخ خالی از OpenRouter دریافت شد.");
      const parsed = parseModelJson(txt);
      const rawCards = Array.isArray(parsed.cards) ? parsed.cards : [];
      const cards = list.map((item, idx) => {
        const match = rawCards.find((card) => card?.id === item.id) || rawCards[idx] || {};
        return {
          id: item.id,
          persianTitle: String(match.persianTitle || item.title),
          persianSummary: String(match.persianSummary || item.description || item.title),
          topic: String(match.topic || "خبر روز"),
        };
      });
      return {
        broadcastTitle: String(parsed.broadcastTitle || "بخش خبری راویو"),
        script: String(parsed.script || ""),
        cards,
        modelUsed: "openrouter/" + orModel,
      };
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || Error("خطا در سرویس پشتیبان OpenRouter");
}

async function makeScript(b, env) {
  const { items, categoryLabel = "", tone = "morning", model, generatedAtLabel = "" } = b || {};
  if (!Array.isArray(items) || !items.length) {
    return reply({ error: "هیچ خبری برای پردازش ارسال نشده است." }, 400);
  }
  if (items.length > 100) {
    return reply({ error: "تعداد خبرهای ارسالی بیش از حد مجاز است." }, 400);
  }

  const list = items.slice(0, MAX_ITEMS).map((x) => ({
    id: String(x?.id || "").slice(0, 120),
    title: String(x?.title || "").slice(0, 350),
    description: String(x?.description || "").slice(0, 700),
    source: String(x?.source || "").slice(0, 120),
    link: String(x?.link || "").slice(0, 500),
    pubDate: String(x?.pubDate || "").slice(0, 80),
  }));

  const time =
    String(generatedAtLabel || "").trim() ||
    new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Tehran",
    }).format(new Date());

  const toneText =
    tone === "fast_brief"
      ? "لحن سریع، موجز و تیترمحور مثل بولتن خبری کوتاه رادیویی."
      : tone === "analytical"
        ? "لحن تحلیلی، عمیق و حرفه‌ای با توضیح پیامدهای خبرها و ارتباط آن‌ها."
        : "لحن گرم، صمیمی، حرفه‌ای و پرانرژی گوینده رادیوی صبحگاهی ایرانی.";

  const system =
    "شما سردبیر و گوینده حرفه‌ای رادیوی هوشمند راویو هستید. خبرهای خام انگلیسی یا فارسی را به بولتن رادیویی یکپارچه فارسی معیار تبدیل کنید. جمله اول باید تاریخ و ساعت تهیه خبر را طبیعی اعلام کند: " +
    time +
    ". نام‌های خارجی و مخفف‌ها را فارسی‌نویسی کنید؛ هیچ واژه یا عدد لاتین در اسکریپت نباشد. خبرهای مرتبط را دسته‌بندی و بین بخش‌ها جمله ربطی اضافه کنید. در اسکریپت مارک‌داون، ایموجی، براکت یا پرانتز نیاورید. سبک اجرا: " +
    toneText +
    " خروجی دقیقاً JSON مطابق اسکیما باشد.";

  const prompt = list
    .map(
      (x, i) =>
        `[${i + 1}] ID: ${x.id}\nSource: ${x.source}\nDate: ${x.pubDate}\nTitle: ${x.title}\nSummary: ${x.description}\nLink: ${x.link}`
    )
    .join("\n\n");

  const userPrompt = `دسته‌بندی: ${categoryLabel}\nتاریخ و ساعت تهیه خبر: ${time}\n\nلیست خبرهای خام:\n${prompt}`;

  const geminiKeys = getGeminiKeys(env);
  const candidateModels = [
    ...new Set([
      model || "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-4-hydrogen",
      "gemini-2.5-flash",
    ]),
  ];

  let last = null;
  if (geminiKeys.length > 0) {
    for (const target of candidateModels) {
      try {
        const d = await gemini(env, target, {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                broadcastTitle: { type: "STRING" },
                script: { type: "STRING" },
                cards: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      id: { type: "STRING" },
                      persianTitle: { type: "STRING" },
                      persianSummary: { type: "STRING" },
                      topic: { type: "STRING" },
                    },
                    required: ["id", "persianTitle", "persianSummary", "topic"],
                  },
                },
              },
              required: ["broadcastTitle", "script", "cards"],
            },
          },
        });
        const txt = d?.candidates?.[0]?.content?.parts?.map((x) => x.text || "").join("").trim() || "{}";
        return reply({ ...parseModelJson(txt), modelUsed: target });
      } catch (e) {
        last = e;
        if (isRetryableModelError(e)) continue;
        break;
      }
    }
  }

  // Server-side OpenRouter fallback if Gemini keys are absent or all Gemini attempts failed
  if (getOpenRouterKey(env)) {
    try {
      const orResult = await openRouterScriptFallback(env, { system, userPrompt, list });
      if (orResult) return reply(orResult);
    } catch (orErr) {
      last = last || orErr;
    }
  }

  if (!geminiKeys.length && !last) {
    throw Object.assign(Error("GEMINI_API_KEY missing"), { status: 503 });
  }
  throw last || Error("تولید متن رادیویی با خطا مواجه شد.");
}

async function makeTts(b, env) {
  const text = String(b?.text || "");
  const voice = String(b?.voiceName || "Kore");
  const model = String(b?.model || "gemini-2.5-flash-preview-tts");
  if (!text.trim()) {
    return reply({ error: "متنی برای تبدیل به گفتار ارسال نشده است." }, 400);
  }
  if (text.length > MAX_TTS) {
    return reply({ error: "طول متن ارسالی بیش از حد مجاز است." }, 400);
  }

  const chunks = splitText(prepareTts(text));
  const models = [
    ...new Set([model, "gemini-3.8-flash-lite-tts", "gemini-2.5-flash-preview-tts"]),
  ];
  let active = models[0];
  const pcmParts = [];

  for (let i = 0; i < chunks.length; i++) {
    let audio = null;
    let last;
    for (const target of i === 0 ? models : [active]) {
      try {
        const is38 = target.includes("3.8");
        const part = is38
          ? {
              text: chunks[i],
              speechMetadata: {
                style:
                  "Clear, warm, fluent Iranian morning radio news anchor speaking standard Persian with accurate ezafe, natural comma pauses, and correct pronunciation of Persian and transliterated names",
              },
            }
          : {
              text:
                "این متن خبری را به زبان فارسی معیار، با تلفظ دقیق واژه‌های فارسی و اسامی خارجی، رعایت کامل کسره اضافه، مکث طبیعی و لحن گرم گوینده حرفه‌ای رادیو بخوان:\n\n" +
                chunks[i],
            };
        const d = await gemini(env, target, {
          contents: [{ role: "user", parts: [part] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
          },
        });
        const data = d?.candidates?.[0]?.content?.parts?.find((x) => x.inlineData?.data)?.inlineData?.data;
        if (!data) throw Error("پاسخ صوتی خالی از مدل دریافت شد.");
        audio = pcm(from64(data));
        active = target;
        break;
      } catch (e) {
        last = e;
        if (isRetryableModelError(e) || /400/.test(String(e?.message || e))) continue;
        throw e;
      }
    }
    if (!audio) throw last || Error("تولید فایل صوتی ناموفق بود.");
    pcmParts.push(audio);
  }

  const n = pcmParts.reduce((a, x) => a + x.length, 0);
  const all = new Uint8Array(n);
  let pos = 0;
  for (const p of pcmParts) {
    all.set(p, pos);
    pos += p.length;
  }
  return reply({
    audioBase64: to64(wav(all)),
    mimeType: "audio/wav",
    modelUsed: active,
    voiceName: voice,
  });
}

async function handle(request, env) {
  const u = new URL(request.url);
  const origin = request.headers.get("Origin");
  const ch = cors(origin, env, request.url);

  if (request.method === "OPTIONS") {
    if (origin && !ch["Access-Control-Allow-Origin"]) {
      return new Response(null, { status: 403, headers: ch });
    }
    return new Response(null, { status: 204, headers: ch });
  }

  if (origin && !ch["Access-Control-Allow-Origin"]) {
    return reply({ error: "دسترسی از این مبدأ (Origin) مجاز نیست." }, 403, ch);
  }

  if (!u.pathname.startsWith("/api/")) {
    return reply({ service: "Ravio API", status: "ok", api: "/api/health" }, 200, ch);
  }

  if (u.pathname === "/api/health" && request.method === "GET") {
    const keys = getGeminiKeys(env);
    return reply(
      {
        ok: true,
        timestamp: Date.now(),
        service: "ravio-api",
        geminiConfigured: keys.length > 0,
        fallbackGeminiConfigured: keys.length > 1,
        openRouterConfigured: !!getOpenRouterKey(env),
      },
      200,
      ch
    );
  }

  if (u.pathname === "/api/rss" && request.method === "GET") {
    const clientIp =
      request.headers.get("CF-Connecting-IP") ||
      String(request.headers.get("X-Forwarded-For") || "").split(",")[0].trim() ||
      "unknown";
    const wait = limit("rss:" + clientIp, 80, 300000);
    if (wait) {
      return reply({ error: "تعداد درخواست فید بیش از حد مجاز است." }, 429, {
        ...ch,
        "Retry-After": String(wait),
      });
    }
    try {
      const c = new AbortController();
      const timer = setTimeout(() => c.abort(), 12000);
      try {
        const r = await fetchFeed(u.searchParams.get("url") || "", c.signal);
        if (!r.ok) {
          await r.body?.cancel().catch(() => {});
          return reply({ error: "خطا در دریافت فید (" + r.status + ")" }, r.status, ch);
        }
        if (!rssType(r.headers.get("content-type"))) {
          await r.body?.cancel().catch(() => {});
          return reply({ error: "نوع محتوای پاسخ فید (XML/RSS) معتبر نیست." }, 415, ch);
        }
        const xml = await limitedText(r);
        if (!xmlLike(xml)) {
          return reply({ error: "محتوای دریافتی از آدرس فید ساختار XML/RSS معتبر ندارد." }, 415, ch);
        }
        return new Response(xml, {
          headers: {
            ...ch,
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      const msg = String(e?.message || "خطا در ارتباط با فید خبری");
      const status =
        e?.name === "AbortError"
          ? 504
          : /مجاز نیست|نامعتبر|غیرمجاز/.test(msg)
            ? 400
            : 502;
      return reply(
        {
          error: e?.name === "AbortError" ? "زمان انتظار برای دریافت فید خبری به پایان رسید." : msg,
        },
        status,
        ch
      );
    }
  }

  if (u.pathname === "/api/gemini/script" || u.pathname === "/api/gemini/tts") {
    if (request.method !== "POST") {
      return reply({ error: "Method Not Allowed" }, 405, { ...ch, Allow: "POST" });
    }
    const clientIp =
      request.headers.get("CF-Connecting-IP") ||
      String(request.headers.get("X-Forwarded-For") || "").split(",")[0].trim() ||
      "unknown";
    const wait = limit("gemini:" + clientIp, 25, 600000);
    if (wait) {
      return reply(
        { error: "تعداد درخواست‌ها بیش از حد مجاز است. لطفاً " + wait + " ثانیه دیگر تلاش کنید." },
        429,
        { ...ch, "Retry-After": String(wait) }
      );
    }
    const secret = (env.RAVIO_API_SECRET || "").trim();
    if (secret) {
      const bearer = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
      const alt = (request.headers.get("X-Ravio-Secret") || "").trim();
      if (bearer !== secret && alt !== secret) {
        return reply({ error: "کلید دسترسی سرور نامعتبر یا وارد نشده است." }, 401, ch);
      }
    }

    let body;
    try {
      if (Number(request.headers.get("content-length") || 0) > 2097152) {
        return reply({ error: "حجم درخواست بیش از حد مجاز است." }, 413, ch);
      }
      body = await request.json();
    } catch {
      return reply({ error: "بدنه درخواست JSON معتبر نیست." }, 400, ch);
    }

    try {
      const r = u.pathname.endsWith("/script") ? await makeScript(body, env) : await makeTts(body, env);
      const h = new Headers(r.headers);
      for (const [k, v] of Object.entries(ch)) h.set(k, v);
      return new Response(r.body, { status: r.status, headers: h });
    } catch (e) {
      if (e?.status === 503) {
        return reply({ error: "کلید GEMINI_API_KEY هنوز در Secretهای Worker تنظیم نشده است." }, 503, ch);
      }
      const m = mapped(e);
      return reply({ error: m.message }, m.status, ch);
    }
  }

  return reply({ error: "Not Found" }, 404, ch);
}

export async function handleRavioRequest(request, env) {
  return handle(request, env);
}

export default { fetch: handleRavioRequest };
