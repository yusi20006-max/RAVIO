import { FeedCategoryId, GeminiVoiceName, RssFeedSource, StudioSettings } from '../types/radio';

export const CATEGORY_OPTIONS: Array<{
  id: FeedCategoryId;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    id: 'tech_ai',
    label: 'تکنولوژی و هوش مصنوعی',
    shortLabel: 'فناوری و AI',
    description: 'تازه‌ترین خبرهای هوش مصنوعی، استارتاپ‌ها و دنیای فناوری',
  },
  {
    id: 'world',
    label: 'اخبار جهان',
    shortLabel: 'جهان',
    description: 'تیترهای برگزیده تحولات بین‌المللی و رویدادهای جهانی',
  },
  {
    id: 'economy',
    label: 'اقتصاد و بازار',
    shortLabel: 'اقتصاد',
    description: 'تحولات بازارهای مالی، کسب‌وکار، ارز و اقتصاد کلان',
  },
  {
    id: 'iran',
    label: 'ایران',
    shortLabel: 'ایران',
    description: 'مروری بر مهم‌ترین خبرهای روز ایران و منطقه',
  },
  {
    id: 'custom',
    label: 'فید سفارشی',
    shortLabel: 'سفارشی',
    description: 'فیدهای RSS اختصاصی اضافه شده توسط شما',
  },
];

export const DEFAULT_FEEDS: RssFeedSource[] = [
  {
    id: 'gn-tech-en',
    label: 'Google News — فناوری و هوش مصنوعی (بین‌المللی)',
    url: 'https://news.google.com/rss/search?q=Technology+OR+AI+OR+OpenAI+OR+Google&hl=en-US&gl=US&ceid=US:en',
    category: 'tech_ai',
    enabled: true,
  },
  {
    id: 'gn-tech-fa',
    label: 'گوگل نیوز — فناوری و هوش مصنوعی (فارسی)',
    url: 'https://news.google.com/rss/search?q=%D9%87%D9%88%D8%B4+%D9%85%D8%B5%D9%86%D9%88%D8%B9%DB%8C+OR+%D9%81%D9%86%D8%A7%D9%88%D8%B1%DB%8C&hl=fa&gl=IR&ceid=IR:fa',
    category: 'tech_ai',
    enabled: true,
  },
  {
    id: 'gn-world-en',
    label: 'Google News — سرخط اخبار جهان',
    url: 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en',
    category: 'world',
    enabled: true,
  },
  {
    id: 'gn-world-fa',
    label: 'گوگل نیوز — اخبار جهان (فارسی)',
    url: 'https://news.google.com/rss/search?q=%D8%A7%D8%AE%D8%A8%D8%A7%D8%B1+%D8%AC%D9%87%D8%A7%D9%86&hl=fa&gl=IR&ceid=IR:fa',
    category: 'world',
    enabled: true,
  },
  {
    id: 'gn-biz-en',
    label: 'Google News — اقتصاد و بازارهای جهانی',
    url: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en',
    category: 'economy',
    enabled: true,
  },
  {
    id: 'gn-biz-fa',
    label: 'گوگل نیوز — اقتصاد و بازار (فارسی)',
    url: 'https://news.google.com/rss/search?q=%D8%A7%D9%82%D8%AA%D8%B5%D8%A7%D8%AF+OR+%D8%A8%D9%88%D8%B1%D8%B3&hl=fa&gl=IR&ceid=IR:fa',
    category: 'economy',
    enabled: true,
  },
  {
    id: 'ir-economy-fa',
    label: 'اقتصاد ایران (تجارت‌نیوز و اقتصادنیوز)',
    url: 'https://news.google.com/rss/search?q=site%3Atejaratnews.com+OR+site%3Aeghtesadnews.com&hl=fa&gl=IR&ceid=IR:fa',
    category: 'economy',
    enabled: true,
  },
  {
    id: 'zoomit-tech-fa',
    label: 'زومیت — فناوری و دیجیتال (ایران)',
    url: 'https://www.zoomit.ir/feed/',
    category: 'tech_ai',
    enabled: true,
  },
  {
    id: 'bbc-persian',
    label: 'BBC فارسی (بی‌بی‌سی فارسی)',
    url: 'https://feeds.bbci.co.uk/persian/rss.xml',
    category: 'iran',
    enabled: true,
  },
  {
    id: 'gn-iran-fa',
    label: 'گوگل نیوز — اخبار ایران (فارسی)',
    url: 'https://news.google.com/rss/search?q=%D8%A7%DB%8C%D8%B1%D8%A7%D9%86&hl=fa&gl=IR&ceid=IR:fa',
    category: 'iran',
    enabled: true,
  },
  {
    id: 'euronews-fa',
    label: 'یورونیوز فارسی',
    url: 'https://parsi.euronews.com/rss',
    category: 'iran',
    enabled: true,
  },
  {
    id: 'isna-ir',
    label: 'خبرگزاری ایسنا (ISNA)',
    url: 'https://www.isna.ir/rss',
    category: 'iran',
    enabled: true,
  },
  {
    id: 'mehrnews-ir',
    label: 'خبرگزاری مهر (Mehr News)',
    url: 'https://www.mehrnews.com/rss',
    category: 'iran',
    enabled: false,
  },
  {
    id: 'irna-ir',
    label: 'خبرگزاری ایرنا (IRNA)',
    url: 'https://www.irna.ir/rss',
    category: 'iran',
    enabled: false,
  },
  {
    id: 'asriran-ir',
    label: 'پایگاه خبری عصرایران',
    url: 'https://www.asriran.com/fa/rss/allnews',
    category: 'iran',
    enabled: false,
  },
];

export const GEMINI_VOICES: Array<{
  id: GeminiVoiceName;
  label: string;
  role: string;
  desc: string;
  sampleText: string;
}> = [
  {
    id: 'Kore',
    label: 'Kore · کورِی',
    role: 'زن · شفاف و خبری',
    desc: 'مناسب بخش خبری صبحگاهی و لحن رسمی',
    sampleText: 'سلام و وقت بخیر؛ شما شنونده بخش خبری صبحگاهی رادیو راویو هستید.',
  },
  {
    id: 'Puck',
    label: 'Puck · پاک',
    role: 'مرد · پرانرژی',
    desc: 'مناسب اخبار فناوری و گفتار پویا',
    sampleText: 'درود به همه همراهان همیشگی؛ با تازه‌ترین خبرهای فناوری و هوش مصنوعی همراه شما هستیم.',
  },
  {
    id: 'Charon',
    label: 'Charon · کارون',
    role: 'مرد · عمیق و جدی',
    desc: 'مناسب تحلیل اقتصادی و اخبار جهان',
    sampleText: 'در این گزارش تحلیلی، مهم‌ترین تحولات اقتصاد جهانی و بازارهای امروز را بررسی می‌کنیم.',
  },
  {
    id: 'Zephyr',
    label: 'Zephyr · زفیر',
    role: 'زن · گرم و صمیمی',
    desc: 'مناسب روایت مجله‌ای و صبحگاهی',
    sampleText: 'صبح بخیر و سفر خوش؛ امیدواریم در مسیر امروز همراهی گرم و دلنشین برای شما باشیم.',
  },
  {
    id: 'Fenrir',
    label: 'Fenrir · فنریر',
    role: 'مرد · رادیویی کلاسیک',
    desc: 'لحن محکم و کلاسیک رادیویی',
    sampleText: 'شنوندگان گرامی، مشروح مهم‌ترین سرخط خبرهای امروز را در راویو دنبال کنید.',
  },
];

export const OPENROUTER_MODELS = [
  { id: 'google/gemini-2.5-flash', label: 'Google Gemini 2.5 Flash' },
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3 Chat' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (رایگان)' },
  { id: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen 2.5 72B (قوی در فارسی)' },
];

const envBackendUrl =
  typeof import.meta !== 'undefined' &&
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_BACKEND_URL
    ? (import.meta as unknown as { env: Record<string, string> }).env.VITE_BACKEND_URL.trim()
    : '';

export const DEFAULT_SETTINGS: StudioSettings = {
  aiProvider: 'gemini',
  backendServerUrl: envBackendUrl,
  geminiModel: 'gemini-2.5-flash',
  openRouterApiKey: '',
  openRouterModel: 'google/gemini-2.5-flash',
  customBaseUrl: 'https://api.openai.com/v1',
  customApiKey: '',
  customModel: 'gpt-4o-mini',
  ttsEngine: 'gemini_tts',
  geminiTtsModel: 'gemini-2.5-flash-preview-tts',
  geminiVoice: 'Kore',
  broadcastTone: 'morning_host',
  maxNewsItems: 6,
  playbackSpeed: 1,
  combinedCategories: ['iran', 'tech_ai', 'economy'],
  maxArchiveCount: 10,
  autoPlayNextInCar: true,
  autoScheduleEnabled: false,
  autoScheduleTime: '06:30',
  autoScheduleUseCombined: true,
  autoGenerateAudioOnSchedule: true,
  autoSavePodcastFileOnSchedule: true,
  lastAutoRunDate: '',
};

export const APP_VERSION = '1.0.0';
export const APP_GITHUB_URL = 'https://github.com/yusi20006-max/RAVIO';
