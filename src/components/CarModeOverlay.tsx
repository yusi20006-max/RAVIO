import {
  Archive,
  Car,
  ChevronLeft,
  ChevronRight,
  Gauge,
  ListVideo,
  Moon,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Tv,
  Type,
  Volume2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BroadcastEdition, PipelineStage, TTSEngineType } from '../types/radio';

interface CarModeOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  edition: BroadcastEdition | null;
  archiveEditions: BroadcastEdition[];
  sentences: string[];
  activeSentenceIdx: number;
  activeWordRatio: number;
  isPlaying: boolean;
  effectiveMode: TTSEngineType;
  ttsEngineSetting: TTSEngineType;
  progressPercent: number;
  currentTime: number;
  duration: number;
  playbackSpeed: number;
  pipelineStage: PipelineStage;
  autoPlayNextInCar: boolean;
  sleepRemainingSec: number | null;
  onTogglePlay: () => void;
  onSeekToTime: (sec: number) => void;
  onNext: () => void;
  onPrev: () => void;
  onJumpToSentence: (idx: number) => void;
  onCycleSpeed: () => void;
  onSwitchTtsEngine: (engine: TTSEngineType) => void;
  onLoadArchivedEdition: (edition: BroadcastEdition) => void;
  onFetchNow: () => void;
  onToggleAutoPlayNext: () => void;
  onCycleSleepTimer: () => void;
}

function formatClockTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

type MonitorFontSize = 'md' | 'lg' | 'xl';

const FONT_CLASSES: Record<MonitorFontSize, { active: string; inactive: string }> = {
  md: {
    active: 'text-2xl sm:text-3xl lg:text-4xl leading-[1.7]',
    inactive: 'text-lg sm:text-xl lg:text-2xl leading-relaxed',
  },
  lg: {
    active: 'text-3xl sm:text-4xl lg:text-5xl leading-[1.7]',
    inactive: 'text-xl sm:text-2xl lg:text-3xl leading-relaxed',
  },
  xl: {
    active: 'text-4xl sm:text-5xl lg:text-6xl leading-[1.7]',
    inactive: 'text-2xl sm:text-3xl lg:text-4xl leading-relaxed',
  },
};

export function CarModeOverlay({
  isOpen,
  onClose,
  edition,
  archiveEditions,
  sentences,
  activeSentenceIdx,
  activeWordRatio,
  isPlaying,
  effectiveMode,
  ttsEngineSetting,
  progressPercent,
  currentTime,
  duration,
  playbackSpeed,
  pipelineStage,
  autoPlayNextInCar,
  sleepRemainingSec,
  onTogglePlay,
  onSeekToTime,
  onNext,
  onPrev,
  onJumpToSentence,
  onCycleSpeed,
  onSwitchTtsEngine,
  onLoadArchivedEdition,
  onFetchNow,
  onToggleAutoPlayNext,
  onCycleSleepTimer,
}: CarModeOverlayProps) {
  const [fontSize, setFontSize] = useState<MonitorFontSize>('lg');
  const monitorContainerRef = useRef<HTMLDivElement | null>(null);
  const sentenceRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Keep screen awake while Car / TV Monitor mode is open
  useEffect(() => {
    if (!isOpen) return;
    let wakeLock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    if (nav.wakeLock) {
      nav.wakeLock
        .request('screen')
        .then((sentinel) => {
          wakeLock = sentinel;
        })
        .catch(() => {});
    }
    return () => {
      wakeLock?.release().catch(() => {});
    };
  }, [isOpen]);

  // Smoothly center the currently spoken sentence vertically inside the TV Monitor
  useEffect(() => {
    if (!isOpen) return;
    const container = monitorContainerRef.current;
    const activeEl = sentenceRefs.current[activeSentenceIdx];
    if (!container || !activeEl) return;

    const targetTop =
      activeEl.offsetTop - container.clientHeight / 2 + activeEl.clientHeight / 2;

    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: 'smooth',
    });
  }, [activeSentenceIdx, isOpen, fontSize, sentences.length]);

  const currentArchiveIdx = useMemo(() => {
    if (!edition) return -1;
    return archiveEditions.findIndex((item) => item.id === edition.id);
  }, [archiveEditions, edition]);

  if (!isOpen) return null;

  const isBusy = pipelineStage !== 'idle' && pipelineStage !== 'error';

  const cycleFontSize = () => {
    setFontSize((prev) => (prev === 'md' ? 'lg' : prev === 'lg' ? 'xl' : 'md'));
  };

  const handlePrevEdition = () => {
    if (archiveEditions.length <= 1) return;
    const nextIdx =
      currentArchiveIdx <= 0 ? archiveEditions.length - 1 : currentArchiveIdx - 1;
    onLoadArchivedEdition(archiveEditions[nextIdx]);
  };

  const handleNextEdition = () => {
    if (archiveEditions.length <= 1) return;
    const nextIdx =
      currentArchiveIdx === -1 || currentArchiveIdx >= archiveEditions.length - 1
        ? 0
        : currentArchiveIdx + 1;
    onLoadArchivedEdition(archiveEditions[nextIdx]);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black text-yellow-100 p-3 sm:p-5 pt-safe pb-safe overflow-hidden max-w-full"
      role="dialog"
      aria-modal="true"
      aria-label="حالت رانندگی و تله‌پرامپتر تلویزیون"
    >
      {/* Top Cockpit Bar */}
      <div className="flex items-center justify-between gap-2 border-b border-yellow-400/25 pb-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-yellow-400/10 border border-yellow-400/40 flex items-center justify-center shrink-0">
            <Car className="w-5 h-5 text-yellow-300" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-yellow-200 truncate">
              {edition?.broadcastTitle || 'راویو · تله‌پرامپتر تلویزیون و خودرو'}
            </h2>
            <p className="text-xs text-yellow-400/75 truncate">
              {edition?.categoryLabel || 'آماده پخش'} ·{' '}
              {effectiveMode === 'gemini_tts' ? 'صوت هوش مصنوعی' : 'گوینده آفلاین'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={cycleFontSize}
            title="تغییر اندازه متن تله‌پرامپتر"
            className="min-h-[44px] px-3 rounded-xl bg-[#070707] hover:bg-yellow-400/10 border border-yellow-400/35 text-xs font-semibold text-yellow-100 flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <Type className="w-4 h-4 text-yellow-300" />
            <span className="hidden sm:inline">
              {fontSize === 'md' ? 'فونت متوسط' : fontSize === 'lg' ? 'فونت درشت' : 'فونت تلویزیون'}
            </span>
          </button>

          <button
            onClick={onClose}
            className="min-h-[44px] px-3.5 rounded-xl bg-[#0A0A0A] hover:bg-yellow-400/15 border border-yellow-400/35 active:scale-[0.98] text-yellow-100 font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0"
          >
            <X className="w-5 h-5 text-yellow-300" />
            <span>خروج</span>
          </button>
        </div>
      </div>

      {/* Main Responsive Stage: Portrait Stacked / Landscape Side-by-Side TV Teleprompter */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4 py-3 overflow-hidden">
        {/* Television Teleprompter Screen */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col min-h-[240px] bg-black border-2 border-yellow-400/45 rounded-3xl overflow-hidden relative shadow-[0_0_40px_rgba(250,204,21,0.08)]">
          {/* Monitor Header Strip */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#050505] border-b border-yellow-400/25 text-xs text-yellow-300/80 shrink-0">
            <div className="flex items-center gap-2">
              <Tv className="w-4 h-4 text-yellow-300" />
              <span className="font-bold text-yellow-200">تله‌پرامپتر تلویزیون</span>
            </div>
            <span className="font-mono-tabular text-yellow-300 font-semibold">
              {sentences.length > 0
                ? `خط ${activeSentenceIdx + 1} از ${sentences.length}`
                : 'بدون متن'}
            </span>
          </div>

          {/* Moving Scrolling Teleprompter Viewport */}
          <div className="relative flex-1 min-h-0 overflow-hidden bg-black">
            {/* Top & Bottom Pure-Black TV Fades */}
            <div className="pointer-events-none absolute top-0 left-0 right-0 h-14 bg-gradient-to-b from-black via-black/80 to-transparent z-10" />
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black via-black/80 to-transparent z-10" />

            <div
              ref={monitorContainerRef}
              className="h-full overflow-y-auto overflow-x-hidden px-4 sm:px-8 py-20 space-y-6 scroll-smooth bg-black"
            >
              {!edition || sentences.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-3 py-10">
                  <p className="text-xl sm:text-3xl font-extrabold text-yellow-300 [text-shadow:0_0_18px_rgba(253,224,71,0.6)]">
                    متن خبر آماده نیست
                  </p>
                  <p className="text-xs sm:text-base text-yellow-200/70">
                    برای دریافت و پخش خبر تازه، دکمه «دریافت خبر تازه» را لمس کنید.
                  </p>
                </div>
              ) : (
                sentences.map((sentence, idx) => {
                  const isActive = idx === activeSentenceIdx;
                  const isPast = idx < activeSentenceIdx;
                  const words = sentence.split(/\s+/);
                  const litWordsCount = isActive
                    ? Math.max(1, Math.ceil(words.length * activeWordRatio))
                    : 0;

                  return (
                    <button
                      key={`${idx}-${sentence.slice(0, 14)}`}
                      ref={(el) => {
                        sentenceRefs.current[idx] = el;
                      }}
                      type="button"
                      onClick={() => onJumpToSentence(idx)}
                      className={`w-full text-right block rounded-2xl px-5 py-4 transition-all duration-300 ${
                        isActive
                          ? `bg-yellow-400/10 border-2 border-yellow-400/70 shadow-[0_0_32px_rgba(250,204,21,0.16)] font-black ${FONT_CLASSES[fontSize].active}`
                          : isPast
                            ? `text-yellow-500/45 hover:text-yellow-300/80 ${FONT_CLASSES[fontSize].inactive}`
                            : `text-yellow-200/75 hover:text-yellow-200 ${FONT_CLASSES[fontSize].inactive}`
                      }`}
                    >
                      {isActive ? (
                        <span className="inline">
                          {words.map((word, wIdx) => (
                            <span
                              key={wIdx}
                              className={`transition-all duration-150 ${
                                wIdx < litWordsCount
                                  ? 'text-yellow-300 [text-shadow:0_0_20px_rgba(253,224,71,0.85),0_0_8px_rgba(250,204,21,0.65)]'
                                  : 'text-yellow-100 [text-shadow:0_0_10px_rgba(254,240,138,0.35)]'
                              }`}
                            >
                              {word}{' '}
                            </span>
                          ))}
                        </span>
                      ) : (
                        sentence
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right / Bottom Automotive Transport Deck */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col justify-between gap-3 shrink-0">
          {/* Progress & Seek Card */}
          <div className="bg-[#050505] border border-yellow-400/30 rounded-2xl p-3.5 sm:p-4 space-y-2.5">
            {effectiveMode === 'gemini_tts' ? (
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.2}
                value={Math.min(currentTime, duration || 100)}
                onChange={(e) => onSeekToTime(Number(e.target.value))}
                disabled={!edition?.hasAudio}
                aria-label="نوار پیشرفت صوت خودرو"
                className="w-full h-3 bg-yellow-400/15 border border-yellow-400/25 rounded-full appearance-none cursor-pointer accent-yellow-400"
              />
            ) : (
              <div className="w-full h-3 bg-yellow-400/15 border border-yellow-400/25 rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.65)] transition-all duration-200 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
                />
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-yellow-300/85 font-mono-tabular">
              <span>
                {effectiveMode === 'gemini_tts'
                  ? formatClockTime(currentTime)
                  : `جمله ${sentences.length > 0 ? activeSentenceIdx + 1 : 0}`}
              </span>
              <span>
                {effectiveMode === 'gemini_tts'
                  ? formatClockTime(duration)
                  : `${Math.round(progressPercent)}%`}
              </span>
            </div>

            {/* Quick Engine & Archive Controls */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1 p-1 bg-black border border-yellow-400/25 rounded-xl flex-1">
                <button
                  type="button"
                  onClick={() => onSwitchTtsEngine('gemini_tts')}
                  className={`flex-1 min-h-[36px] px-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                    ttsEngineSetting === 'gemini_tts'
                      ? 'bg-yellow-400 text-black'
                      : 'text-yellow-200/70 hover:text-yellow-100'
                  }`}
                >
                  صوت هوشمند
                </button>
                <button
                  type="button"
                  onClick={() => onSwitchTtsEngine('offline_speech')}
                  className={`flex-1 min-h-[36px] px-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                    ttsEngineSetting === 'offline_speech'
                      ? 'bg-yellow-400 text-black'
                      : 'text-yellow-200/70 hover:text-yellow-100'
                  }`}
                >
                  گوینده آفلاین
                </button>
              </div>

              {archiveEditions.length > 1 && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={handlePrevEdition}
                    title="بخش خبری قبلی در آرشیو"
                    className="min-h-[38px] min-w-[38px] rounded-xl bg-[#0A0A0A] hover:bg-yellow-400/15 border border-yellow-400/30 flex items-center justify-center text-yellow-200"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span className="text-[11px] text-yellow-200/85 px-1 flex items-center gap-1 font-mono-tabular">
                    <Archive className="w-3.5 h-3.5 text-yellow-300" />
                    {currentArchiveIdx + 1}/{archiveEditions.length}
                  </span>
                  <button
                    type="button"
                    onClick={handleNextEdition}
                    title="بخش خبری بعدی در آرشیو"
                    className="min-h-[38px] min-w-[38px] rounded-xl bg-[#0A0A0A] hover:bg-yellow-400/15 border border-yellow-400/30 flex items-center justify-center text-yellow-200"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Oversized Transport Buttons */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {/* Previous / Rewind */}
            <button
              onClick={onPrev}
              disabled={!edition}
              aria-label={effectiveMode === 'gemini_tts' ? '۱۵ ثانیه قبل' : 'جمله قبلی'}
              className="h-20 sm:h-24 rounded-2xl bg-[#070707] hover:bg-yellow-400/10 active:scale-[0.97] disabled:opacity-40 border border-yellow-400/35 flex flex-col items-center justify-center gap-1 transition-all"
            >
              {effectiveMode === 'gemini_tts' ? (
                <RotateCw className="w-7 h-7 sm:w-8 sm:h-8 text-yellow-300" />
              ) : (
                <ChevronRight className="w-8 h-8 sm:w-9 sm:h-9 text-yellow-300" />
              )}
              <span className="text-xs sm:text-sm font-bold text-yellow-100 whitespace-nowrap">
                {effectiveMode === 'gemini_tts' ? '۱۵ ثانیه قبل' : 'بخش قبلی'}
              </span>
            </button>

            {/* Massive Play / Pause */}
            <button
              onClick={onTogglePlay}
              disabled={!edition}
              aria-label={isPlaying ? 'توقف پخش' : 'شروع پخش'}
              className={`h-20 sm:h-24 rounded-2xl active:scale-[0.97] disabled:opacity-40 flex flex-col items-center justify-center gap-1 transition-all ${
                isPlaying
                  ? 'bg-emerald-400 hover:bg-emerald-300 text-black shadow-[0_0_24px_rgba(52,211,153,0.4)]'
                  : 'bg-yellow-400 hover:bg-yellow-300 text-black shadow-[0_0_24px_rgba(250,204,21,0.45)]'
              }`}
            >
              {isPlaying ? (
                <>
                  <Pause className="w-8 h-8 sm:w-10 sm:h-10 fill-current" />
                  <span className="text-sm sm:text-base font-extrabold whitespace-nowrap">توقف</span>
                </>
              ) : (
                <>
                  <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-current" />
                  <span className="text-sm sm:text-base font-extrabold whitespace-nowrap">پخش خبر</span>
                </>
              )}
            </button>

            {/* Next / Forward */}
            <button
              onClick={onNext}
              disabled={!edition}
              aria-label={effectiveMode === 'gemini_tts' ? '۱۵ ثانیه بعد' : 'جمله بعدی'}
              className="h-20 sm:h-24 rounded-2xl bg-[#070707] hover:bg-yellow-400/10 active:scale-[0.97] disabled:opacity-40 border border-yellow-400/35 flex flex-col items-center justify-center gap-1 transition-all"
            >
              {effectiveMode === 'gemini_tts' ? (
                <RotateCcw className="w-7 h-7 sm:w-8 sm:h-8 text-yellow-300" />
              ) : (
                <ChevronLeft className="w-8 h-8 sm:w-9 sm:h-9 text-yellow-300" />
              )}
              <span className="text-xs sm:text-sm font-bold text-yellow-100 whitespace-nowrap">
                {effectiveMode === 'gemini_tts' ? '۱۵ ثانیه بعد' : 'خبر بعدی'}
              </span>
            </button>
          </div>

          {/* Secondary Controls: Speed, Fetch Now, Auto-Next & Sleep Timer */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            <button
              onClick={onCycleSpeed}
              className="min-h-[48px] rounded-2xl bg-[#070707] hover:bg-yellow-400/10 border border-yellow-400/35 flex items-center justify-center gap-2 text-xs sm:text-sm font-bold text-yellow-100 active:scale-[0.98] transition-all whitespace-nowrap"
            >
              <Gauge className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-300" />
              <span className="tabular-nums">سرعت: {playbackSpeed}x</span>
            </button>

            <button
              onClick={onFetchNow}
              disabled={isBusy}
              className="min-h-[48px] rounded-2xl bg-[#070707] hover:bg-yellow-400/10 border border-yellow-400/35 flex items-center justify-center gap-2 text-xs sm:text-sm font-bold text-yellow-100 active:scale-[0.98] transition-all whitespace-nowrap disabled:opacity-50"
            >
              {isBusy ? (
                <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-300 animate-spin" />
              ) : (
                <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-300" />
              )}
              <span>{isBusy ? 'در حال دریافت...' : 'دریافت خبر تازه'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleAutoPlayNext}
              className={`min-h-[48px] px-2 rounded-2xl border flex items-center justify-center gap-1.5 text-xs font-bold active:scale-[0.98] transition-all whitespace-nowrap ${
                autoPlayNextInCar
                  ? 'bg-yellow-400/15 border-yellow-400/70 text-yellow-300'
                  : 'bg-[#070707] hover:bg-yellow-400/10 border-yellow-400/30 text-yellow-100/70'
              }`}
            >
              <ListVideo className="w-4 h-4 shrink-0" />
              <span>پخش خودکار بعدی: {autoPlayNextInCar ? 'روشن' : 'خاموش'}</span>
            </button>

            <button
              type="button"
              onClick={onCycleSleepTimer}
              className={`min-h-[48px] px-2 rounded-2xl border flex items-center justify-center gap-1.5 text-xs font-bold active:scale-[0.98] transition-all whitespace-nowrap ${
                sleepRemainingSec !== null
                  ? 'bg-yellow-400/15 border-yellow-400/70 text-yellow-300'
                  : 'bg-[#070707] hover:bg-yellow-400/10 border-yellow-400/30 text-yellow-100/80'
              }`}
            >
              <Moon className="w-4 h-4 shrink-0" />
              <span className="font-mono-tabular">
                {sleepRemainingSec !== null
                  ? `توقف: ${formatClockTime(sleepRemainingSec)}`
                  : 'تایمر خواب: خاموش'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
