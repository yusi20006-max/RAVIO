import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Edit3,
  FileAudio,
  Headphones,
  Layers,
  Moon,
  Newspaper,
  Pause,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Server,
  Volume2,
  WifiOff,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CATEGORY_OPTIONS } from '../data/presets';
import { hasConfiguredBackend, isCapacitorNative } from '../services/aiService';
import {
  BroadcastEdition,
  BroadcastScopeId,
  FeedCategoryId,
  PipelineStage,
  StudioSettings,
  TTSEngineType,
} from '../types/radio';

interface PlayerScriptTabProps {
  activeCategory: BroadcastScopeId;
  onSelectCategory: (cat: BroadcastScopeId) => void;
  onToggleCombinedCategory: (cat: FeedCategoryId) => void;
  currentEdition: BroadcastEdition | null;
  settings: StudioSettings;
  pipelineStage: PipelineStage;
  pipelineError: string | null;
  autoSaveNotice: string | null;
  isSynthesizingAudio: boolean;
  sleepRemainingSec: number | null;
  // Player state
  sentences: string[];
  activeSentenceIdx: number;
  activeWordRatio: number;
  isPlaying: boolean;
  effectiveMode: TTSEngineType;
  progressPercent: number;
  currentTime: number;
  duration: number;
  persianVoiceAvailable: boolean;
  onFetchAndBuild: () => void;
  onSynthesizeCurrentScript: () => void;
  onScriptEdit: (newScript: string) => void;
  onTogglePlay: () => void;
  onSeekToTime: (sec: number) => void;
  onSkipBySeconds: (delta: number) => void;
  onNext: () => void;
  onPrev: () => void;
  onJumpToSentence: (idx: number) => void;
  onSpeedChange: (speed: number) => void;
  onCycleSleepTimer: () => void;
  onSwitchTtsEngine: (engine: TTSEngineType) => void;
  onSwitchOperationMode: (mode: 'server' | 'offline') => void;
  onDownloadAudio: (edition: BroadcastEdition) => void;
  onOpenCardsTab: () => void;
  onOpenServerSettings: () => void;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatPersianDate(ts: number): string {
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

const STAGE_LABELS: Record<PipelineStage, string> = {
  idle: '',
  fetching_rss: 'در حال دریافت اخبار زنده...',
  generating_script: 'در حال تنظیم متن رادیویی...',
  synthesizing_audio: 'در حال ساخت فایل صوتی (WAV)...',
  saving: 'در حال ذخیره نسخه آفلاین...',
  error: 'خطا در دریافت یا پردازش خبر',
};

export function PlayerScriptTab({
  activeCategory,
  onSelectCategory,
  onToggleCombinedCategory,
  currentEdition,
  settings,
  pipelineStage,
  pipelineError,
  autoSaveNotice,
  isSynthesizingAudio,
  sleepRemainingSec,
  sentences,
  activeSentenceIdx,
  activeWordRatio,
  isPlaying,
  effectiveMode,
  progressPercent,
  currentTime,
  duration,
  persianVoiceAvailable,
  onFetchAndBuild,
  onSynthesizeCurrentScript,
  onScriptEdit,
  onTogglePlay,
  onSeekToTime,
  onSkipBySeconds,
  onNext,
  onPrev,
  onJumpToSentence,
  onSpeedChange,
  onCycleSleepTimer,
  onSwitchTtsEngine,
  onSwitchOperationMode,
  onDownloadAudio,
  onOpenCardsTab,
  onOpenServerSettings,
}: PlayerScriptTabProps) {
  const [scriptViewMode, setScriptViewMode] = useState<'teleprompter' | 'edit'>('teleprompter');
  const [copiedScript, setCopiedScript] = useState(false);
  const teleprompterBoxRef = useRef<HTMLDivElement | null>(null);
  const teleprompterLineRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (scriptViewMode !== 'teleprompter') return;
    const box = teleprompterBoxRef.current;
    const line = teleprompterLineRefs.current[activeSentenceIdx];
    if (!box || !line) return;
    const targetTop = line.offsetTop - box.clientHeight / 2 + line.clientHeight / 2;
    box.scrollTo({
      top: Math.max(0, targetTop),
      behavior: 'smooth',
    });
  }, [activeSentenceIdx, scriptViewMode, sentences.length]);

  const isBusy = pipelineStage !== 'idle' && pipelineStage !== 'error';
  const isOfflineMode = settings.aiProvider === 'offline';
  const needsApkBackendSetup =
    isCapacitorNative() &&
    settings.aiProvider === 'gemini' &&
    !hasConfiguredBackend(settings.backendServerUrl);
  const isScriptOutOfSync = Boolean(
    currentEdition?.hasAudio &&
      currentEdition.audioScriptSnapshot !== undefined &&
      currentEdition.script.trim() !== currentEdition.audioScriptSnapshot.trim()
  );

  const handleCopyScript = async () => {
    if (!currentEdition?.script) return;
    try {
      await navigator.clipboard.writeText(currentEdition.script);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 1800);
    } catch {
      // Ignore clipboard error
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Minimal Studio Top Strip */}
      <section className="bg-[#13171D] border border-white/10 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onSwitchOperationMode(isOfflineMode ? 'server' : 'offline')}
            className="min-h-[38px] px-3 rounded-xl bg-[#0B0D10] hover:bg-[#181D25] border border-white/10 text-xs font-medium text-zinc-300 inline-flex items-center gap-2 self-start sm:self-auto transition-colors whitespace-nowrap"
          >
            {isOfflineMode ? (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                <span>حالت آفلاین مستقل</span>
              </>
            ) : (
              <>
                <Server className="w-3.5 h-3.5 text-emerald-400" />
                <span>متصل به سرور هوشمند</span>
              </>
            )}
          </button>

          <button
            onClick={onFetchAndBuild}
            disabled={isBusy}
            className="min-h-[46px] px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] disabled:opacity-60 text-zinc-950 font-bold text-sm flex items-center justify-center gap-2 transition-all whitespace-nowrap shadow-md shadow-amber-500/15"
          >
            <RefreshCw className={`w-4 h-4 ${isBusy ? 'animate-spin' : ''}`} />
            <span>
              {isBusy
                ? 'در حال تولید...'
                : activeCategory === 'combined'
                  ? 'ساخت خلاصه صبحگاهی ترکیبی'
                  : isOfflineMode
                    ? 'دریافت خبر (آفلاین)'
                    : 'دریافت و ساخت فوری خبر'}
            </span>
          </button>
        </div>

        {/* Clean Category Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onSelectCategory('combined')}
            className={`min-h-[38px] px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeCategory === 'combined'
                ? 'bg-amber-400 text-zinc-950'
                : 'bg-[#1A2029] text-amber-200 border border-amber-500/20 hover:bg-[#222A36]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>خلاصه ترکیبی</span>
          </button>

          {CATEGORY_OPTIONS.map((cat) => {
            const isSelected = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className={`min-h-[38px] px-3 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
                  isSelected
                    ? 'bg-zinc-100 text-zinc-950 font-semibold'
                    : 'bg-[#1A2029] text-zinc-300 hover:bg-[#222A36] hover:text-white'
                }`}
              >
                {cat.shortLabel}
              </button>
            );
          })}
        </div>

        {activeCategory === 'combined' && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/10">
            <span className="text-[11px] text-zinc-400 ml-1">موضوعات ترکیب:</span>
            {CATEGORY_OPTIONS.map((cat) => {
              const checked = settings.combinedCategories.includes(cat.id);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onToggleCombinedCategory(cat.id)}
                  className={`min-h-[32px] px-2.5 rounded-lg text-[11px] font-medium border transition-colors whitespace-nowrap ${
                    checked
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
                      : 'bg-[#0E1116] border-white/10 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {checked ? '✓ ' : ''}
                  {cat.shortLabel}
                </button>
              );
            })}
          </div>
        )}

        {isBusy && (
          <div className="bg-[#0E1116] border border-amber-500/30 rounded-xl px-3.5 py-2.5 flex items-center gap-2.5">
            <RefreshCw className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
            <span className="text-xs font-medium text-amber-200">
              {STAGE_LABELS[pipelineStage]}
            </span>
          </div>
        )}

        {autoSaveNotice && (
          <div className="bg-emerald-950/40 border border-emerald-500/35 rounded-xl px-3.5 py-2.5 text-xs text-emerald-200">
            {autoSaveNotice}
          </div>
        )}

        {needsApkBackendSetup && !pipelineError && (
          <div className="bg-amber-500/10 border border-amber-500/35 rounded-xl p-3 space-y-2.5">
            <p className="text-xs text-amber-200 leading-relaxed">
              نسخه اندروید بدون آدرس سرور نمی‌تواند به Gemini متصل شود؛ آدرس سرور را وارد کنید یا با یک لمس به حالت آفلاین بروید.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onOpenServerSettings}
                className="min-h-[38px] px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold transition-colors whitespace-nowrap"
              >
                تنظیم آدرس سرور
              </button>
              <button
                type="button"
                onClick={() => onSwitchOperationMode('offline')}
                className="min-h-[38px] px-3 rounded-lg bg-[#1A2029] hover:bg-[#232B37] border border-white/10 text-zinc-200 text-xs font-semibold transition-colors whitespace-nowrap"
              >
                استفاده در حالت آفلاین
              </button>
            </div>
          </div>
        )}

        {pipelineError && (
          <div className="bg-red-950/40 border border-red-500/30 rounded-xl px-3.5 py-2.5 space-y-2 text-xs text-red-200">
            <p className="leading-relaxed">{pipelineError}</p>
            {needsApkBackendSetup && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onOpenServerSettings}
                  className="min-h-[36px] px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold transition-colors whitespace-nowrap"
                >
                  تنظیم آدرس سرور
                </button>
                <button
                  type="button"
                  onClick={() => onSwitchOperationMode('offline')}
                  className="min-h-[36px] px-3 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  رفتن به حالت آفلاین
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Clean Minimal Audio Player */}
      <section className="bg-[#13171D] border border-white/10 rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-white truncate">
              {currentEdition?.broadcastTitle || 'رادیو خبر آماده پخش است'}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span>{currentEdition?.categoryLabel || 'دسته انتخابی'}</span>
              <span aria-hidden="true">·</span>
              <span>
                {currentEdition ? formatPersianDate(currentEdition.createdAt) : 'بدون بخش فعال'}
              </span>
              {currentEdition?.hasAudio && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-400">فایل WAV آماده</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#0B0D10] border border-white/10 rounded-xl shrink-0">
            <button
              onClick={() => onSwitchTtsEngine('gemini_tts')}
              className={`min-h-[34px] px-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                settings.ttsEngine === 'gemini_tts'
                  ? 'bg-[#1D2430] text-amber-400'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              صوت هوشمند
            </button>
            <button
              onClick={() => onSwitchTtsEngine('offline_speech')}
              className={`min-h-[34px] px-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                settings.ttsEngine === 'offline_speech'
                  ? 'bg-[#1D2430] text-amber-400'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              گوینده آفلاین
            </button>
          </div>
        </div>

        {settings.ttsEngine === 'gemini_tts' && currentEdition && !currentEdition.hasAudio && (
          <div className="bg-[#0E1116] border border-white/10 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <p className="text-xs text-zinc-300">
              فایل WAV برای این متن ساخته نشده؛ در حال حاضر با گوینده آفلاین پخش می‌شود.
            </p>
            <button
              onClick={onSynthesizeCurrentScript}
              disabled={isSynthesizingAudio || !currentEdition.script.trim()}
              className="min-h-[38px] px-3 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <FileAudio className="w-4 h-4" />
              <span>{isSynthesizingAudio ? 'در حال ساخت صوت...' : 'ساخت فایل WAV'}</span>
            </button>
          </div>
        )}

        {effectiveMode === 'offline_speech' && !persianVoiceAvailable && currentEdition && (
          <p className="text-[11px] text-zinc-400">
            بسته صدای فارسی (fa-IR) روی مرورگر یافت نشد؛ در اندروید گوینده فارسی دستگاه فعال می‌شود.
          </p>
        )}

        {/* Progress Bar */}
        <div className="space-y-1.5">
          {effectiveMode === 'gemini_tts' ? (
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={Math.min(currentTime, duration || 100)}
              onChange={(e) => onSeekToTime(Number(e.target.value))}
              disabled={!currentEdition?.hasAudio}
              aria-label="نوار پیشرفت صوت"
              className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer accent-amber-500"
            />
          ) : (
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all duration-200 rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
              />
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-zinc-400 font-mono-tabular">
            <span>
              {effectiveMode === 'gemini_tts'
                ? formatTime(currentTime)
                : `جمله ${sentences.length > 0 ? activeSentenceIdx + 1 : 0}`}
            </span>
            <span>
              {effectiveMode === 'gemini_tts' ? formatTime(duration) : `${sentences.length} جمله`}
            </span>
          </div>
        </div>

        {/* Transport & Speed */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => (effectiveMode === 'gemini_tts' ? onSkipBySeconds(-15) : onPrev())}
              disabled={!currentEdition}
              aria-label={effectiveMode === 'gemini_tts' ? '۱۵ ثانیه قبل' : 'جمله قبلی'}
              className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-[#1A2029] hover:bg-[#242C38] disabled:opacity-40 text-zinc-200 flex items-center justify-center gap-1 text-xs font-medium transition-colors"
            >
              {effectiveMode === 'gemini_tts' ? (
                <>
                  <RotateCw className="w-4 h-4" />
                  <span className="tabular-nums">15-</span>
                </>
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
            </button>

            <button
              onClick={onTogglePlay}
              disabled={!currentEdition || !currentEdition.script.trim()}
              aria-label={isPlaying ? 'توقف' : 'پخش'}
              className="min-h-[46px] min-w-[112px] px-5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] disabled:opacity-40 text-zinc-950 font-bold text-sm flex items-center justify-center gap-2 transition-all"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-5 h-5 fill-current" />
                  <span>توقف</span>
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" />
                  <span>پخش خبر</span>
                </>
              )}
            </button>

            <button
              onClick={() => (effectiveMode === 'gemini_tts' ? onSkipBySeconds(15) : onNext())}
              disabled={!currentEdition}
              aria-label={effectiveMode === 'gemini_tts' ? '۱۵ ثانیه بعد' : 'جمله بعدی'}
              className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-[#1A2029] hover:bg-[#242C38] disabled:opacity-40 text-zinc-200 flex items-center justify-center gap-1 text-xs font-medium transition-colors"
            >
              {effectiveMode === 'gemini_tts' ? (
                <>
                  <span className="tabular-nums">15+</span>
                  <RotateCcw className="w-4 h-4" />
                </>
              ) : (
                <ChevronLeft className="w-5 h-5" />
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onCycleSleepTimer}
              className={`min-h-[38px] px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                sleepRemainingSec !== null
                  ? 'bg-amber-500/15 border-amber-500/45 text-amber-300'
                  : 'bg-[#0B0D10] border-white/10 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span className="font-mono-tabular">
                {sleepRemainingSec !== null ? formatTime(sleepRemainingSec) : 'خواب'}
              </span>
            </button>

            <div className="flex items-center gap-1 p-1 bg-[#0B0D10] border border-white/10 rounded-xl">
              {[1, 1.25, 1.5].map((spd) => (
                <button
                  key={spd}
                  onClick={() => onSpeedChange(spd)}
                  className={`min-h-[34px] px-2 rounded-lg text-xs font-mono-tabular font-semibold transition-colors ${
                    settings.playbackSpeed === spd
                      ? 'bg-zinc-100 text-zinc-950'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {isScriptOutOfSync && (
          <div className="bg-amber-500/10 border border-amber-500/35 rounded-xl p-3 flex items-center gap-2 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>متن خبر ویرایش شده است؛ برای هماهنگی صدا، فایل صوتی را به‌روزرسانی کنید.</span>
          </div>
        )}

        {currentEdition && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-white/10">
            <div className="flex flex-wrap items-center gap-2">
              {currentEdition.hasAudio && currentEdition.audioBlob && (
                <button
                  onClick={() => onDownloadAudio(currentEdition)}
                  className="min-h-[40px] px-3.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  <span>دانلود صوت (WAV)</span>
                </button>
              )}

              <button
                onClick={onSynthesizeCurrentScript}
                disabled={isSynthesizingAudio || !currentEdition.script.trim()}
                className={`min-h-[40px] px-3.5 rounded-xl disabled:opacity-50 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  isScriptOutOfSync
                    ? 'bg-amber-500 hover:bg-amber-400 text-zinc-950'
                    : 'bg-[#1A2029] hover:bg-[#232B37] text-zinc-200'
                }`}
              >
                <Volume2
                  className={`w-4 h-4 ${
                    isScriptOutOfSync ? 'text-zinc-950' : 'text-amber-400'
                  } ${isSynthesizingAudio ? 'animate-pulse' : ''}`}
                />
                <span>
                  {isSynthesizingAudio
                    ? 'در حال تولید...'
                    : isScriptOutOfSync
                      ? 'به‌روزرسانی فایل صوتی'
                      : currentEdition.hasAudio
                        ? 'تولید مجدد صوت'
                        : 'تولید فایل صوتی (WAV)'}
                </span>
              </button>
            </div>

            {currentEdition.cards.length > 0 && (
              <button
                type="button"
                onClick={onOpenCardsTab}
                className="min-h-[40px] px-3 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-amber-300 flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Newspaper className="w-3.5 h-3.5" />
                <span>کارت‌های خبر ({currentEdition.cards.length})</span>
              </button>
            )}
          </div>
        )}
      </section>

      {/* Clean Minimal Radio Teleprompter */}
      <section className="bg-[#13171D] border border-white/10 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 p-1 bg-[#0B0D10] border border-white/10 rounded-xl">
            <button
              onClick={() => setScriptViewMode('teleprompter')}
              className={`min-h-[36px] px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                scriptViewMode === 'teleprompter'
                  ? 'bg-[#1D2430] text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Radio className="w-3.5 h-3.5 text-amber-400" />
              <span>تله‌پرامپتر</span>
            </button>
            <button
              onClick={() => setScriptViewMode('edit')}
              className={`min-h-[36px] px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                scriptViewMode === 'edit'
                  ? 'bg-[#1D2430] text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5 text-amber-400" />
              <span>ویرایش متن</span>
            </button>
          </div>

          <button
            onClick={handleCopyScript}
            disabled={!currentEdition?.script}
            className="min-h-[36px] px-3 rounded-xl bg-[#1A2029] hover:bg-[#232B37] disabled:opacity-40 text-zinc-300 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            {copiedScript ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">کپی شد</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>کپی</span>
              </>
            )}
          </button>
        </div>

        {!currentEdition ? (
          <div className="py-10 px-4 text-center space-y-2.5 border border-dashed border-white/10 rounded-xl">
            <Headphones className="w-9 h-9 text-zinc-600 mx-auto" />
            <p className="text-sm font-semibold text-zinc-200">
              راویو · روایتِ هوشمندِ خبر
            </p>
            <p className="text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
              یک موضوع را انتخاب کنید و دکمه «دریافت و ساخت فوری خبر» را بزنید.
            </p>
          </div>
        ) : scriptViewMode === 'teleprompter' ? (
          <div
            ref={teleprompterBoxRef}
            className="max-h-[380px] overflow-y-auto overflow-x-hidden space-y-2 pl-1 scroll-smooth"
          >
            {sentences.map((sentence, idx) => {
              const isActive = idx === activeSentenceIdx;
              const words = sentence.split(/\s+/);
              const litCount = isActive ? Math.max(1, Math.ceil(words.length * activeWordRatio)) : 0;
              return (
                <button
                  key={`${idx}-${sentence.slice(0, 16)}`}
                  ref={(el) => {
                    teleprompterLineRefs.current[idx] = el;
                  }}
                  onClick={() => onJumpToSentence(idx)}
                  className={`w-full text-right p-3 rounded-xl transition-colors leading-7 sm:leading-8 text-sm sm:text-base block ${
                    isActive
                      ? 'bg-amber-500/15 text-amber-100 border border-amber-500/35 font-semibold'
                      : 'text-zinc-300 hover:bg-white/5 border border-transparent'
                  }`}
                >
                  {isActive ? (
                    <span>
                      {words.map((w, wIdx) => (
                        <span key={wIdx} className={wIdx < litCount ? 'text-amber-300' : 'text-white'}>
                          {w}{' '}
                        </span>
                      ))}
                    </span>
                  ) : (
                    sentence
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <textarea
            value={currentEdition.script}
            onChange={(e) => onScriptEdit(e.target.value)}
            rows={10}
            dir="rtl"
            placeholder="متن بخش خبری رادیویی..."
            className="w-full rounded-xl bg-[#0B0D10] border border-white/15 focus:border-amber-500 focus:outline-none p-4 text-sm sm:text-base leading-8 text-zinc-100 resize-y"
          />
        )}
      </section>
    </div>
  );
}
