import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI, Type } from "@google/genai";
import {
  formatGeminiServerError,
  isAllowedCorsOrigin,
  isAllowedRssContentType,
  isLikelyXmlFeedBody,
  preparePersianTextForTts,
  SlidingWindowRateLimiter,
  validateExternalFeedUrl,
} from "./serverUtils.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const MAX_RSS_BYTES = 2 * 1024 * 1024; // 2 MB cap for RSS/Atom XML responses
const MAX_GEMINI_ITEMS = 20;
const MAX_TTS_CHARS = 12000;

const geminiRateLimiter = new SlidingWindowRateLimiter(25, 10 * 60_000);
const rssRateLimiter = new SlidingWindowRateLimiter(80, 5 * 60_000);

function getGeminiClient(apiVersion?: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("کلید GEMINI_API_KEY در تنظیمات سرور تعریف نشده است.");
  }
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function extractPcmFromWavOrRaw(buf: Buffer): Buffer {
  if (
    buf.length > 44 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WAVE"
  ) {
    // Find the "data" subchunk
    let offset = 12;
    while (offset + 8 <= buf.length) {
      const chunkId = buf.subarray(offset, offset + 4).toString("ascii");
      const chunkSize = buf.readUInt32LE(offset + 4);
      if (chunkId === "data") {
        const start = offset + 8;
        const end = Math.min(buf.length, start + chunkSize);
        return buf.subarray(start, end);
      }
      offset += 8 + chunkSize + (chunkSize % 2);
    }
    return buf.subarray(44);
  }
  return buf;
}

function buildWavHeader(pcmLength: number, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (PCM)
  header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmLength, 40);
  return header;
}

function splitTextForTts(text: string, maxChars = 2200): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return [cleaned];

  const sentences = cleaned.split(/(?<=[.!?؟۔\n])\s+/);
  const chunks: string[] = [];
  let current = "";

  for (const s of sentences) {
    if ((current + " " + s).trim().length > maxChars) {
      if (current.trim()) {
        chunks.push(current.trim());
        current = "";
      }
      if (s.length > maxChars) {
        // Hard wrap extremely long sentence
        for (let i = 0; i < s.length; i += maxChars) {
          chunks.push(s.slice(i, i + maxChars));
        }
      } else {
        current = s;
      }
    } else {
      current = (current + " " + s).trim();
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [cleaned];
}

async function readTextWithLimit(response: globalThis.Response, maxBytes: number): Promise<string> {
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const declared = Number(contentLengthHeader);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new Error("حجم فید خبری بیش از حد مجاز است.");
    }
  }

  if (!response.body) {
    const txt = await response.text();
    if (Buffer.byteLength(txt, "utf8") > maxBytes) {
      throw new Error("حجم فید خبری بیش از حد مجاز است.");
    }
    return txt;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error("حجم فید خبری بیش از حد مجاز (۲ مگابایت) است.");
      }
      chunks.push(value);
    }
  }

  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

async function fetchSafeRssFeed(initialUrl: string, signal: AbortSignal): Promise<globalThis.Response> {
  let currentUrl = (await validateExternalFeedUrl(initialUrl)).toString();

  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(currentUrl, {
      signal,
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RavioNewsBot/1.0)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => {});
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("تغییر مسیر نامعتبر در فید خبری.");
      }
      const nextUrl = new URL(location, currentUrl).toString();
      currentUrl = (await validateExternalFeedUrl(nextUrl)).toString();
      continue;
    }

    return response;
  }

  throw new Error("تعداد تغییر مسیرهای آدرس فید بیش از حد مجاز است.");
}

function getClientIp(req: express.Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

async function startServer() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "2mb" }));

  // Scoped CORS policy: allows same-origin, configured ALLOWED_ORIGINS, and Capacitor APK WebViews
  app.use("/api", (req, res, next) => {
    const origin = req.headers.origin;
    const reqHost = req.headers.host;
    const allowed = isAllowedCorsOrigin(
      origin,
      reqHost,
      process.env.ALLOWED_ORIGINS,
      process.env.APP_URL
    );

    res.setHeader("Vary", "Origin");
    if (origin && allowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Ravio-Secret");
    }

    if (req.method === "OPTIONS") {
      res.status(allowed ? 204 : 403).end();
      return;
    }

    if (origin && !allowed) {
      res.status(403).json({ error: "دسترسی از این مبدأ (Origin) مجاز نیست." });
      return;
    }

    next();
  });

  // Optional API secret + per-IP rate limiting for Gemini endpoints
  app.use("/api/gemini", (req, res, next) => {
    const requiredSecret = (process.env.RAVIO_API_SECRET || "").trim();
    if (requiredSecret) {
      const authHeader = String(req.headers.authorization || "");
      const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      const altHeader = String(req.headers["x-ravio-secret"] || "").trim();
      if (bearer !== requiredSecret && altHeader !== requiredSecret) {
        res.status(401).json({ error: "کلید دسترسی سرور نامعتبر یا وارد نشده است." });
        return;
      }
    }

    const rate = geminiRateLimiter.consume(`gemini:${getClientIp(req)}`);
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfterSec));
      res.status(429).json({
        error: `تعداد درخواست‌ها بیش از حد مجاز است. لطفاً ${rate.retryAfterSec} ثانیه دیگر تلاش کنید.`,
      });
      return;
    }

    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // Server-side RSS fetch fallback with SSRF + redirect + response size protection
  app.get("/api/rss", async (req, res) => {
    const rate = rssRateLimiter.consume(`rss:${getClientIp(req)}`);
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfterSec));
      res.status(429).json({ error: "تعداد درخواست فید بیش از حد مجاز است." });
      return;
    }

    const rawUrl = String(req.query.url || "");
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetchSafeRssFeed(rawUrl, controller.signal);
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          res.status(response.status).json({ error: `خطا در دریافت فید (${response.status})` });
          return;
        }
        const upstreamType = response.headers.get("content-type");
        if (!isAllowedRssContentType(upstreamType)) {
          await response.body?.cancel().catch(() => {});
          res.status(415).json({ error: "نوع محتوای پاسخ فید (XML/RSS) معتبر نیست." });
          return;
        }
        const xmlText = await readTextWithLimit(response, MAX_RSS_BYTES);
        if (!isLikelyXmlFeedBody(xmlText)) {
          res.status(415).json({ error: "محتوای دریافتی از آدرس فید ساختار XML/RSS معتبر ندارد." });
          return;
        }
        res.setHeader("Content-Type", "application/xml; charset=utf-8");
        res.send(xmlText);
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        res.status(504).json({ error: "زمان انتظار برای دریافت فید خبری به پایان رسید." });
        return;
      }
      const message = err instanceof Error ? err.message : "خطا در ارتباط با فید خبری";
      const status =
        message.includes("مجاز نیست") || message.includes("نامعتبر") || message.includes("غیرمجاز")
          ? 400
          : 502;
      res.status(status).json({ error: message });
    }
  });

  // Server-side Gemini Script Generation
  app.post("/api/gemini/script", async (req, res) => {
    try {
      const { items, categoryLabel, tone, model, generatedAtLabel } = req.body as {
        items: Array<{ id: string; title: string; description: string; source: string; link: string; pubDate: string }>;
        categoryLabel: string;
        tone: string;
        model?: string;
        generatedAtLabel?: string;
      };

      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: "هیچ خبری برای پردازش ارسال نشده است." });
        return;
      }

      const boundedItems = items.slice(0, MAX_GEMINI_ITEMS).map((it) => ({
        id: String(it.id || "").slice(0, 120),
        title: String(it.title || "").slice(0, 350),
        description: String(it.description || "").slice(0, 700),
        source: String(it.source || "").slice(0, 120),
        link: String(it.link || "").slice(0, 500),
        pubDate: String(it.pubDate || "").slice(0, 80),
      }));

      const ai = getGeminiClient();

      const resolvedTimeLabel =
        (generatedAtLabel && generatedAtLabel.trim()) ||
        new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date());

      const toneGuide =
        tone === "fast_brief"
          ? "لحن سریع، موجز و تیترمحور مثل بولتن خبری کوتاه رادیویی (حدود ۶۰ تا ۹۰ ثانیه خوانش)."
          : tone === "analytical"
            ? "لحن تحلیلی، عمیق و حرفه‌ای با توضیح پیامدهای خبرها و ارتباط خبرها به یکدیگر."
            : "لحن گرم، صمیمی، حرفه‌ای و پرانرژی یک گوینده رادیوی صبحگاهی ایرانی با سلام و خوش‌آمدگویی و خداحافظی طبیعی.";

      const systemInstruction = `شما سردبیر و گوینده حرفه‌ای رادیوی هوشمند «راویو» (Ravio) هستید.
وظیفه شما دریافت تیترها و خلاصه‌های خام خبری (به انگلیسی یا فارسی) و تبدیل آن‌ها به یک بخش خبری رادیویی یکپارچه به زبان فارسی معیار، روان، خوش‌خوان و بدون هیچ غلط نگارشی است.
قوانین مهم:
1. در همان جمله اولِ اسکریپت رادیویی، حتماً تاریخ و ساعت دقیق تهیه این بخش خبری (${resolvedTimeLabel}) را به‌صورت طبیعی و روان به فارسی اعلام کنید تا شنونده بداند خبر مربوط به چه روز و چه ساعتی است (مثلاً: «سلام و وقت بخیر، امروز ${resolvedTimeLabel}، با بخش خبری راویو همراه شما هستیم.»).
2. تمام خبرهای انگلیسی را به فارسی طبیعی و روزنامه‌نگارانه ترجمه و بازنویسی کنید.
3. برای جلوگیری از تلفظ غلط موتور صوتی (TTS): هیچ کلمه، مخفف یا عدد انگلیسی/لاتین در متن اسکریپت (script) ننویسید؛ تمام نام‌های خارجی و مخفف‌ها را به فارسی خوش‌خوان آوانگاری کنید (مثلاً: AI -> هوش مصنوعی، BBC -> بی‌بی‌سی، CENTCOM -> سِنت‌کام، ADNOC -> اَدنوک). درصدها، واحد پول و اعداد را خوانا و فارسی بنویسید (مثلاً «۱۲ درصد»). روی واژه‌های فارسی دوپهلو (مثل بُعد، شَرکت، مُلک، سِمت) یا نام‌های ناآشنا اعراب کوتاه راهنما (فتحه/کسره/ضمه) بگذارید و نیم‌فاصله استاندارد (مثل «تازه‌ترین»، «می‌کنیم»، «منطقه‌ای») را حفظ کنید.
4. خبرهای مرتبط را در کنار هم دسته‌بندی کنید و بین بخش‌ها جملات ربط رادیویی بنویسید (مثل «اما در ادامه اخبار فناوری...»).
5. در متن اسکریپت رادیویی (script) از علائم مارک‌داون مثل * یا # یا ایموجی یا براکت یا پرانتز استفاده نکنید و جملات را کوتاه و خوش‌نفس با ویرگول فارسی (،) بنویسید.
6. سبک اجرا: ${toneGuide}
7. خروجی را دقیقاً مطابق اسکیما JSON برگردانید.`;

      const promptPayload = boundedItems
        .map(
          (item, index) =>
            `[${index + 1}] ID: ${item.id}\nSource: ${item.source}\nDate: ${item.pubDate}\nTitle: ${item.title}\nSummary: ${item.description}\nLink: ${item.link}`
        )
        .join("\n\n");

      const requestedModel = model || "gemini-2.5-flash";
      const candidateModels = [requestedModel, "gemini-4-hydrogen", "gemini-3.1-flash-lite"].filter(
        (v, i, a) => a.indexOf(v) === i
      );

      let lastError: unknown = null;
      for (const targetModel of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model: targetModel,
            contents: `دسته‌بندی: ${categoryLabel}\nتاریخ و ساعت تهیه خبر: ${resolvedTimeLabel}\n\nلیست خبرهای خام:\n${promptPayload}`,
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  broadcastTitle: {
                    type: Type.STRING,
                    description: "عنوان کوتاه فارسی برای این بخش خبری رادیویی",
                  },
                  script: {
                    type: Type.STRING,
                    description:
                      "متن کامل و یکپارچه گوینده رادیو به زبان فارسی روان بدون کاراکترهای مارک‌داون یا ایموجی",
                  },
                  cards: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        persianTitle: { type: Type.STRING },
                        persianSummary: { type: Type.STRING },
                        topic: { type: Type.STRING },
                      },
                      required: ["id", "persianTitle", "persianSummary", "topic"],
                    },
                  },
                },
                required: ["broadcastTitle", "script", "cards"],
              },
            },
          });

          const rawJson = (response.text ?? "{}").trim();
          const parsed = JSON.parse(rawJson);
          res.json({ ...parsed, modelUsed: targetModel });
          return;
        } catch (err) {
          lastError = err;
          const msg = err instanceof Error ? err.message : String(err);
          // Fallback to next candidate model only on model-not-found / unsupported errors
          if (msg.includes("404") || msg.includes("NOT_FOUND") || msg.includes("not found")) {
            continue;
          }
          throw err;
        }
      }

      throw lastError ?? new Error("تولید متن رادیویی با خطا مواجه شد.");
    } catch (err) {
      const mapped = formatGeminiServerError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  // Server-side Gemini TTS (returns a valid downloadable audio/wav file)
  app.post("/api/gemini/tts", async (req, res) => {
    try {
      const { text, voiceName = "Kore", model = "gemini-2.5-flash-preview-tts" } = req.body as {
        text: string;
        voiceName?: string;
        model?: string;
      };

      if (!text || !text.trim()) {
        res.status(400).json({ error: "متنی برای تبدیل به گفتار ارسال نشده است." });
        return;
      }
      if (text.length > MAX_TTS_CHARS) {
        res.status(400).json({ error: "طول متن ارسالی بیش از حد مجاز است." });
        return;
      }

      const ai = getGeminiClient("v1beta");
      const preparedText = preparePersianTextForTts(text);
      const chunks = splitTextForTts(preparedText, 2200);
      const candidateModels = [model, "gemini-3.8-flash-lite-tts", "gemini-2.5-flash-preview-tts"].filter(
        (v, i, a) => a.indexOf(v) === i
      );

      let activeModel = candidateModels[0];
      const pcmBuffers: Buffer[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];
        let synthesizedChunk: Buffer | null = null;
        let lastErr: unknown = null;

        for (const tryModel of i === 0 ? candidateModels : [activeModel]) {
          try {
            const isGemini38 = tryModel.includes("3.8");
            const parts = isGemini38
              ? [
                  {
                    text: chunkText,
                    speechMetadata: {
                      style:
                        "Clear, warm, fluent Iranian morning radio news anchor speaking standard Persian with accurate ezafe, natural comma pauses, and correct pronunciation of Persian and transliterated names",
                    },
                  },
                ]
              : [
                  {
                    text: `این متن خبری را به زبان فارسی معیار، با تلفظ دقیق واژه‌های فارسی و اسامی خارجی، رعایت کامل کسره اضافه، مکث طبیعی روی ویرگول‌ها و لحن شفاف و گرم یک گوینده حرفه‌ای رادیو بخوان:\n\n${chunkText}`,
                  },
                ];

            const response = await ai.models.generateContent({
              model: tryModel,
              contents: [{ role: "user", parts }],
              config: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName,
                    },
                  },
                },
              },
            });

            const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (!base64Audio) {
              throw new Error("پاسخ صوتی خالی از مدل دریافت شد.");
            }

            const rawBuf = Buffer.from(base64Audio, "base64");
            synthesizedChunk = extractPcmFromWavOrRaw(rawBuf);
            activeModel = tryModel;
            break;
          } catch (err) {
            lastErr = err;
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("404") || msg.includes("NOT_FOUND") || msg.includes("not found") || msg.includes("400")) {
              continue;
            }
            throw err;
          }
        }

        if (!synthesizedChunk) {
          throw lastErr ?? new Error("تولید فایل صوتی ناموفق بود.");
        }
        pcmBuffers.push(synthesizedChunk);
      }

      const fullPcm = Buffer.concat(pcmBuffers);
      const wavHeader = buildWavHeader(fullPcm.length, 24000, 1, 16);
      const finalWav = Buffer.concat([wavHeader, fullPcm]);

      res.json({
        audioBase64: finalWav.toString("base64"),
        mimeType: "audio/wav",
        modelUsed: activeModel,
        voiceName,
      });
    } catch (err) {
      const mapped = formatGeminiServerError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: "spa",
    });

    // HMR is disabled in AI Studio; Vite 8's built-in @vite/client still attempts
    // a WebSocket connection in middlewareMode unless intercepted here.
    app.get("/@vite/client", (_req, res) => {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.send(`import "/node_modules/vite/dist/client/env.mjs";
const sheetsMap = new Map();
const linkSheetsMap = new Map();
if (typeof document !== "undefined") {
  document.querySelectorAll("style[data-vite-dev-id]").forEach((el) => {
    sheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
  document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id]').forEach((el) => {
    linkSheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
}
let lastInsertedStyle;
export function updateStyle(id, content) {
  if (linkSheetsMap.has(id)) return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("type", "text/css");
    style.setAttribute("data-vite-dev-id", id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => { lastInsertedStyle = undefined; }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement("afterend", style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  if (linkSheetsMap.has(id)) {
    document.querySelectorAll(\`link[rel="stylesheet"][data-vite-dev-id="\${CSS.escape(id)}"]\`).forEach((el) => el.remove());
    linkSheetsMap.delete(id);
  }
  const style = sheetsMap.get(id);
  if (style) {
    style.remove();
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  const noop = () => {};
  return {
    data: {},
    accept: noop,
    acceptExports: noop,
    dispose: noop,
    prune: noop,
    decline: noop,
    invalidate: noop,
    on: noop,
    off: noop,
    send: noop,
  };
}
export function injectQuery(url, queryToInject) {
  if (url[0] !== "." && url[0] !== "/") return url;
  const pathname = url.replace(/[?#].*$/, "");
  const { search, hash } = new URL(url, "http://vite.dev");
  return \`\${pathname}?\${queryToInject}\${search ? "&" + search.slice(1) : ""}\${hash || ""}\`;
}
const BaseEl = typeof HTMLElement !== "undefined" ? HTMLElement : class {};
export class ErrorOverlay extends BaseEl {
  close() { if (this.remove) this.remove(); }
}
`);
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) {
        next();
        return;
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Radio Khabar Hoshmand server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
