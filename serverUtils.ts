import { lookup } from "node:dns/promises";
import net from "node:net";

const ACRONYM_TO_PERSIAN: Array<[RegExp, string]> = [
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

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function toPersianDigits(str: string): string {
  return str.replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d);
}

export function preparePersianTextForTts(raw: string): string {
  let out = raw
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[*#_`[\]<>~|]/g, " ")
    .replace(/(\d+(?:[.,]\d+)?)\s*%/g, "$1 درصد")
    .replace(/\$\s*(\d+(?:[.,]\d+)?)/g, "$1 دلار")
    .replace(/€\s*(\d+(?:[.,]\d+)?)/g, "$1 یورو")
    .replace(/£\s*(\d+(?:[.,]\d+)?)/g, "$1 پوند")
    .replace(/\s*&\s*/g, " و ")
    .replace(/\.{2,}/g, ".")
    .replace(/[()«»"]/g, " ");

  for (const [pattern, replacement] of ACRONYM_TO_PERSIAN) {
    out = out.replace(pattern, replacement);
  }

  out = toPersianDigits(out)
    .replace(/\s+([،.؟!؛:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  return out;
}

const BLOCKED_HOSTNAMES = new Set([
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
]);

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isIpv4InCidr(ip: string, cidrBase: string, prefixLen: number): boolean {
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(cidrBase) & mask);
}

function parseIpv6Hextets(ip: string): number[] | null {
  const halves = ip.split("::");
  if (halves.length > 2) return null;

  const parseSegment = (segment: string): number[] | null => {
    if (!segment) return [];
    const tokens = segment.split(":");
    const out: number[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.includes(".")) {
        if (i !== tokens.length - 1 || !net.isIPv4(token)) return null;
        const v4 = token.split(".").map(Number);
        out.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/i.test(token)) return null;
        out.push(parseInt(token, 16));
      }
    }
    return out;
  };

  const left = parseSegment(halves[0]);
  if (!left) return null;

  if (halves.length === 1) {
    return left.length === 8 ? left : null;
  }

  const right = parseSegment(halves[1]);
  if (!right) return null;
  const missing = 8 - (left.length + right.length);
  if (missing < 1) return null;

  return [...left, ...Array<number>(missing).fill(0), ...right];
}

export function isPrivateOrReservedIp(ipRaw: string): boolean {
  let ip = ipRaw.trim().toLowerCase();
  if (ip.startsWith("[") && ip.endsWith("]")) {
    ip = ip.slice(1, -1);
  }
  const zoneIdx = ip.indexOf("%");
  if (zoneIdx !== -1) {
    ip = ip.slice(0, zoneIdx);
  }

  const version = net.isIP(ip);
  if (version === 4) {
    const blockedRanges: Array<[string, number]> = [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ];
    return blockedRanges.some(([base, len]) => isIpv4InCidr(ip, base, len));
  }

  if (version === 6) {
    const h = parseIpv6Hextets(ip);
    if (!h) return true;

    const allZeroPrefix6 = h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0;
    // Unspecified :: or loopback ::1
    if (allZeroPrefix6 && h[5] === 0 && h[6] === 0 && (h[7] === 0 || h[7] === 1)) {
      return true;
    }
    // IPv4-mapped ::ffff:0:0/96 or deprecated IPv4-compatible ::/96
    if (allZeroPrefix6 && (h[5] === 0xffff || h[5] === 0)) {
      const embeddedV4 = `${(h[6] >> 8) & 0xff}.${h[6] & 0xff}.${(h[7] >> 8) & 0xff}.${h[7] & 0xff}`;
      return isPrivateOrReservedIp(embeddedV4);
    }
    // NAT64 64:ff9b::/96
    if (h[0] === 0x0064 && h[1] === 0xff9b && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0) {
      const embeddedV4 = `${(h[6] >> 8) & 0xff}.${h[6] & 0xff}.${(h[7] >> 8) & 0xff}.${h[7] & 0xff}`;
      return isPrivateOrReservedIp(embeddedV4);
    }
    // Unique local fc00::/7
    if ((h[0] & 0xfe00) === 0xfc00) return true;
    // Link-local fe80::/10
    if ((h[0] & 0xffc0) === 0xfe80) return true;
    // Multicast ff00::/8
    if ((h[0] & 0xff00) === 0xff00) return true;
    // Documentation 2001:db8::/32
    if (h[0] === 0x2001 && h[1] === 0x0db8) return true;

    return false;
  }

  return true;
}

export function validateFeedUrlSyntax(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("آدرس فید نامعتبر است.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("فقط پروتکل‌های HTTP و HTTPS مجاز هستند.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("آدرس فید نباید شامل نام کاربری یا رمز عبور باشد.");
  }

  const host = parsed.hostname.toLowerCase();
  if (
    !host ||
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith(".local") ||
    host.endsWith(".localhost") ||
    host.endsWith(".localdomain") ||
    host.endsWith(".internal")
  ) {
    throw new Error("دسترسی به آدرس‌های داخلی یا محلی مجاز نیست.");
  }

  const strippedHost = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (net.isIP(strippedHost) !== 0 && isPrivateOrReservedIp(strippedHost)) {
    throw new Error("دسترسی به IPهای خصوصی یا رزروشده مجاز نیست.");
  }

  return parsed;
}

export async function validateExternalFeedUrl(rawUrl: string): Promise<URL> {
  const parsed = validateFeedUrlSyntax(rawUrl);
  const host = parsed.hostname.replace(/^\[|\]$/g, "");

  if (net.isIP(host) === 0) {
    let records: Array<{ address: string }>;
    try {
      records = await lookup(host, { all: true });
    } catch {
      throw new Error("نام دامنه فید خبری قابل شناسایی نیست.");
    }
    if (!records.length || records.some((r) => isPrivateOrReservedIp(r.address))) {
      throw new Error("آدرس فید به شبکه داخلی یا غیرمجاز متصل است.");
    }
  }

  return parsed;
}

const ALLOWED_RSS_MIME_TYPES = new Set([
  "application/rss+xml",
  "application/atom+xml",
  "application/xml",
  "text/xml",
  "application/rdf+xml",
  "text/plain",
]);

export function isAllowedRssContentType(contentTypeHeader: string | null | undefined): boolean {
  if (!contentTypeHeader || !contentTypeHeader.trim()) {
    return true;
  }
  const mime = contentTypeHeader.split(";")[0].trim().toLowerCase();
  return ALLOWED_RSS_MIME_TYPES.has(mime);
}

export function isLikelyXmlFeedBody(rawBody: string): boolean {
  const sample = rawBody.replace(/^\uFEFF/, "").trimStart().slice(0, 600).toLowerCase();
  if (!sample) return false;
  if (sample.startsWith("<!doctype html") || sample.startsWith("<html")) {
    return false;
  }
  return (
    sample.startsWith("<?xml") ||
    sample.includes("<rss") ||
    sample.includes("<feed") ||
    sample.includes("<rdf:rdf")
  );
}

export function formatGeminiServerError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err || "");
  const sanitized = raw
    .replace(/AIza[0-9A-Za-z_-]{20,}|sk-or-[0-9A-Za-z_-]{10,}/g, "[REDACTED]")
    .trim();
  const lower = sanitized.toLowerCase();

  if (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("api_key_invalid") ||
    lower.includes("api key not valid") ||
    lower.includes("permission_denied") ||
    lower.includes("gemini_api_key")
  ) {
    return {
      status: 401,
      message: "کلید API سرویس Gemini در تنظیمات سرور نامعتبر است یا تعریف نشده است.",
    };
  }

  if (
    lower.includes("429") ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota") ||
    lower.includes("rate limit")
  ) {
    return {
      status: 429,
      message: "سهمیه یا محدودیت نرخ درخواست سرویس Gemini تکمیل شده است. لطفاً کمی بعد تلاش کنید.",
    };
  }

  if (
    lower.includes("503") ||
    lower.includes("unavailable") ||
    lower.includes("high demand") ||
    lower.includes("overloaded")
  ) {
    return {
      status: 503,
      message: "مدل‌های هوش مصنوعی Gemini موقتاً با ترافیک بالا مواجه هستند؛ چند لحظه بعد دوباره تلاش کنید.",
    };
  }

  if (
    (err instanceof Error && err.name === "AbortError") ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("etimedout")
  ) {
    return {
      status: 504,
      message: "زمان انتظار برای پاسخ سرویس Gemini به پایان رسید.",
    };
  }

  return {
    status: 500,
    message: sanitized || "خطا در ارتباط با سرویس هوش مصنوعی Gemini",
  };
}

export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, number[]>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  consume(key: string, now = Date.now()): { allowed: boolean; retryAfterSec: number } {
    const cutoff = now - this.windowMs;
    const prev = this.buckets.get(key) ?? [];
    const active = prev.filter((ts) => ts > cutoff);

    if (active.length >= this.maxRequests) {
      const oldest = active[0];
      const retryAfterSec = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
      this.buckets.set(key, active);
      return { allowed: false, retryAfterSec };
    }

    active.push(now);
    this.buckets.set(key, active);

    // Occasional cleanup to avoid unbounded map growth
    if (this.buckets.size > 2000) {
      for (const [k, timestamps] of this.buckets.entries()) {
        if (timestamps.length === 0 || timestamps[timestamps.length - 1] <= cutoff) {
          this.buckets.delete(k);
        }
      }
    }

    return { allowed: true, retryAfterSec: 0 };
  }
}

export function isAllowedCorsOrigin(
  origin: string | undefined,
  requestHost: string | undefined,
  envAllowedOrigins?: string,
  appUrl?: string
): boolean {
  if (!origin) return true;

  const trimmedEnv = (envAllowedOrigins || "").trim();
  if (trimmedEnv === "*") return true;

  const builtInAllowed = new Set<string>([
    "https://localhost",
    "http://localhost",
    "capacitor://localhost",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);

  if (appUrl) {
    try {
      builtInAllowed.add(new URL(appUrl).origin);
    } catch {
      // Ignore malformed APP_URL
    }
  }

  if (trimmedEnv) {
    for (const entry of trimmedEnv.split(",")) {
      const clean = entry.trim().replace(/\/+$/, "");
      if (clean) builtInAllowed.add(clean);
    }
  }

  if (builtInAllowed.has(origin)) return true;

  if (requestHost) {
    try {
      if (new URL(origin).host === requestHost) return true;
    } catch {
      return false;
    }
  }

  return false;
}
