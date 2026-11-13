import {
  BroadcastTone,
  RawNewsItem,
  StructuredNewsCard,
  StudioSettings,
} from '../types/radio';
import { formatPersianBroadcastDateTime } from './fileSaveService';

export function buildBackendUrl(path: string, backendServerUrl?: string): string {
  const custom = (backendServerUrl || '').trim().replace(/\/+$/, '');
  if (custom) {
    return `${custom}${path}`;
  }
  const envUrl =
    typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_BACKEND_URL
      ? (import.meta as unknown as { env: Record<string, string> }).env.VITE_BACKEND_URL.trim().replace(/\/+$/, '')
      : '';
  return envUrl ? `${envUrl}${path}` : path;
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
    const res = await fetch(buildBackendUrl('/api/gemini/script', settings.backendServerUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items,
        categoryLabel,
        tone: settings.broadcastTone,
        model: settings.geminiModel,
        generatedAtLabel,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'خطا در تولید متن رادیویی با Gemini');
    }

    return {
      broadcastTitle: data.broadcastTitle || `بخش خبری ${categoryLabel}`,
      script: data.script || '',
      cards: mergeCardsWithRaw(items, Array.isArray(data.cards) ? data.cards : []),
    };
  }

  // OpenRouter or Custom OpenAI-Compatible API
  const isOpenRouter = settings.aiProvider === 'openrouter';
  const endpoint = isOpenRouter
    ? 'https://openrouter.ai/api/v1/chat/completions'
    : `${settings.customBaseUrl.replace(/\/+$/, '')}/chat/completions`;
  const apiKey = isOpenRouter ? settings.openRouterApiKey.trim() : settings.customApiKey.trim();
  const model = isOpenRouter ? settings.openRouterModel.trim() : settings.customModel.trim();

  if (!apiKey) {
    throw new Error(
      isOpenRouter
        ? 'کلید API سرویس OpenRouter در بخش تنظیمات وارد نشده است.'
        : 'کلید API سرویس سفارشی در بخش تنظیمات وارد نشده است.'
    );
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

  if (isOpenRouter) {
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'Radio Khabar Hoshmand';
  }

  const response = await fetch(endpoint, {
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
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errMsg = payload?.error?.message || `خطای سرویس هوش مصنوعی (${response.status})`;
    throw new Error(errMsg);
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
  const res = await fetch(buildBackendUrl('/api/gemini/tts', backendServerUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voiceName, model }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'خطا در تبدیل متن به گفتار');
  }

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
