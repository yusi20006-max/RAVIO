import {
  BroadcastTone,
  RawNewsItem,
  StructuredNewsCard,
  StudioSettings,
} from '../types/radio';
import { formatPersianBroadcastDateTime } from './fileSaveService';

export function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  if (win.Capacitor?.isNativePlatform?.()) return true;
  if (window.location.protocol === 'capacitor:' || window.location.protocol === 'file:') {
    return true;
  }
  return window.location.hostname === 'localhost' && window.location.port === '';
}

export function resolveBackendBaseUrl(backendServerUrl?: string): string {
  let custom = (backendServerUrl || '').trim().replace(/\/+$/, '');
  if (custom) {
    if (!/^https?:\/\//i.test(custom)) {
      custom = `https://${custom}`;
    }
    return custom;
  }
  const envUrl =
    typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_BACKEND_URL
      ? (import.meta as unknown as { env: Record<string, string> }).env.VITE_BACKEND_URL
          .trim()
          .replace(/\/+$/, '')
      : '';
  return envUrl;
}

export function hasConfiguredBackend(backendServerUrl?: string): boolean {
  return Boolean(resolveBackendBaseUrl(backendServerUrl));
}

export function buildBackendUrl(path: string, backendServerUrl?: string): string {
  const base = resolveBackendBaseUrl(backendServerUrl);
  return base ? `${base}${path}` : path;
}

export const MISSING_APK_BACKEND_MESSAGE =
  'در نسخه APK اندروید، برای استفاده از سرور هوشمند ابتدا در «تنظیمات ← ۱. هوش مصنوعی و اتصال سرور» آدرس سرور برنامه را وارد کنید، یا «حالت آفلاین مستقل» / کلید OpenRouter را فعال نمایید.';

export async function safeParseJsonResponse<T>(
  res: Response,
  fallbackError: string,
  usedCustomBackend: boolean
): Promise<T> {
  const rawText = await res.text();
  const trimmed = rawText.trim();

  if (trimmed.startsWith('<')) {
    if (isCapacitorNative() && !usedCustomBackend) {
      throw new Error(MISSING_APK_BACKEND_MESSAGE);
    }
    throw new Error(
      'پاسخ دریافتی از سرور معتبر نیست (به‌جای JSON صفحه HTML دریافت شد). لطفاً آدرس سرور را در تنظیمات بررسی کنید یا از دسترس‌پذیر بودن عمومی سرور مطمئن شوید.'
    );
  }

  let data: T & { error?: string };
  try {
    data = JSON.parse(trimmed || '{}') as T & { error?: string };
  } catch {
    throw new Error(fallbackError);
  }

  if (!res.ok) {
    throw new Error(data.error || fallbackError);
  }

  return data;
}

export function formatClientAiError(err: unknown, status?: number): string {
  const raw = err instanceof Error ? err.message : String(err || '');
  const lower = raw.toLowerCase();

  if ((err instanceof Error && err.name === 'AbortError') || lower.includes('timeout')) {
    return 'زمان انتظار برای پاسخ سرویس هوش مصنوعی به پایان رسید (Timeout). لطفاً دوباره تلاش کنید.';
  }

  if (
    status === 401 ||
    status === 403 ||
    lower.includes('invalid api key') ||
    lower.includes('incorrect api key') ||
    lower.includes('unauthorized')
  ) {
    return 'کلید API یا مجوز دسترسی نامعتبر است (خطای احراز هویت). لطفاً کلید خود را در تنظیمات بررسی کنید.';
  }

  if (status === 402 || status === 429 || lower.includes('quota') || lower.includes('rate limit')) {
    return 'سهمیه یا محدودیت تعداد درخواست‌های سرویس هوش مصنوعی تکمیل شده است (Quota/Rate Limit). چند لحظه بعد تلاش کنید.';
  }

  if (
    (err instanceof TypeError &&
      (lower.includes('fetch') || lower.includes('network') || lower.includes('load failed'))) ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror')
  ) {
    return 'اتصال به سرویس هوش مصنوعی برقرار نشد. وضعیت اینترنت یا آدرس سرور را بررسی کنید.';
  }

  return raw || 'خطای غیرمنتظره در ارتباط با سرویس هوش مصنوعی';
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    throw new Error(formatClientAiError(err));
  } finally {
    clearTimeout(timer);
  }
}

export interface GeneratedBroadcastResult {
  broadcastTitle: string;
  script: string;
  cards: StructuredNewsCard[];
}

function extractJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error('پاسخ مدل هوش مصنوعی در قالب JSON معتبر نبود.');
  }
}

function buildOpenAIPrompt(
  items: RawNewsItem[],
  categoryLabel: string,
  tone: BroadcastTone,
  generatedAtLabel: string
) {
  const toneGuide =
    tone === 'fast_brief'
      ? 'لحن سریع، موجز و تیترمحور مثل بولتن خبری کوتاه رادیویی.'
      : tone === 'analytical'
        ? 'لحن تحلیلی، عمیق و حرفه‌ای با بررسی پیامدهای خبرها.'
        : 'لحن گرم، صمیمی، حرفه‌ای و پرانرژی یک گوینده رادیوی صبحگاهی ایرانی با سلام و خوش‌آمدگویی و خداحافظی طبیعی.';

  const systemPrompt = `شما سردبیر و گوینده حرفه‌ای رادیوی هوشمند «راویو» (Ravio) هستید.
تمام تیترها و خلاصه‌های خام را (اگر انگلیسی هستند به فارسی روان و طبیعی ترجمه کنید) به یک اسکریپت رادیویی یکپارچه و جذاب به زبان فارسی تبدیل کنید.
نکته بسیار مهم آغاز خبر: در همان جمله اولِ اسکریپت رادیویی، حتماً تاریخ و ساعت دقیق تهیه این بخش خبری (${generatedAtLabel}) را به‌صورت طبیعی و روان به فارسی اعلام کنید تا شنونده بداند این خبر مربوط به چه روز و چه ساعتی است (مثلاً: «سلام و وقت بخیر، امروز ${generatedAtLabel}، با بخش خبری راویو همراه شما هستیم.»).
قوانین تلفظ درست گوینده (TTS): هیچ کلمه، مخفف یا عدد انگلیسی/لاتین در متن اسکریپت (script) ننویسید؛ نام‌های خارجی و مخفف‌ها را به فارسی خوش‌خوان آوانگاری کنید (مثلاً AI -> هوش مصنوعی، BBC -> بی‌بی‌سی، CENTCOM -> سِنت‌کام). اعداد، درصدها و ارزها را خوانا بنویسید و روی کلمات هم‌نگاره یا ناآشنا اعراب کوتاه راهنما (فتحه/کسره/ضمه) و نیم‌فاصله استاندارد بگذارید.
خبرهای مرتبط را در کنار هم دسته‌بندی کنید و بین آن‌ها جملات ربط رادیویی بنویسید.
در متن اسکریپت (script) از علائم مارک‌داون مثل * یا # یا ایموجی یا پرانتز استفاده نکنید تا موتور صوتی متن را روان بخواند.
سبک اجرا: ${toneGuide}

خروجی باید دقیقاً یک آبجکت JSON معتبر با این ساختار باشد:
{
  "broadcastTitle": "عنوان کوتاه فارسی بخش خبری",
  "script": "متن کامل و یکپارچه گوینده رادیو به زبان فارسی",
  "cards": [
    {
      "id": "شناسه عین ورودی",
      "persianTitle": "تیتر فارسی",
      "persianSummary": "خلاصه دو خطی فارسی",
      "topic": "موضوع کوتاه مثل هوش مصنوعی یا اقتصاد"
    }
  ]
}`;

  const userContent = `دسته‌بندی: ${categoryLabel}\nتاریخ و ساعت تهیه بخش خبری: ${generatedAtLabel}\n\nلیست خبرهای خام:\n${items
    .map(
      (item, idx) =>
        `[${idx + 1}] ID: ${item.id}\nSource: ${item.source}\nDate: ${item.pubDate}\nTitle: ${item.title}\nSummary: ${item.description}`
    )
    .join('\n\n')}`;

  return { systemPrompt, userContent };
}

function mergeCardsWithRaw(
  rawItems: RawNewsItem[],
  aiCards: Array<{ id?: string; persianTitle?: string; persianSummary?: string; topic?: string }>
): StructuredNewsCard[] {
  return rawItems.map((raw, idx) => {
    const matched = aiCards.find((c) => c.id === raw.id) || aiCards[idx];
    return {
      id: raw.id,
      originalTitle: raw.title,
      source: raw.source,
      link: raw.link,
      pubDate: raw.pubDate,
      persianTitle: matched?.persianTitle?.trim() || raw.title,
      persianSummary: matched?.persianSummary?.trim() || raw.description || raw.title,
      topic: matched?.topic?.trim() || 'خبر روز',
    };
  });
}

function buildOfflineBroadcast(
  items: RawNewsItem[],
  categoryLabel: string,
  generatedAtLabel: string
): GeneratedBroadcastResult {
  const intro = `سلام و وقت بخیر به شنوندگان رادیو راویو. امروز ${generatedAtLabel}، در این بخش آفلاین، مروری داریم بر تازه‌ترین تیترهای ${categoryLabel}.`;
  const body = items
    .map((item, idx) => {
      const desc = item.description ? ` ${item.description}` : '';
      return `خبر ${idx + 1} از ${item.source}: ${item.title}.${desc}`;
    })
    .join('\n\n');
  const outro = 'این بود مرور خبرهای دریافتی در حالت آفلاین. سفر ایمن و روز خوشی برای شما آرزو می‌کنیم.';

  const cards: StructuredNewsCard[] = items.map((item) => ({
    id: item.id,
    originalTitle: item.title,
    source: item.source,
    link: item.link,
    pubDate: item.pubDate,
    persianTitle: item.title,
    persianSummary: item.description || 'متن خلاصه در دسترس نیست. برای مطالعه کامل روی لینک منبع کلیک کنید.',
    topic: categoryLabel,
  }));

  return {
    broadcastTitle: `مرور آفلاین ${categoryLabel}`,
    script: `${intro}\n\n${body}\n\n${outro}`,
    cards,
  };
}

export async function generateRadioScript(
  items: RawNewsItem[],
  categoryLabel: string,
  settings: StudioSettings,
  generatedAtTimestamp = Date.now()
): Promise<GeneratedBroadcastResult> {
  const { fullLabel: generatedAtLabel } = formatPersianBroadcastDateTime(generatedAtTimestamp);

  if (settings.aiProvider === 'offline') {
    return buildOfflineBroadcast(items, categoryLabel, generatedAtLabel);
  }

  if (settings.aiProvider === 'gemini') {
    const hasBackend = hasConfiguredBackend(settings.backendServerUrl);
    if (isCapacitorNative() && !hasBackend) {
      throw new Error(MISSING_APK_BACKEND_MESSAGE);
    }

    const res = await fetchWithTimeout(
      buildBackendUrl('/api/gemini/script', settings.backendServerUrl),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          categoryLabel,
          tone: settings.broadcastTone,
          model: settings.geminiModel,
          generatedAtLabel,
        }),
      },
      60_000
    );

    const data = await safeParseJsonResponse<{
      broadcastTitle?: string;
      script?: string;
      cards?: Array<{ id?: string; persianTitle?: string; persianSummary?: string; topic?: string }>;
    }>(res, 'خطا در تولید متن رادیویی با Gemini', hasBackend);

    return {
      broadcastTitle: data.broadcastTitle || `بخش خبری ${categoryLabel}`,
      script: data.script || '',
      cards: mergeCardsWithRaw(items, Array.isArray(data.cards) ? data.cards : []),
    };
  }

  // OpenRouter or Custom OpenAI-Compatible API
  const isOpenRouter = settings.aiProvider === 'openrouter';
  let customBase = '';
  if (!isOpenRouter) {
    customBase = settings.customBaseUrl.trim().replace(/\/+$/, '');
    let parsedCustom: URL;
    try {
      parsedCustom = new URL(customBase);
    } catch {
      throw new Error('آدرس Base URL سرویس سفارشی معتبر نیست.');
    }
    if (parsedCustom.protocol !== 'http:' && parsedCustom.protocol !== 'https:') {
      throw new Error('آدرس Base URL سرویس سفارشی باید با HTTP یا HTTPS آغاز شود.');
    }
  }

  const endpoint = isOpenRouter
    ? 'https://openrouter.ai/api/v1/chat/completions'
    : `${customBase}/chat/completions`;
  const apiKey = isOpenRouter ? settings.openRouterApiKey.trim() : settings.customApiKey.trim();
  const model = isOpenRouter ? settings.openRouterModel.trim() : settings.customModel.trim();

  if (!apiKey) {
    throw new Error(
      isOpenRouter
        ? 'کلید API سرویس OpenRouter در بخش تنظیمات وارد نشده است.'
        : 'کلید API سرویس سفارشی در بخش تنظیمات وارد نشده است.'
    );
  }
  if (!model) {
    throw new Error('شناسه مدل هوش مصنوعی در بخش تنظیمات مشخص نشده است.');
  }

  const { systemPrompt, userContent } = buildOpenAIPrompt(
    items,
    categoryLabel,
    settings.broadcastTone,
    generatedAtLabel
  );

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  if (isOpenRouter && typeof window !== 'undefined' && window.location?.origin) {
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'Ravio News Radio';
  }

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.5,
      }),
    },
    45_000
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const rawErrMsg = payload?.error?.message || `خطای سرویس هوش مصنوعی (${response.status})`;
    throw new Error(formatClientAiError(new Error(rawErrMsg), response.status));
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('پاسخی از مدل هوش مصنوعی دریافت نشد.');
  }

  const parsed = extractJsonObject(content) as {
    broadcastTitle?: string;
    script?: string;
    cards?: Array<{ id?: string; persianTitle?: string; persianSummary?: string; topic?: string }>;
  };

  return {
    broadcastTitle: parsed.broadcastTitle || `بخش خبری ${categoryLabel}`,
    script: parsed.script || '',
    cards: mergeCardsWithRaw(items, Array.isArray(parsed.cards) ? parsed.cards : []),
  };
}

export async function synthesizeGeminiAudio(
  text: string,
  voiceName: string,
  model: string,
  backendServerUrl?: string
): Promise<{ blob: Blob; mimeType: string }> {
  const hasBackend = hasConfiguredBackend(backendServerUrl);
  if (isCapacitorNative() && !hasBackend) {
    throw new Error(MISSING_APK_BACKEND_MESSAGE);
  }

  const res = await fetchWithTimeout(
    buildBackendUrl('/api/gemini/tts', backendServerUrl),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voiceName, model }),
    },
    90_000
  );

  const data = await safeParseJsonResponse<{
    audioBase64: string;
    mimeType?: string;
  }>(res, 'خطا در تبدیل متن به گفتار', hasBackend);

  const binaryStr = atob(data.audioBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const mimeType = data.mimeType || 'audio/wav';
  return {
    blob: new Blob([bytes], { type: mimeType }),
    mimeType,
  };
}
