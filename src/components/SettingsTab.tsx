import {
  Archive,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  FolderOpen,
  Globe,
  Info,
  Loader2,
  Play,
  RotateCcw,
  Server,
  Smartphone,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Volume2,
  WifiOff,
} from 'lucide-react';
import { ChangeEvent, ReactNode, useEffect, useRef, useState } from 'react';
import {
  APP_GITHUB_URL,
  APP_VERSION,
  DEFAULT_SETTINGS,
  GEMINI_VOICES,
  OPENROUTER_MODELS,
} from '../data/presets';
import {
  buildBackendUrl,
  hasConfiguredBackend,
  isCapacitorNative,
  MISSING_APK_BACKEND_MESSAGE,
  safeParseJsonResponse,
  synthesizeGeminiAudio,
} from '../services/aiService';
import {
  buildPodcastFilename,
  supportsDirectoryPicker,
  triggerBlobDownload,
} from '../services/fileSaveService';
import {
  createBackupPayload,
  parseBackupPayload,
  StudioBackupPayload,
} from '../services/storageService';
import {
  AIProviderType,
  BroadcastScopeId,
  BroadcastTone,
  GeminiVoiceName,
  RssFeedSource,
  StudioSettings,
  TTSEngineType,
} from '../types/radio';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsTabProps {
  settings: StudioSettings;
  feeds: RssFeedSource[];
  activeCategory: BroadcastScopeId;
  archiveCount: number;
  archiveSizeMB: string;
  outputDirectoryName: string | null;
  onUpdateSettings: (patch: Partial<StudioSettings>) => void;
  onResetSettings: () => void;
  onTriggerAutoRunNow: () => void;
  onPickOutputDirectory: () => void;
  onClearOutputDirectory: () => void;
  onClearOldEditions: () => void;
  onImportBackup: (payload: StudioBackupPayload) => void;
  requestedSection?: { id: SettingsSectionId; nonce: number } | null;
}

export type SettingsSectionId = 'ai' | 'voice' | 'scheduler' | 'archive' | 'pwa_apk' | 'about';

interface AccordionCardProps {
  id: SettingsSectionId;
  title: string;
  summary: string;
  icon: ReactNode;
  isOpen: boolean;
  onToggle: (id: SettingsSectionId) => void;
  children: ReactNode;
}

function AccordionCard({
  id,
  title,
  summary,
  icon,
  isOpen,
  onToggle,
  children,
}: AccordionCardProps) {
  return (
    <section className="bg-[#13171D] border border-white/10 rounded-2xl overflow-hidden">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => onToggle(id)}
        className="w-full min-h-[64px] px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 text-right hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#0B0D10] border border-white/10 flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-white truncate">{title}</h2>
            <p className="text-[11px] sm:text-xs text-zinc-400 truncate mt-0.5">{summary}</p>
          </div>
        </div>

        <ChevronDown
          className={`w-5 h-5 text-zinc-400 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-amber-400' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="px-4 sm:px-5 pb-5 pt-2 border-t border-white/10 space-y-4">
          {children}
        </div>
      )}
    </section>
  );
}

export function SettingsTab({
  settings,
  feeds,
  activeCategory,
  archiveCount,
  archiveSizeMB,
  outputDirectoryName,
  onUpdateSettings,
  onResetSettings,
  onTriggerAutoRunNow,
  onPickOutputDirectory,
  onClearOutputDirectory,
  onClearOldEditions,
  onImportBackup,
  requestedSection,
}: SettingsTabProps) {
  const [openSection, setOpenSection] = useState<SettingsSectionId | null>(
    requestedSection?.id || 'voice'
  );
  const [serverTestStatus, setServerTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [serverTestMessage, setServerTestMessage] = useState<string>('');
  const [customPreviewText, setCustomPreviewText] = useState<string>('');
  const [loadingVoice, setLoadingVoice] = useState<GeminiVoiceName | null>(null);
  const [previewingVoice, setPreviewingVoice] = useState<GeminiVoiceName | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [includeApiKeysInBackup, setIncludeApiKeysInBackup] = useState(false);
  const [copiedGitHub, setCopiedGitHub] = useState(false);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewCacheRef = useRef<Record<string, string>>({});
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (requestedSection?.id) {
      setOpenSection(requestedSection.id);
    }
  }, [requestedSection]);

  useEffect(() => {
    const cacheRef = previewCacheRef;
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
      Object.values(cacheRef.current).forEach((url) => URL.revokeObjectURL(url));
      cacheRef.current = {};
    };
  }, []);

  const toggleSection = (id: SettingsSectionId) => {
    setOpenSection((prev) => (prev === id ? null : id));
  };

  const stopVoicePreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }
    setPreviewingVoice(null);
  };

  const handlePreviewVoice = async (voiceId: GeminiVoiceName, defaultSampleText: string) => {
    setPreviewError(null);

    if (previewingVoice === voiceId) {
      stopVoicePreview();
      return;
    }

    if (loadingVoice) return;

    stopVoicePreview();

    const textToSpeak = customPreviewText.trim() || defaultSampleText;
    const cacheKey = `${settings.geminiTtsModel}::${voiceId}::${textToSpeak}`;

    const playUrl = async (objectUrl: string) => {
      if (!previewAudioRef.current) {
        previewAudioRef.current = new Audio();
      }
      const audio = previewAudioRef.current;
      audio.src = objectUrl;
      audio.onended = () => setPreviewingVoice(null);
      audio.onerror = () => {
        setPreviewingVoice(null);
        setPreviewError('پخش فایل نمونه در مرورگر با خطا مواجه شد.');
      };
      setPreviewingVoice(voiceId);
      await audio.play();
    };

    try {
      const cachedUrl = previewCacheRef.current[cacheKey];
      if (cachedUrl) {
        await playUrl(cachedUrl);
        return;
      }

      setLoadingVoice(voiceId);
      const { blob } = await synthesizeGeminiAudio(
        textToSpeak,
        voiceId,
        settings.geminiTtsModel,
        settings.backendServerUrl
      );
      const objectUrl = URL.createObjectURL(blob);
      previewCacheRef.current[cacheKey] = objectUrl;
      setLoadingVoice(null);
      await playUrl(objectUrl);
    } catch (err) {
      setLoadingVoice(null);
      setPreviewingVoice(null);
      setPreviewError(
        err instanceof Error ? err.message : 'خطا در دریافت پیش‌نمایش صدا از سرور Gemini'
      );
    }
  };

  const handleTestServerConnection = async () => {
    setServerTestStatus('testing');
    setServerTestMessage('');
    const hasBackend = hasConfiguredBackend(settings.backendServerUrl);
    if (isCapacitorNative() && !hasBackend) {
      setServerTestStatus('error');
      setServerTestMessage(MISSING_APK_BACKEND_MESSAGE);
      return;
    }

    const targetUrl = buildBackendUrl('/api/health', settings.backendServerUrl);
    try {
      const res = await fetch(targetUrl);
      const data = await safeParseJsonResponse<{ ok?: boolean }>(
        res,
        `پاسخ نامعتبر سرور (${res.status})`,
        hasBackend
      );
      if (!data.ok) {
        throw new Error('پاسخ سلامت سرور تایید نشد.');
      }
      setServerTestStatus('ok');
      setServerTestMessage('اتصال به سرور برقرار است و سرویس Gemini آماده کار است.');
    } catch (err) {
      setServerTestStatus('error');
      setServerTestMessage(
        err instanceof Error ? `خطا در اتصال: ${err.message}` : 'عدم دسترسی به سرور'
      );
    }
  };

  const handleExportBackup = () => {
    const payload = createBackupPayload(settings, feeds, activeCategory, {
      includeApiKeys: includeApiKeysInBackup,
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const dateTag = new Date().toISOString().slice(0, 10);
    triggerBlobDownload(blob, `ravio-backup-${dateTag}.json`);
    setBackupMessage({
      type: 'ok',
      text: includeApiKeysInBackup
        ? 'فایل پشتیبان همراه با کلیدهای API شخصی دانلود شد؛ این فایل را محرمانه نگه دارید.'
        : 'فایل پشتیبان تنظیمات و فیدها دانلود شد (کلیدهای API شخصی برای امنیت حذف شدند).',
    });
  };

  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const payload = parseBackupPayload(text, settings);
      onImportBackup(payload);
      setBackupMessage({
        type: 'ok',
        text: `پشتیبان با ${payload.feeds.length} منبع خبری و تنظیمات با موفقیت بازیابی شد.`,
      });
    } catch (err) {
      setBackupMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'خواندن فایل پشتیبان ناموفق بود.',
      });
    }
  };

  const handleCopyGitHubUrl = async () => {
    try {
      await navigator.clipboard.writeText(APP_GITHUB_URL);
      setCopiedGitHub(true);
      setTimeout(() => setCopiedGitHub(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const previewPodcastFilename = buildPodcastFilename({
    categoryLabel: settings.autoScheduleUseCombined ? 'خلاصه صبحگاهی ترکیبی' : 'فناوری و هوش مصنوعی',
    createdAt: Date.now(),
    broadcastTitle: '',
  });

  const onlineProviders: Array<{ id: AIProviderType; title: string; subtitle: string }> = [
    {
      id: 'gemini',
      title: 'Gemini (متصل به سرور)',
      subtitle: 'بدون نیاز به کلید روی گوشی',
    },
    {
      id: 'openrouter',
      title: 'OpenRouter API',
      subtitle: 'کلید شخصی DeepSeek / Llama / Qwen',
    },
    {
      id: 'custom_openai',
      title: 'OpenAI سفارشی',
      subtitle: 'Base URL و مدل دلخواه',
    },
  ];

  const isOfflineMode = settings.aiProvider === 'offline';
  const aiSummary = isOfflineMode
    ? 'حالت کاملاً آفلاین و مستقل'
    : settings.aiProvider === 'gemini'
      ? `Gemini سرور (${settings.geminiModel})`
      : settings.aiProvider === 'openrouter'
        ? `OpenRouter (${settings.openRouterModel})`
        : `سفارشی (${settings.customModel})`;

  const voiceMeta = GEMINI_VOICES.find((v) => v.id === settings.geminiVoice);
  const voiceSummary = `${voiceMeta?.label || settings.geminiVoice} · ${
    settings.ttsEngine === 'gemini_tts' ? 'صوت هوش مصنوعی' : 'گوینده آفلاین'
  }`;

  const schedulerSummary = settings.autoScheduleEnabled
    ? `فعال · ساعت ${settings.autoScheduleTime}${outputDirectoryName ? ` · پوشه ${outputDirectoryName}` : ' · Downloads'}`
    : 'غیرفعال · زمان‌بند روزانه و ذخیره خودکار پادکست';

  const archiveSummary = `${archiveCount} بخش ذخیره‌شده (${archiveSizeMB} مگابایت) · سقف ${settings.maxArchiveCount} نسخه`;

  return (
    <div className="max-w-3xl mx-auto space-y-3.5">
      {/* Compact Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#13171D] border border-white/10 rounded-2xl p-4 sm:p-5">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-white">تنظیمات راویو</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            روی هر بخش بزنید تا گزینه‌های آن باز یا بسته شود.
          </p>
        </div>
        <button
          onClick={onResetSettings}
          className="min-h-[40px] px-3.5 rounded-xl bg-[#1A2029] hover:bg-[#232B37] text-xs font-medium text-zinc-300 flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>بازنشانی پیش‌فرض</span>
        </button>
      </div>

      {/* 1. AI Provider & Server Connection */}
      <AccordionCard
        id="ai"
        title="۱. هوش مصنوعی، اتصال سرور و حالت آفلاین"
        summary={aiSummary}
        icon={<Cpu className="w-4 h-4 text-amber-400" />}
        isOpen={openSection === 'ai'}
        onToggle={toggleSection}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[#0E1116] border border-white/10">
          <div className="flex items-center gap-2.5">
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <p className="text-xs sm:text-sm font-bold text-white">حالت کاملاً آفلاین و مستقل</p>
              <p className="text-[11px] text-zinc-400">بدون نیاز به سرور، کلید API و اینترنت پایدار</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              onUpdateSettings({
                aiProvider: isOfflineMode ? 'gemini' : 'offline',
                ttsEngine: isOfflineMode ? 'gemini_tts' : 'offline_speech',
              })
            }
            className={`min-h-[40px] px-3.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
              isOfflineMode
                ? 'bg-amber-500 text-zinc-950'
                : 'bg-[#1A2029] hover:bg-[#232B37] text-zinc-200'
            }`}
          >
            {isOfflineMode ? 'آفلاین فعال (بازگشت به آنلاین)' : 'فعال‌سازی حالت آفلاین'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {onlineProviders.map((p) => {
            const active = settings.aiProvider === p.id;
            return (
              <button
                key={p.id}
                onClick={() => onUpdateSettings({ aiProvider: p.id })}
                className={`p-3 rounded-xl border text-right transition-colors space-y-1 flex flex-col justify-start ${
                  active
                    ? 'bg-[#1D2430] border-amber-500/60 text-white'
                    : 'bg-[#0E1116] border-white/10 text-zinc-300 hover:bg-[#181D25]'
                }`}
              >
                <span className="text-xs font-bold">{p.title}</span>
                <span className="text-[11px] text-zinc-400">{p.subtitle}</span>
              </button>
            );
          })}
        </div>

        {settings.aiProvider === 'gemini' && (
          <div className="bg-[#0E1116] border border-white/10 rounded-xl p-4 space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300">
                انتخاب مدل Gemini روی سرور
              </label>
              <select
                value={settings.geminiModel}
                onChange={(e) => onUpdateSettings({ geminiModel: e.target.value })}
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#13171D] border border-white/15 focus:border-amber-500 focus:outline-none text-sm text-white font-mono-tabular"
              >
                <option value="gemini-2.5-flash">gemini-2.5-flash (پیش‌فرض پیشنهادی)</option>
                <option value="gemini-4-hydrogen">gemini-4-hydrogen (نسل جدید سریع)</option>
                <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (فوق‌سبک)</option>
              </select>
            </div>

            <div className="pt-3 border-t border-white/10 space-y-2.5">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-amber-400 shrink-0" />
                <label className="block text-xs font-semibold text-zinc-200">
                  آدرس سرور برنامه (برای اتصال APK بدون کلید روی گوشی)
                </label>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  dir="ltr"
                  value={settings.backendServerUrl}
                  onChange={(e) => {
                    setServerTestStatus('idle');
                    onUpdateSettings({ backendServerUrl: e.target.value });
                  }}
                  placeholder="خالی = سرور فعلی (یا https://your-app.run.app)"
                  className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-[#13171D] border border-white/15 focus:border-amber-500 focus:outline-none text-xs sm:text-sm text-white font-mono-tabular"
                />
                <button
                  type="button"
                  onClick={handleTestServerConnection}
                  disabled={serverTestStatus === 'testing'}
                  className="min-h-[44px] px-4 rounded-xl bg-[#1A2029] hover:bg-[#232B37] text-xs font-semibold text-zinc-100 flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <Globe className="w-4 h-4 text-amber-400" />
                  <span>{serverTestStatus === 'testing' ? 'در حال بررسی...' : 'تست اتصال سرور'}</span>
                </button>
              </div>
              {serverTestStatus === 'ok' && (
                <div className="flex items-center gap-2 text-xs text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{serverTestMessage}</span>
                </div>
              )}
              {serverTestStatus === 'error' && (
                <p className="text-xs text-red-400">{serverTestMessage}</p>
              )}
            </div>
          </div>
        )}

        {settings.aiProvider === 'openrouter' && (
          <div className="bg-[#0E1116] border border-white/10 rounded-xl p-4 space-y-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300">کلید API سرویس OpenRouter</label>
              <input
                type="password"
                dir="ltr"
                value={settings.openRouterApiKey}
                onChange={(e) => onUpdateSettings({ openRouterApiKey: e.target.value })}
                placeholder="sk-or-v1-..."
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#13171D] border border-white/15 focus:border-amber-500 focus:outline-none text-sm text-white font-mono-tabular"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300">مدل OpenRouter</label>
              <select
                value={
                  OPENROUTER_MODELS.some((m) => m.id === settings.openRouterModel)
                    ? settings.openRouterModel
                    : 'custom_slug'
                }
                onChange={(e) => {
                  if (e.target.value !== 'custom_slug') {
                    onUpdateSettings({ openRouterModel: e.target.value });
                  }
                }}
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#13171D] border border-white/15 focus:border-amber-500 focus:outline-none text-sm text-white mb-2"
              >
                {OPENROUTER_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
                <option value="custom_slug">ورود دستی شناسه مدل...</option>
              </select>
              <input
                type="text"
                dir="ltr"
                value={settings.openRouterModel}
                onChange={(e) => onUpdateSettings({ openRouterModel: e.target.value })}
                placeholder="google/gemini-2.5-flash"
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#13171D] border border-white/15 focus:border-amber-500 focus:outline-none text-sm text-white font-mono-tabular"
              />
            </div>
          </div>
        )}

        {settings.aiProvider === 'custom_openai' && (
          <div className="bg-[#0E1116] border border-white/10 rounded-xl p-4 space-y-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300">Base URL</label>
              <input
                type="url"
                dir="ltr"
                value={settings.customBaseUrl}
                onChange={(e) => onUpdateSettings({ customBaseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#13171D] border border-white/15 focus:border-amber-500 focus:outline-none text-sm text-white font-mono-tabular"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300">API Key</label>
              <input
                type="password"
                dir="ltr"
                value={settings.customApiKey}
                onChange={(e) => onUpdateSettings({ customApiKey: e.target.value })}
                placeholder="sk-..."
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#13171D] border border-white/15 focus:border-amber-500 focus:outline-none text-sm text-white font-mono-tabular"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300">Model ID</label>
              <input
                type="text"
                dir="ltr"
                value={settings.customModel}
                onChange={(e) => onUpdateSettings({ customModel: e.target.value })}
                placeholder="gpt-4o-mini"
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#13171D] border border-white/15 focus:border-amber-500 focus:outline-none text-sm text-white font-mono-tabular"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/10">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-300">لحن گوینده رادیو</label>
            <select
              value={settings.broadcastTone}
              onChange={(e) => onUpdateSettings({ broadcastTone: e.target.value as BroadcastTone })}
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D10] border border-white/15 focus:border-amber-500 focus:outline-none text-sm text-white"
            >
              <option value="morning_host">گوینده خبر صبحگاهی حرفه‌ای</option>
              <option value="fast_brief">خلاصه سریع و تیترمحور</option>
              <option value="analytical">تحلیلی و عمیق</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-300">تعداد خبرها در هر بخش</label>
            <select
              value={settings.maxNewsItems}
              onChange={(e) => onUpdateSettings({ maxNewsItems: Number(e.target.value) })}
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D10] border border-white/15 focus:border-amber-500 focus:outline-none text-sm text-white tabular-nums"
            >
              <option value={4}>۴ خبر (کوتاه و سریع)</option>
              <option value={6}>۶ خبر (متعادل - پیشنهادی)</option>
              <option value={10}>۱۰ خبر (بخش خبری مفصل)</option>
            </select>
          </div>
        </div>
      </AccordionCard>

      {/* 2. Voice & TTS Engine + Live Gemini Voice Preview */}
      <AccordionCard
        id="voice"
        title="۲. صدا و گوینده (پیش‌نمایش صداهای Gemini)"
        summary={voiceSummary}
        icon={<Volume2 className="w-4 h-4 text-amber-400" />}
        isOpen={openSection === 'voice'}
        onToggle={toggleSection}
      >
        <div className="grid grid-cols-2 gap-2.5">
          {(
            [
              { id: 'gemini_tts', label: 'فایل صوتی هوش مصنوعی' },
              { id: 'offline_speech', label: 'گوینده آفلاین دستگاه' },
            ] as Array<{ id: TTSEngineType; label: string }>
          ).map((opt) => (
            <button
              key={opt.id}
              onClick={() => onUpdateSettings({ ttsEngine: opt.id })}
              className={`min-h-[44px] px-3 rounded-xl border text-xs sm:text-sm font-semibold transition-colors ${
                settings.ttsEngine === opt.id
                  ? 'bg-[#1D2430] border-amber-500/60 text-white'
                  : 'bg-[#0E1116] border-white/10 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-xs font-medium text-zinc-300">
              انتخاب و تست صدای گوینده
            </label>
            <span className="text-[11px] text-amber-300 font-medium whitespace-nowrap">
              {voiceMeta?.label || settings.geminiVoice}
            </span>
          </div>

          <input
            type="text"
            value={customPreviewText}
            onChange={(e) => setCustomPreviewText(e.target.value)}
            placeholder="متن دلخواه برای تست صدا (اختیاری — پیش‌فرض: جمله خبری رادیویی)"
            className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#0B0D10] border border-white/10 focus:border-amber-500 focus:outline-none text-xs text-white placeholder:text-zinc-500"
          />

          <div role="radiogroup" aria-label="انتخاب صدای گوینده Gemini" className="space-y-2">
            {GEMINI_VOICES.map((voice) => {
              const isSelected = settings.geminiVoice === voice.id;
              const isLoading = loadingVoice === voice.id;
              const isPlayingPreview = previewingVoice === voice.id;

              return (
                <div
                  key={voice.id}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onClick={() => onUpdateSettings({ geminiVoice: voice.id })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onUpdateSettings({ geminiVoice: voice.id });
                    }
                  }}
                  className={`p-3 rounded-xl border cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-[#1D2430] border-amber-500/70'
                      : 'bg-[#0E1116] border-white/10 hover:bg-[#171C24]'
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs sm:text-sm font-bold text-white">{voice.label}</span>
                      <span className="text-[11px] text-zinc-300 bg-white/5 px-2 py-0.5 rounded-md">
                        {voice.role}
                      </span>
                      {isSelected && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          انتخاب‌شده
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">{voice.desc}</p>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePreviewVoice(voice.id, voice.sampleText);
                    }}
                    disabled={Boolean(loadingVoice && loadingVoice !== voice.id)}
                    aria-label={
                      isPlayingPreview
                        ? `توقف پیش‌نمایش ${voice.id}`
                        : `پخش پیش‌نمایش ${voice.id}`
                    }
                    className={`min-h-[42px] px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 ${
                      isPlayingPreview
                        ? 'bg-amber-500 text-zinc-950 border-amber-400'
                        : 'bg-[#151A22] hover:bg-[#1E2531] text-zinc-200 border-white/10'
                    }`}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                        <span>در حال ساخت...</span>
                      </>
                    ) : isPlayingPreview ? (
                      <>
                        <Square className="w-3.5 h-3.5 fill-current" />
                        <span>توقف</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current text-amber-400" />
                        <span>پیش‌نمایش</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {previewError && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              {previewError}
            </p>
          )}
        </div>

        <div className="space-y-1.5 pt-2 border-t border-white/10">
          <label className="block text-xs font-medium text-zinc-300">مدل تولید صوت (Gemini TTS)</label>
          <select
            value={settings.geminiTtsModel}
            onChange={(e) => onUpdateSettings({ geminiTtsModel: e.target.value })}
            className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D10] border border-white/15 focus:border-amber-500 focus:outline-none text-sm text-white font-mono-tabular"
          >
            <option value="gemini-2.5-flash-preview-tts">gemini-2.5-flash-preview-tts</option>
            <option value="gemini-3.8-flash-lite-tts">gemini-3.8-flash-lite-tts</option>
          </select>
        </div>

        <div className="bg-[#0E1116] border border-white/10 rounded-xl p-3 space-y-1">
          <p className="text-xs font-semibold text-amber-300">
            پیشگیری خودکار از تلفظ غلط کلمات
          </p>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            پیش از ساخت صوت، مخفف‌های انگلیسی و علامت‌ها (%، $، اعداد) به معادل فارسی تبدیل می‌شوند و هنگام نگارش خبر نیز آوانگاری فارسی و نیم‌فاصله رعایت می‌شود. اگر واژه‌ای همچنان نادرست خوانده شد، در تب پخش روی «ویرایش متن» بزنید، با اعراب کوتاه (مثلاً سِنت‌کام یا بُعد) اصلاحش کنید و دکمه «به‌روزرسانی فایل صوتی» را بزنید.
          </p>
        </div>
      </AccordionCard>

      {/* 3. Daily Scheduler & Auto-Save Podcast */}
      <AccordionCard
        id="scheduler"
        title="۳. زمان‌بند خودکار روزانه و ذخیره پادکست"
        summary={schedulerSummary}
        icon={<Clock className="w-4 h-4 text-amber-400" />}
        isOpen={openSection === 'scheduler'}
        onToggle={toggleSection}
      >
        <div className="flex items-center justify-between gap-3 bg-[#0E1116] border border-white/10 rounded-xl p-3.5">
          <div>
            <p className="text-xs sm:text-sm font-bold text-white">اجرای خودکار روزانه</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              ساخت خودکار پادکست سر ساعت با اعلام تاریخ و ساعت تهیه خبر
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.autoScheduleEnabled}
            onClick={() => onUpdateSettings({ autoScheduleEnabled: !settings.autoScheduleEnabled })}
            className={`w-12 h-6 rounded-full transition-colors p-0.5 shrink-0 ${
              settings.autoScheduleEnabled ? 'bg-amber-500' : 'bg-zinc-700'
            }`}
          >
            <span
              className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                settings.autoScheduleEnabled ? '-translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-300">ساعت اجرای خودکار</label>
            <input
              type="time"
              dir="ltr"
              value={settings.autoScheduleTime}
              onChange={(e) => onUpdateSettings({ autoScheduleTime: e.target.value })}
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D10] border border-white/15 focus:border-amber-500 focus:outline-none text-sm text-white font-mono-tabular"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-300">وضعیت آخرین اجرا</label>
            <div className="min-h-[44px] px-3.5 rounded-xl bg-[#0E1116] border border-white/10 flex items-center text-xs text-zinc-300 font-mono-tabular">
              {settings.lastAutoRunDate || 'هنوز اجرا نشده'}
            </div>
          </div>
        </div>

        <div className="space-y-2.5">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.autoScheduleUseCombined}
              onChange={(e) => onUpdateSettings({ autoScheduleUseCombined: e.target.checked })}
              className="w-4 h-4 accent-amber-500 rounded"
            />
            <span className="text-xs sm:text-sm text-zinc-200">
              ساخت «خلاصه صبحگاهی ترکیبی» از دسته‌های منتخب در زمان‌بند
            </span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.autoGenerateAudioOnSchedule}
              onChange={(e) =>
                onUpdateSettings({ autoGenerateAudioOnSchedule: e.target.checked })
              }
              className="w-4 h-4 accent-amber-500 rounded"
            />
            <span className="text-xs sm:text-sm text-zinc-200">
              تولید خودکار فایل صوتی (WAV) همراه با دریافت خبر
            </span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.autoSavePodcastFileOnSchedule}
              onChange={(e) =>
                onUpdateSettings({ autoSavePodcastFileOnSchedule: e.target.checked })
              }
              className="w-4 h-4 accent-amber-500 rounded"
            />
            <span className="text-xs sm:text-sm text-zinc-200">
              ذخیره خودکار فایل پادکست در پوشه خروجی / دانلودهای گوشی
            </span>
          </label>
        </div>

        <div className="bg-[#0E1116] border border-white/10 rounded-xl p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
              <FolderOpen className="w-4 h-4 text-amber-400" />
              <span>مسیر ذخیره خودکار پادکست:</span>
            </span>
            <span className="text-[11px] text-amber-300 font-medium">
              {outputDirectoryName
                ? `پوشه انتخابی: ${outputDirectoryName}`
                : 'پوشه پیش‌فرض Downloads گوشی'}
            </span>
          </div>

          {supportsDirectoryPicker() && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onPickOutputDirectory}
                className="min-h-[38px] px-3 rounded-lg bg-[#1A2029] hover:bg-[#232B37] text-xs font-semibold text-zinc-100 flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  {outputDirectoryName ? 'تغییر پوشه خروجی' : 'انتخاب پوشه ذخیره در دستگاه'}
                </span>
              </button>
              {outputDirectoryName && (
                <button
                  type="button"
                  onClick={onClearOutputDirectory}
                  className="min-h-[38px] px-3 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-zinc-300 transition-colors whitespace-nowrap"
                >
                  بازگشت به Downloads
                </button>
              )}
            </div>
          )}

          <div className="space-y-1">
            <p className="text-[11px] text-zinc-400">
              نام‌گذاری خودکار شامل دسته‌بندی، تاریخ شمسی و ساعت ساخت خبر:
            </p>
            <p
              className="text-[11px] text-zinc-300 font-mono-tabular bg-black/40 px-2.5 py-1.5 rounded-lg truncate"
              dir="ltr"
            >
              {previewPodcastFilename}
            </p>
          </div>
        </div>

        <button
          onClick={onTriggerAutoRunNow}
          className="w-full min-h-[44px] rounded-xl bg-[#1A2029] hover:bg-[#232B37] text-xs sm:text-sm font-semibold text-amber-300 flex items-center justify-center gap-2 transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          <span>تست اجرای فوری زمان‌بند</span>
        </button>
      </AccordionCard>

      {/* 4. Offline Archive Capacity */}
      <AccordionCard
        id="archive"
        title="۴. مدیریت حافظه آرشیو آفلاین"
        summary={archiveSummary}
        icon={<Archive className="w-4 h-4 text-amber-400" />}
        isOpen={openSection === 'archive'}
        onToggle={toggleSection}
      >
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-zinc-300">
            سقف نگهداری خودکار در آرشیو دستگاه
          </label>
          <select
            value={settings.maxArchiveCount}
            onChange={(e) => onUpdateSettings({ maxArchiveCount: Number(e.target.value) })}
            className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D10] border border-white/15 focus:border-amber-500 focus:outline-none text-sm text-white tabular-nums"
          >
            <option value={5}>۵ بخش خبری اخیر (صرفه‌جویی حداکثری در حافظه)</option>
            <option value={10}>۱۰ بخش خبری اخیر (پیشنهادی)</option>
            <option value={20}>۲۰ بخش خبری اخیر</option>
            <option value={50}>۵۰ بخش خبری اخیر</option>
          </select>
        </div>

        {archiveCount > 1 && (
          <button
            type="button"
            onClick={onClearOldEditions}
            className="w-full min-h-[42px] rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-xs sm:text-sm font-semibold text-red-300 flex items-center justify-center gap-2 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>حذف نسخه‌های قدیمی و آزادسازی فضا</span>
          </button>
        )}
      </AccordionCard>

      {/* 5. PWA Install & APK Backup / Restore */}
      <AccordionCard
        id="pwa_apk"
        title="۵. نصب اپلیکیشن (PWA) و انتقال به APK"
        summary="نصب تمام‌صفحه روی اندروید و تلویزیون · خروجی و بازیابی JSON"
        icon={<Smartphone className="w-4 h-4 text-amber-400" />}
        isOpen={openSection === 'pwa_apk'}
        onToggle={toggleSection}
      >
        <p className="text-xs text-zinc-400 leading-relaxed">
          راویو را می‌توانید مستقیماً روی گوشی و تلویزیون نصب کنید یا از منابع RSS و تنظیمات خود خروجی بگیرید و در نسخه APK (آماده‌شده با Capacitor) بازیابی نمایید.
        </p>

        <div className="flex flex-wrap gap-2.5">
          <PWAInstallButton />

          <button
            type="button"
            onClick={handleExportBackup}
            className="min-h-[44px] px-4 rounded-xl bg-[#1A2029] hover:bg-[#232B37] border border-white/10 text-xs sm:text-sm font-semibold text-zinc-100 flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-amber-400" />
            <span>خروجی تنظیمات و فیدها (JSON)</span>
          </button>

          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="min-h-[44px] px-4 rounded-xl bg-[#1A2029] hover:bg-[#232B37] border border-white/10 text-xs sm:text-sm font-semibold text-zinc-100 flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <Upload className="w-4 h-4 text-amber-400" />
            <span>بازیابی فایل پشتیبان</span>
          </button>

          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
            className="hidden"
          />
        </div>

        <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#0E1116] border border-white/10 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeApiKeysInBackup}
            onChange={(e) => setIncludeApiKeysInBackup(e.target.checked)}
            className="w-4 h-4 mt-0.5 accent-amber-500 rounded shrink-0"
          />
          <span className="text-xs text-zinc-300 leading-relaxed">
            <strong className="text-zinc-100 block">
              شامل کلیدهای API شخصی در فایل پشتیبان (اختیاری)
            </strong>
            به‌صورت پیش‌فرض کلیدهای OpenRouter و سرویس سفارشی برای امنیت از فایل JSON حذف می‌شوند؛ تنها زمانی این گزینه را فعال کنید که قصد انتقال شخصی به دستگاه دیگری دارید.
          </span>
        </label>

        {backupMessage && (
          <p
            className={`text-xs rounded-xl px-3 py-2 border ${
              backupMessage.type === 'ok'
                ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25'
                : 'text-red-300 bg-red-500/10 border-red-500/25'
            }`}
          >
            {backupMessage.text}
          </p>
        )}
      </AccordionCard>

      {/* 6. About Ravio */}
      <AccordionCard
        id="about"
        title="۶. درباره راویو"
        summary={`نسخه ${APP_VERSION} · معرفی برنامه و مخزن گیت‌هاب`}
        icon={<Info className="w-4 h-4 text-amber-400" />}
        isOpen={openSection === 'about'}
        onToggle={toggleSection}
      >
        <div className="bg-[#0E1116] border border-white/10 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <img
                src="/pwa-192x192.png"
                alt="لوگوی راویو"
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-xl border border-amber-500/30 object-cover shrink-0"
              />
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-white">Ravio · راویو</h3>
                <p className="text-xs text-amber-400 font-medium mt-0.5">روایتِ هوشمندِ خبر</p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/35 text-xs font-mono-tabular font-bold text-amber-300">
              v{APP_VERSION}
            </span>
          </div>

          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
            راویو یک استودیوی رادیو خبر هوشمند و متن‌باز به زبان فارسی است که خبرهای روز را از فیدهای RSS داخلی و بین‌المللی گردآوری می‌کند، با هوش مصنوعی به یک بولتن رادیویی روان تبدیل می‌سازد و با صدای گوینده هوشمند یا موتور آفلاین دستگاه پخش می‌کند. این برنامه با تمرکز بر استفاده بدون دخالت دست در خودرو، نمایشگر تلویزیون (تله‌پرامپتر پرکنتراست) و نصب مستقیم به‌صورت PWA یا APK اندروید طراحی شده است.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="bg-[#0E1116] border border-white/10 rounded-xl p-3 space-y-0.5">
            <span className="text-[11px] text-zinc-400 block">نسخه برنامه</span>
            <span className="text-xs sm:text-sm font-bold text-white font-mono-tabular">
              نسخه {APP_VERSION} (پایدار)
            </span>
          </div>
          <div className="bg-[#0E1116] border border-white/10 rounded-xl p-3 space-y-0.5">
            <span className="text-[11px] text-zinc-400 block">شناسه بسته اندروید</span>
            <span className="text-xs font-semibold text-zinc-200 font-mono-tabular" dir="ltr">
              app.ravio.newsradio
            </span>
          </div>
          <div className="bg-[#0E1116] border border-white/10 rounded-xl p-3 space-y-0.5">
            <span className="text-[11px] text-zinc-400 block">پلتفرم‌های پشتیبانی‌شده</span>
            <span className="text-xs font-semibold text-zinc-200">
              وب · PWA · Android TV · APK
            </span>
          </div>
        </div>

        <div className="bg-[#0E1116] border border-white/10 rounded-xl p-3.5 space-y-2.5">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-zinc-200 block">
              مخزن رسمی پروژه در گیت‌هاب (GitHub)
            </span>
            <p
              className="text-xs text-amber-300/90 font-mono-tabular bg-black/40 px-3 py-2 rounded-lg truncate"
              dir="ltr"
            >
              {APP_GITHUB_URL}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={APP_GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[42px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <ExternalLink className="w-4 h-4" />
              <span>مشاهده پروژه در GitHub</span>
            </a>

            <button
              type="button"
              onClick={handleCopyGitHubUrl}
              className="min-h-[42px] px-3.5 rounded-xl bg-[#1A2029] hover:bg-[#232B37] border border-white/10 text-xs font-semibold text-zinc-200 flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              {copiedGitHub ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-300">آدرس کپی شد</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-amber-400" />
                  <span>کپی لینک گیت‌هاب</span>
                </>
              )}
            </button>
          </div>
        </div>
      </AccordionCard>

      <span className="sr-only">{DEFAULT_SETTINGS.geminiModel}</span>
    </div>
  );
}
