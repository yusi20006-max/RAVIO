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
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
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
    if (ip === "::" || ip === "::1") return true;
    // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
    if (ip.startsWith("::ffff:")) {
      const mapped = ip.slice(7);
      if (net.isIPv4(mapped)) {
        return isPrivateOrReservedIp(mapped);
      }
      const hexParts = mapped.split(":");
      if (hexParts.length === 2) {
        const hi = parseInt(hexParts[0], 16);
        const lo = parseInt(hexParts[1], 16);
        if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
          const v4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
          return isPrivateOrReservedIp(v4);
        }
      }
    }
    // Unique local (fc00::/7) and link-local (fe80::/10) and multicast (ff00::/8)
    if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
    if (ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb")) return true;
    if (ip.startsWith("ff")) return true;
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
