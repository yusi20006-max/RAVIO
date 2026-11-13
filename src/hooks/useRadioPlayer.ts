import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TTSEngineType } from '../types/radio';

export function splitScriptIntoSentences(script: string): string[] {
  if (!script || !script.trim()) return [];
  return script
    .split(/(?<=[.!؟۔\n])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

interface UseRadioPlayerOptions {
  script: string;
  title: string;
  categoryLabel: string;
  audioBlob?: Blob;
  ttsEngine: TTSEngineType;
  playbackSpeed: number;
  onSpeedChange: (speed: number) => void;
  onTrackEnded?: () => void;
}

export function useRadioPlayer({
  script,
  title,
  categoryLabel,
  audioBlob,
  ttsEngine,
  playbackSpeed,
  onSpeedChange,
  onTrackEnded,
}: UseRadioPlayerOptions) {
  const sentences = useMemo(() => splitScriptIntoSentences(script), [script]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeSentenceIdx, setActiveSentenceIdx] = useState(0);
  const [activeWordRatio, setActiveWordRatio] = useState(0);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [persianVoiceAvailable, setPersianVoiceAvailable] = useState(false);

  const speechCancelledRef = useRef(false);
  const activeIdxRef = useRef(0);
  const isPlayingRef = useRef(false);
  const speechFallbackTimerRef = useRef<number | null>(null);
  const onTrackEndedRef = useRef(onTrackEnded);
  const autoPlayPendingRef = useRef(false);

  useEffect(() => {
    onTrackEndedRef.current = onTrackEnded;
  }, [onTrackEnded]);

  const clearSpeechTimer = useCallback(() => {
    if (speechFallbackTimerRef.current !== null) {
      window.clearInterval(speechFallbackTimerRef.current);
      speechFallbackTimerRef.current = null;
    }
  }, []);

  // Sync object URL when audioBlob changes
  useEffect(() => {
    if (!audioBlob) {
      setAudioUrl(null);
      setCurrentTime(0);
      setDuration(0);
      return;
    }
    const url = URL.createObjectURL(audioBlob);
    setAudioUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [audioBlob]);

  // Discover SpeechSynthesis voices
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
      setPersianVoiceAvailable(
        voices.some((v) => v.lang.toLowerCase().startsWith('fa'))
      );
    };
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, []);

  // Cumulative character ratios for highlighting teleprompter during WAV playback
  const sentenceOffsets = useMemo(() => {
    const totalChars = sentences.reduce((acc, s) => acc + s.length, 0) || 1;
    let running = 0;
    return sentences.map((s) => {
      const startRatio = running / totalChars;
      running += s.length;
      const endRatio = running / totalChars;
      return { startRatio, endRatio };
    });
  }, [sentences]);

  const stopSpeech = useCallback(() => {
    speechCancelledRef.current = true;
    clearSpeechTimer();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    isPlayingRef.current = false;
  }, [clearSpeechTimer]);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    isPlayingRef.current = false;
  }, []);

  const stopAll = useCallback(() => {
    stopSpeech();
    stopAudio();
  }, [stopSpeech, stopAudio]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      speechCancelledRef.current = true;
      clearSpeechTimer();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [clearSpeechTimer]);

  // Reset position when script changes significantly
  useEffect(() => {
    stopAll();
    setActiveSentenceIdx(0);
    activeIdxRef.current = 0;
    setActiveWordRatio(0);
    setCurrentTime(0);
  }, [script, stopAll]);

  // Apply playbackRate to HTML5 Audio
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, audioUrl]);

  const speakSentenceAt = useCallback(
    (index: number, speedOverride?: number) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      clearSpeechTimer();

      if (index < 0 || index >= sentences.length) {
        setIsPlaying(false);
        isPlayingRef.current = false;
        setActiveSentenceIdx(0);
        activeIdxRef.current = 0;
        setActiveWordRatio(0);
        return;
      }

      window.speechSynthesis.cancel();
      speechCancelledRef.current = false;

      const text = sentences[index];
      const utterance = new SpeechSynthesisUtterance(text);

      const faVoice = availableVoices.find((v) =>
        v.lang.toLowerCase().startsWith('fa')
      );
      if (faVoice) {
        utterance.voice = faVoice;
        utterance.lang = faVoice.lang;
      } else {
        utterance.lang = 'fa-IR';
      }

      const rate = speedOverride ?? playbackSpeed;
      utterance.rate = rate;
      utterance.pitch = 1;

      setActiveSentenceIdx(index);
      activeIdxRef.current = index;
      setActiveWordRatio(0.05);
      setIsPlaying(true);
      isPlayingRef.current = true;

      let sawBoundary = false;
      const startedAt = performance.now();
      const estimatedDurationMs = Math.max(1200, (text.length * 72) / rate);

      speechFallbackTimerRef.current = window.setInterval(() => {
        if (speechCancelledRef.current || sawBoundary) return;
        const elapsed = performance.now() - startedAt;
        setActiveWordRatio(Math.min(0.95, elapsed / estimatedDurationMs));
      }, 80);

      utterance.onboundary = (event) => {
        if (speechCancelledRef.current) return;
        if (typeof event.charIndex === 'number' && text.length > 0) {
          sawBoundary = true;
          setActiveWordRatio(Math.min(1, Math.max(0.05, (event.charIndex + 4) / text.length)));
        }
      };

      utterance.onend = () => {
        clearSpeechTimer();
        if (speechCancelledRef.current) return;
        setActiveWordRatio(1);
        const nextIdx = index + 1;
        if (nextIdx < sentences.length) {
          speakSentenceAt(nextIdx, speedOverride);
        } else {
          setIsPlaying(false);
          isPlayingRef.current = false;
          onTrackEndedRef.current?.();
        }
      };

      utterance.onerror = () => {
        clearSpeechTimer();
        if (!speechCancelledRef.current) {
          setIsPlaying(false);
          isPlayingRef.current = false;
        }
      };

      window.speechSynthesis.speak(utterance);
    },
    [availableVoices, clearSpeechTimer, playbackSpeed, sentences]
  );

  const effectiveMode: TTSEngineType =
    ttsEngine === 'gemini_tts' && audioUrl ? 'gemini_tts' : 'offline_speech';

  const syncFromAudioTime = useCallback(
    (t: number, d: number) => {
      setCurrentTime(t);
      if (d > 0 && sentenceOffsets.length > 0) {
        const ratio = Math.min(1, Math.max(0, t / d));
        const idx = sentenceOffsets.findIndex(
          (o) => ratio >= o.startRatio && ratio <= o.endRatio
        );
        const targetIdx = idx === -1 ? sentenceOffsets.length - 1 : idx;
        if (targetIdx !== activeIdxRef.current) {
          setActiveSentenceIdx(targetIdx);
          activeIdxRef.current = targetIdx;
        }
        const bounds = sentenceOffsets[targetIdx];
        const span = Math.max(0.0001, bounds.endRatio - bounds.startRatio);
        const within = Math.min(1, Math.max(0, (ratio - bounds.startRatio) / span));
        setActiveWordRatio(within);
      }
    },
    [sentenceOffsets]
  );

  // 60fps smooth teleprompter word/line tracking while HTML5 WAV Audio is playing
  useEffect(() => {
    if (effectiveMode !== 'gemini_tts' || !isPlaying) return;
    let rafId = 0;
    const tick = () => {
      if (audioRef.current && !audioRef.current.paused) {
        const t = audioRef.current.currentTime;
        const d = audioRef.current.duration || duration;
        syncFromAudioTime(t, d);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [duration, effectiveMode, isPlaying, syncFromAudioTime]);

  const togglePlay = useCallback(() => {
    if (effectiveMode === 'gemini_tts' && audioRef.current && audioUrl) {
      if (isPlayingRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
        isPlayingRef.current = false;
      } else {
        audioRef.current.playbackRate = playbackSpeed;
        audioRef.current
          .play()
          .then(() => {
            setIsPlaying(true);
            isPlayingRef.current = true;
          })
          .catch(() => {
            speakSentenceAt(activeIdxRef.current);
          });
      }
      return;
    }

    // Offline SpeechSynthesis
    if (isPlayingRef.current) {
      stopSpeech();
    } else if (sentences.length > 0) {
      speakSentenceAt(activeIdxRef.current);
    }
  }, [audioUrl, effectiveMode, playbackSpeed, sentences.length, speakSentenceAt, stopSpeech]);

  const seekToTime = useCallback(
    (seconds: number) => {
      if (effectiveMode !== 'gemini_tts' || !audioRef.current) return;
      const d = audioRef.current.duration || duration || 0;
      const clamped = Math.max(0, Math.min(seconds, d));
      audioRef.current.currentTime = clamped;
      syncFromAudioTime(clamped, d);
    },
    [duration, effectiveMode, syncFromAudioTime]
  );

  const skipBySeconds = useCallback(
    (delta: number) => {
      if (effectiveMode === 'gemini_tts' && audioRef.current) {
        seekToTime((audioRef.current.currentTime || 0) + delta);
      } else {
        const step = delta > 0 ? 1 : -1;
        const target = Math.max(0, Math.min(sentences.length - 1, activeIdxRef.current + step));
        setActiveSentenceIdx(target);
        activeIdxRef.current = target;
        setActiveWordRatio(0);
        if (isPlayingRef.current) {
          speakSentenceAt(target);
        }
      }
    },
    [effectiveMode, seekToTime, sentences.length, speakSentenceAt]
  );

  const nextTrackOrSentence = useCallback(() => {
    if (effectiveMode === 'gemini_tts') {
      skipBySeconds(15);
    } else {
      const target = Math.min(sentences.length - 1, activeIdxRef.current + 1);
      setActiveSentenceIdx(target);
      activeIdxRef.current = target;
      setActiveWordRatio(0);
      if (isPlayingRef.current) speakSentenceAt(target);
    }
  }, [effectiveMode, sentences.length, skipBySeconds, speakSentenceAt]);

  const prevTrackOrSentence = useCallback(() => {
    if (effectiveMode === 'gemini_tts') {
      skipBySeconds(-15);
    } else {
      const target = Math.max(0, activeIdxRef.current - 1);
      setActiveSentenceIdx(target);
      activeIdxRef.current = target;
      setActiveWordRatio(0);
      if (isPlayingRef.current) speakSentenceAt(target);
    }
  }, [effectiveMode, skipBySeconds, speakSentenceAt]);

  const jumpToSentence = useCallback(
    (idx: number) => {
      const target = Math.max(0, Math.min(sentences.length - 1, idx));
      setActiveSentenceIdx(target);
      activeIdxRef.current = target;
      setActiveWordRatio(0);

      if (effectiveMode === 'gemini_tts' && audioRef.current && duration > 0) {
        const ratio = sentenceOffsets[target]?.startRatio ?? 0;
        const targetSec = ratio * duration;
        audioRef.current.currentTime = targetSec;
        setCurrentTime(targetSec);
        if (!isPlayingRef.current) {
          audioRef.current
            .play()
            .then(() => {
              setIsPlaying(true);
              isPlayingRef.current = true;
            })
            .catch(() => {});
        }
      } else {
        speakSentenceAt(target);
      }
    },
    [duration, effectiveMode, sentenceOffsets, sentences.length, speakSentenceAt]
  );

  const cycleSpeed = useCallback(() => {
    const speeds = [1, 1.25, 1.5];
    const currentIdx = speeds.indexOf(playbackSpeed);
    const nextSpeed = speeds[(currentIdx + 1) % speeds.length];
    onSpeedChange(nextSpeed);
    if (effectiveMode === 'offline_speech' && isPlayingRef.current) {
      speakSentenceAt(activeIdxRef.current, nextSpeed);
    }
  }, [effectiveMode, onSpeedChange, playbackSpeed, speakSentenceAt]);

  const handleAudioTimeUpdate = useCallback(() => {
    if (!audioRef.current) return;
    const t = audioRef.current.currentTime;
    const d = audioRef.current.duration || duration;
    syncFromAudioTime(t, d);
  }, [duration, syncFromAudioTime]);

  // Android Auto / Bluetooth steering wheel MediaSession integration
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title || 'بخش خبری راویو',
        artist: 'Ravio · راویو',
        album: categoryLabel || 'اخبار روز',
      });
      navigator.mediaSession.setActionHandler('play', () => {
        if (!isPlayingRef.current) togglePlay();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        if (isPlayingRef.current) togglePlay();
      });
      navigator.mediaSession.setActionHandler('nexttrack', nextTrackOrSentence);
      navigator.mediaSession.setActionHandler('previoustrack', prevTrackOrSentence);
      navigator.mediaSession.setActionHandler('seekforward', () => skipBySeconds(15));
      navigator.mediaSession.setActionHandler('seekbackward', () => skipBySeconds(-15));
    } catch {
      // Ignore unsupported MediaSession actions
    }
  }, [categoryLabel, nextTrackOrSentence, prevTrackOrSentence, skipBySeconds, title, togglePlay]);

  // Trigger queued auto-play when switching editions automatically (e.g. Car Mode Auto-Next)
  useEffect(() => {
    if (!autoPlayPendingRef.current) return;
    if (ttsEngine === 'gemini_tts' && audioBlob && !audioUrl) return;

    if (ttsEngine === 'gemini_tts' && audioUrl && audioRef.current) {
      autoPlayPendingRef.current = false;
      const el = audioRef.current;
      el.currentTime = 0;
      el.playbackRate = playbackSpeed;
      el.play()
        .then(() => {
          setIsPlaying(true);
          isPlayingRef.current = true;
        })
        .catch(() => {
          if (sentences.length > 0) speakSentenceAt(0);
        });
      return;
    }

    if (sentences.length > 0) {
      autoPlayPendingRef.current = false;
      speakSentenceAt(0);
    }
  }, [audioBlob, audioUrl, playbackSpeed, sentences.length, speakSentenceAt, ttsEngine]);

  const queueAutoPlay = useCallback(() => {
    autoPlayPendingRef.current = true;
  }, []);

  const notifyAudioEnded = useCallback(() => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    onTrackEndedRef.current?.();
  }, []);

  const progressPercent =
    effectiveMode === 'gemini_tts'
      ? duration > 0
        ? (currentTime / duration) * 100
        : 0
      : sentences.length > 0
        ? ((activeSentenceIdx + 1) / sentences.length) * 100
        : 0;

  return {
    audioRef,
    audioUrl,
    effectiveMode,
    sentences,
    isPlaying,
    currentTime,
    duration,
    setDuration,
    activeSentenceIdx,
    activeWordRatio,
    progressPercent,
    persianVoiceAvailable,
    togglePlay,
    seekToTime,
    skipBySeconds,
    nextTrackOrSentence,
    prevTrackOrSentence,
    jumpToSentence,
    cycleSpeed,
    stopAll,
    queueAutoPlay,
    notifyAudioEnded,
    handleAudioTimeUpdate,
    setIsPlaying: (val: boolean) => {
      setIsPlaying(val);
      isPlayingRef.current = val;
    },
  };
}
