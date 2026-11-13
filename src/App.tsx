import { Car, Newspaper, Radio, Rss, SlidersHorizontal, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CarModeOverlay } from './components/CarModeOverlay';
import { NewsCardsTab } from './components/NewsCardsTab';
import { PlayerScriptTab } from './components/PlayerScriptTab';
import { PWAInstallButton } from './components/PWAInstallButton';
import { SettingsSectionId, SettingsTab } from './components/SettingsTab';
import { SourcesTab } from './components/SourcesTab';
import { CATEGORY_OPTIONS, DEFAULT_SETTINGS } from './data/presets';
import { useOnlineStatus } from './hooks/usePWAInstall';
import { useRadioPlayer } from './hooks/useRadioPlayer';
import { syncAndroidWidgetConfig } from './services/androidWidgetBridge';
import { generateRadioScript, synthesizeGeminiAudio } from './services/aiService';
import {
  clearOutputDirectoryHandle,
  deleteArchivedEdition,
  estimateArchiveSizeMB,
  getAllArchivedEditions,
  getOutputDirectoryHandle,
  pruneArchiveToMax,
  saveEditionToArchive,
  saveOutputDirectoryHandle,
} from './services/archiveDb';
import {
  buildPodcastFilename,
  pickPodcastOutputDirectory,
  savePodcastFile,
  triggerBlobDownload,
} from './services/fileSaveService';
import { fetchCategoryFeeds, fetchMultiCategoryFeeds } from './services/rssService';
import {
  loadActiveCategory,
  loadFeeds,
  loadSettings,
  saveActiveCategory,
  saveFeeds,
  saveSettings,
  StudioBackupPayload,
} from './services/storageService';
import {
  ActiveTab,
  BroadcastEdition,
  BroadcastScopeId,
  FeedCategoryId,
  PipelineStage,
  RssFeedSource,
  StudioSettings,
  TTSEngineType,
} from './types/radio';

function getTodayDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getCurrentHHMM(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export default function App() {
  const isOnline = useOnlineStatus();
  const [activeTab, setActiveTab] = useState<ActiveTab>('player');
  const [requestedSettingsSection, setRequestedSettingsSection] = useState<{
    id: SettingsSectionId;
    nonce: number;
  } | null>(null);
  const [carModeOpen, setCarModeOpen] = useState(false);

  const [settings, setSettings] = useState<StudioSettings>(() => loadSettings());
  const [feeds, setFeeds] = useState<RssFeedSource[]>(() => loadFeeds());
  const [activeCategory, setActiveCategory] = useState<BroadcastScopeId>(() => loadActiveCategory());

  const [archiveEditions, setArchiveEditions] = useState<BroadcastEdition[]>([]);
  const [currentEdition, setCurrentEdition] = useState<BroadcastEdition | null>(null);

  const [pipelineStage, setPipelineStage] = useState<PipelineStage>('idle');
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [autoSaveNotice, setAutoSaveNotice] = useState<string | null>(null);
  const [isSynthesizingAudio, setIsSynthesizingAudio] = useState(false);

  const [sleepRemainingSec, setSleepRemainingSec] = useState<number | null>(null);
  const [outputDirectoryName, setOutputDirectoryName] = useState<string | null>(null);
  const outputDirHandleRef = useRef<unknown>(null);

  const isPipelineRunningRef = useRef(false);
  const lastAutoAttemptAtRef = useRef<number>(0);

  // Load IndexedDB offline archive & optional output directory handle on startup
  useEffect(() => {
    getAllArchivedEditions()
      .then((editions) => {
        setArchiveEditions(editions);
        if (editions.length > 0) {
          setCurrentEdition(editions[0]);
        }
      })
      .catch(() => {
        // IndexedDB unavailable in restricted environments
      });

    getOutputDirectoryHandle()
      .then((handle) => {
        if (handle && typeof (handle as { name?: string }).name === 'string') {
          outputDirHandleRef.current = handle;
          setOutputDirectoryName((handle as { name: string }).name);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    void syncAndroidWidgetConfig({ settings, feeds });
  }, [settings, feeds]);

  const updateSettings = useCallback((patch: Partial<StudioSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const handleSelectCategory = useCallback(
    (cat: BroadcastScopeId) => {
      setActiveCategory(cat);
      saveActiveCategory(cat);
      void syncAndroidWidgetConfig({ settings, feeds, activeCategory: cat });
    },
    [settings, feeds]
  );

  const handleToggleCombinedCategory = useCallback(
    (cat: FeedCategoryId) => {
      setSettings((prev) => {
        const exists = prev.combinedCategories.includes(cat);
        if (exists && prev.combinedCategories.length <= 1) {
          return prev; // Keep at least 1 category active
        }
        const nextCats = exists
          ? prev.combinedCategories.filter((c) => c !== cat)
          : [...prev.combinedCategories, cat];
        const next = { ...prev, combinedCategories: nextCats };
        saveSettings(next);
        return next;
      });
    },
    []
  );

  const handleToggleFeed = useCallback((id: string) => {
    setFeeds((prev) => {
      const next = prev.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f));
      saveFeeds(next);
      return next;
    });
  }, []);

  const handleAddCustomFeed = useCallback(
    (label: string, url: string, category: FeedCategoryId) => {
      const newFeed: RssFeedSource = {
        id: `custom-${Date.now()}`,
        label,
        url,
        category,
        enabled: true,
        isCustom: true,
      };
      setFeeds((prev) => {
        const next = [newFeed, ...prev];
        saveFeeds(next);
        return next;
      });
    },
    []
  );

  const handleRemoveFeed = useCallback((id: string) => {
    setFeeds((prev) => {
      const next = prev.filter((f) => f.id !== id);
      saveFeeds(next);
      return next;
    });
  }, []);

  const handleTrackEndedRef = useRef<() => void>(() => {});

  const player = useRadioPlayer({
    script: currentEdition?.script || '',
    title: currentEdition?.broadcastTitle || '',
    categoryLabel: currentEdition?.categoryLabel || '',
    audioBlob: currentEdition?.audioBlob,
    ttsEngine: settings.ttsEngine,
    playbackSpeed: settings.playbackSpeed,
    onSpeedChange: (speed) => updateSettings({ playbackSpeed: speed }),
    onTrackEnded: () => handleTrackEndedRef.current(),
  });

  // Auto-Next in Car Mode when current edition finishes playing
  useEffect(() => {
    handleTrackEndedRef.current = () => {
      if (!carModeOpen || !settings.autoPlayNextInCar || !currentEdition) return;
      const idx = archiveEditions.findIndex((item) => item.id === currentEdition.id);
      if (idx !== -1 && idx + 1 < archiveEditions.length) {
        player.queueAutoPlay();
        setCurrentEdition(archiveEditions[idx + 1]);
      }
    };
  }, [archiveEditions, carModeOpen, currentEdition, player, settings.autoPlayNextInCar]);

  // Sleep Timer countdown
  useEffect(() => {
    if (sleepRemainingSec === null) return;
    if (sleepRemainingSec <= 0) {
      player.stopAll();
      setSleepRemainingSec(null);
      return;
    }
    const timer = window.setInterval(() => {
      setSleepRemainingSec((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [player, sleepRemainingSec]);

  const handleCycleSleepTimer = useCallback(() => {
    setSleepRemainingSec((prev) => {
      if (prev === null) return 15 * 60;
      if (prev > 35 * 60) return null;
      if (prev > 20 * 60) return 45 * 60;
      return 30 * 60;
    });
  }, []);

  const runBroadcastPipeline = useCallback(
    async (
      targetScope: BroadcastScopeId,
      includeAudioGeneration: boolean,
      options?: { autoSaveFile?: boolean }
    ): Promise<boolean> => {
      if (isPipelineRunningRef.current) return false;
      isPipelineRunningRef.current = true;
      player.stopAll();
      setPipelineError(null);
      setAutoSaveNotice(null);

      const categoryLabel =
        targetScope === 'combined'
          ? 'خلاصه صبحگاهی ترکیبی'
          : CATEGORY_OPTIONS.find((c) => c.id === targetScope)?.label || 'اخبار روز';

      const generatedAtTs = Date.now();

      try {
        setPipelineStage('fetching_rss');
        const { items } =
          targetScope === 'combined'
            ? await fetchMultiCategoryFeeds(
                feeds,
                settings.combinedCategories,
                settings.maxNewsItems,
                settings.backendServerUrl
              )
            : await fetchCategoryFeeds(
                feeds,
                targetScope,
                settings.maxNewsItems,
                settings.backendServerUrl
              );

        setPipelineStage('generating_script');
        const generated = await generateRadioScript(
          items,
          categoryLabel,
          settings,
          generatedAtTs
        );

        let audioBlob: Blob | undefined;
        let audioMimeType: string | undefined;
        let audioWarning: string | null = null;

        if (includeAudioGeneration && settings.aiProvider !== 'offline' && generated.script.trim()) {
          setPipelineStage('synthesizing_audio');
          try {
            const audioRes = await synthesizeGeminiAudio(
              generated.script,
              settings.geminiVoice,
              settings.geminiTtsModel,
              settings.backendServerUrl
            );
            audioBlob = audioRes.blob;
            audioMimeType = audioRes.mimeType;
          } catch (audioErr) {
            const msg =
              audioErr instanceof Error ? audioErr.message : 'خطا در تولید فایل صوتی';
            audioWarning = `متن خبر آماده شد، اما تولید فایل صوتی ناموفق بود (${msg}). می‌توانید از گوینده آفلاین دستگاه استفاده کنید.`;
          }
        }

        setPipelineStage('saving');
        const savedFilename = buildPodcastFilename({
          categoryLabel,
          createdAt: generatedAtTs,
          broadcastTitle: generated.broadcastTitle,
        });

        const edition: BroadcastEdition = {
          id: `edition-${generatedAtTs}`,
          createdAt: generatedAtTs,
          category: targetScope,
          categoryLabel,
          broadcastTitle: generated.broadcastTitle,
          script: generated.script,
          cards: generated.cards,
          providerUsed: settings.aiProvider,
          hasAudio: Boolean(audioBlob),
          audioBlob,
          audioMimeType,
          voiceName: audioBlob ? settings.geminiVoice : undefined,
          audioScriptSnapshot: audioBlob ? generated.script : undefined,
          savedFilename: audioBlob ? savedFilename : undefined,
        };

        await saveEditionToArchive(edition).catch(() => {});
        const pruned = await pruneArchiveToMax(settings.maxArchiveCount).catch(() => null);
        if (pruned) {
          setArchiveEditions(pruned);
        } else {
          setArchiveEditions((prev) => [edition, ...prev].slice(0, settings.maxArchiveCount));
        }
        setCurrentEdition(edition);
        setPipelineStage('idle');

        if (options?.autoSaveFile && edition.audioBlob) {
          try {
            const saveRes = await savePodcastFile(edition, outputDirHandleRef.current);
            setAutoSaveNotice(
              saveRes.method === 'directory'
                ? `پادکست زمان‌بندی‌شده با نام «${saveRes.filename}» در پوشه «${saveRes.directoryName}» ذخیره شد.`
                : `پادکست زمان‌بندی‌شده با نام «${saveRes.filename}» در پوشه دانلودهای دستگاه ذخیره شد.`
            );
          } catch {
            // Non-fatal if browser blocks unattended download
          }
        }

        if (audioWarning) setPipelineError(audioWarning);
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'خطای غیرمنتظره در ساخت بخش خبری';
        setPipelineError(msg);
        setPipelineStage('error');
        return false;
      } finally {
        isPipelineRunningRef.current = false;
      }
    },
    [feeds, player, settings]
  );

  // Daily Auto-Fetch Scheduler (checks every 30s and on screen wake)
  useEffect(() => {
    if (!settings.autoScheduleEnabled) return;

    const checkSchedule = () => {
      if (isPipelineRunningRef.current) return;
      const todayKey = getTodayDateKey();
      if (settings.lastAutoRunDate === todayKey) return;

      const nowMs = Date.now();
      if (nowMs - lastAutoAttemptAtRef.current < 5 * 60_000) return;

      const nowHHMM = getCurrentHHMM();
      if (nowHHMM >= settings.autoScheduleTime) {
        lastAutoAttemptAtRef.current = nowMs;
        const targetScope: BroadcastScopeId = settings.autoScheduleUseCombined
          ? 'combined'
          : activeCategory;
        void runBroadcastPipeline(targetScope, settings.autoGenerateAudioOnSchedule, {
          autoSaveFile: settings.autoSavePodcastFileOnSchedule,
        }).then((succeeded) => {
          if (succeeded) {
            updateSettings({ lastAutoRunDate: todayKey });
          }
        });
      }
    };

    checkSchedule();
    const timer = setInterval(checkSchedule, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkSchedule();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', checkSchedule);
    window.addEventListener('online', checkSchedule);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', checkSchedule);
      window.removeEventListener('online', checkSchedule);
    };
  }, [
    activeCategory,
    runBroadcastPipeline,
    settings.autoGenerateAudioOnSchedule,
    settings.autoSavePodcastFileOnSchedule,
    settings.autoScheduleEnabled,
    settings.autoScheduleTime,
    settings.autoScheduleUseCombined,
    settings.lastAutoRunDate,
    updateSettings,
  ]);

  const handleSynthesizeCurrentScript = useCallback(async () => {
    if (!currentEdition || !currentEdition.script.trim() || isSynthesizingAudio) return;
    setIsSynthesizingAudio(true);
    setPipelineError(null);
    try {
      const audioRes = await synthesizeGeminiAudio(
        currentEdition.script,
        settings.geminiVoice,
        settings.geminiTtsModel,
        settings.backendServerUrl
      );
      const savedFilename =
        currentEdition.savedFilename || buildPodcastFilename(currentEdition);
      const updated: BroadcastEdition = {
        ...currentEdition,
        hasAudio: true,
        audioBlob: audioRes.blob,
        audioMimeType: audioRes.mimeType,
        voiceName: settings.geminiVoice,
        audioScriptSnapshot: currentEdition.script,
        savedFilename,
      };
      await saveEditionToArchive(updated).catch(() => {});
      setCurrentEdition(updated);
      setArchiveEditions((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      updateSettings({ ttsEngine: 'gemini_tts' });
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : 'خطا در تبدیل متن به گفتار');
    } finally {
      setIsSynthesizingAudio(false);
    }
  }, [
    currentEdition,
    isSynthesizingAudio,
    settings.backendServerUrl,
    settings.geminiTtsModel,
    settings.geminiVoice,
    updateSettings,
  ]);

  const handleScriptEdit = useCallback(
    (newScript: string) => {
      if (!currentEdition) return;
      const updated: BroadcastEdition = { ...currentEdition, script: newScript };
      setCurrentEdition(updated);
      setArchiveEditions((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      saveEditionToArchive(updated).catch(() => {});
    },
    [currentEdition]
  );

  const handleDownloadAudio = useCallback((edition: BroadcastEdition) => {
    if (!edition.audioBlob) return;
    const filename = edition.savedFilename || buildPodcastFilename(edition);
    triggerBlobDownload(edition.audioBlob, filename);
  }, []);

  const handleLoadArchivedEdition = useCallback(
    (edition: BroadcastEdition) => {
      player.stopAll();
      setCurrentEdition(edition);
    },
    [player]
  );

  const handleDeleteArchivedEdition = useCallback(
    async (id: string) => {
      await deleteArchivedEdition(id).catch(() => {});
      setArchiveEditions((prev) => {
        const next = prev.filter((e) => e.id !== id);
        if (currentEdition?.id === id) {
          player.stopAll();
          setCurrentEdition(next[0] ?? null);
        }
        return next;
      });
    },
    [currentEdition?.id, player]
  );

  const handleClearOldEditions = useCallback(async () => {
    if (archiveEditions.length <= 1) return;
    const keepId = currentEdition?.id || archiveEditions[0].id;
    const toDelete = archiveEditions.filter((item) => item.id !== keepId);
    await Promise.all(toDelete.map((item) => deleteArchivedEdition(item.id).catch(() => {})));
    setArchiveEditions((prev) => prev.filter((item) => item.id === keepId));
  }, [archiveEditions, currentEdition?.id]);

  const handlePickOutputDirectory = useCallback(async () => {
    try {
      const handle = await pickPodcastOutputDirectory();
      if (!handle) return;
      outputDirHandleRef.current = handle;
      setOutputDirectoryName(handle.name);
      await saveOutputDirectoryHandle(handle).catch(() => {});
    } catch {
      // User cancelled directory picker
    }
  }, []);

  const handleClearOutputDirectory = useCallback(async () => {
    outputDirHandleRef.current = null;
    setOutputDirectoryName(null);
    await clearOutputDirectoryHandle().catch(() => {});
  }, []);

  const handleImportBackup = useCallback((payload: StudioBackupPayload) => {
    saveSettings(payload.settings);
    saveFeeds(payload.feeds);
    saveActiveCategory(payload.activeCategory);
    setSettings(payload.settings);
    setFeeds(payload.feeds);
    setActiveCategory(payload.activeCategory);
  }, []);

  const handleSwitchTtsEngine = useCallback(
    (engine: TTSEngineType) => {
      player.stopAll();
      updateSettings({ ttsEngine: engine });
    },
    [player, updateSettings]
  );

  const handleSwitchOperationMode = useCallback(
    (mode: 'server' | 'offline') => {
      player.stopAll();
      if (mode === 'offline') {
        updateSettings({ aiProvider: 'offline', ttsEngine: 'offline_speech' });
      } else {
        updateSettings({
          aiProvider: settings.aiProvider === 'offline' ? 'gemini' : settings.aiProvider,
          ttsEngine: 'gemini_tts',
        });
      }
    },
    [player, settings.aiProvider, updateSettings]
  );

  const sourcesTabCategory: FeedCategoryId =
    activeCategory === 'combined' ? settings.combinedCategories[0] || 'tech_ai' : activeCategory;

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#0B0D10] text-zinc-100 flex flex-col">
      {/* Hidden HTML5 Audio Element for Gemini WAV Playback */}
      <audio
        ref={player.audioRef}
        src={player.audioUrl || undefined}
        onTimeUpdate={player.handleAudioTimeUpdate}
        onLoadedMetadata={(e) => player.setDuration(e.currentTarget.duration || 0)}
        onEnded={player.notifyAudioEnded}
        preload="auto"
        className="hidden"
      />

      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 h-14 bg-[#0B0D10]/90 backdrop-blur-md border-b border-white/10 pt-safe">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4 sm:gap-8">
          {/* Zone 1: Brand Icon + Wordmark + Tagline */}
          <div className="flex items-center gap-2.5 shrink-0">
            <img
              src="/pwa-192x192.png"
              alt="آیکون راویو"
              referrerPolicy="no-referrer"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-amber-500/25 object-cover shrink-0"
            />
            <div className="flex flex-col justify-center leading-tight">
              <span className="text-sm sm:text-lg font-extrabold tracking-tight text-white whitespace-nowrap">
                Ravio · راویو
              </span>
              <span className="text-[10px] sm:text-[11px] font-medium text-amber-400/90 whitespace-nowrap">
                روایتِ هوشمندِ خبر
              </span>
            </div>
          </div>

          {/* Zone 2: Desktop Single-Line Navigation */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <button
              onClick={() => setActiveTab('player')}
              className={`py-1.5 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeTab === 'player'
                  ? 'text-white border-amber-500'
                  : 'text-zinc-400 border-transparent hover:text-zinc-200'
              }`}
            >
              پخش خبر
            </button>
            <button
              onClick={() => setActiveTab('cards')}
              className={`py-1.5 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeTab === 'cards'
                  ? 'text-white border-amber-500'
                  : 'text-zinc-400 border-transparent hover:text-zinc-200'
              }`}
            >
              کارت‌های خبر
            </button>
            <button
              onClick={() => setActiveTab('sources')}
              className={`py-1.5 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeTab === 'sources'
                  ? 'text-white border-amber-500'
                  : 'text-zinc-400 border-transparent hover:text-zinc-200'
              }`}
            >
              منابع خبری
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`py-1.5 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeTab === 'settings'
                  ? 'text-white border-amber-500'
                  : 'text-zinc-400 border-transparent hover:text-zinc-200'
              }`}
            >
              تنظیمات
            </button>
          </nav>

          {/* Zone 3: Install Prompt (when available) + Primary Car Mode Action */}
          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton compact />
            <button
              onClick={() => setCarModeOpen(true)}
              className="min-h-[40px] px-3.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 font-semibold text-xs sm:text-sm flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              <Car className="w-4 h-4" />
              <span>حالت رانندگی</span>
            </button>
          </div>
        </div>
      </header>

      {/* Non-intrusive Offline Banner */}
      {!isOnline && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 text-center text-xs font-medium text-amber-200 flex items-center justify-center gap-2">
          <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>اتصال اینترنت قطع است — در حال استفاده از آرشیو ذخیره‌شده و گوینده آفلاین دستگاه</span>
        </div>
      )}

      {/* Main Studio Canvas */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 pb-24 md:pb-10">
        {activeTab === 'player' && (
          <PlayerScriptTab
            activeCategory={activeCategory}
            onSelectCategory={handleSelectCategory}
            onToggleCombinedCategory={handleToggleCombinedCategory}
            currentEdition={currentEdition}
            settings={settings}
            pipelineStage={pipelineStage}
            pipelineError={pipelineError}
            autoSaveNotice={autoSaveNotice}
            isSynthesizingAudio={isSynthesizingAudio}
            sleepRemainingSec={sleepRemainingSec}
            sentences={player.sentences}
            activeSentenceIdx={player.activeSentenceIdx}
            activeWordRatio={player.activeWordRatio}
            isPlaying={player.isPlaying}
            effectiveMode={player.effectiveMode}
            progressPercent={player.progressPercent}
            currentTime={player.currentTime}
            duration={player.duration}
            persianVoiceAvailable={player.persianVoiceAvailable}
            onFetchAndBuild={() =>
              runBroadcastPipeline(activeCategory, settings.ttsEngine === 'gemini_tts')
            }
            onSynthesizeCurrentScript={handleSynthesizeCurrentScript}
            onScriptEdit={handleScriptEdit}
            onTogglePlay={player.togglePlay}
            onSeekToTime={player.seekToTime}
            onSkipBySeconds={player.skipBySeconds}
            onNext={player.nextTrackOrSentence}
            onPrev={player.prevTrackOrSentence}
            onJumpToSentence={player.jumpToSentence}
            onSpeedChange={(speed) => updateSettings({ playbackSpeed: speed })}
            onCycleSleepTimer={handleCycleSleepTimer}
            onSwitchTtsEngine={handleSwitchTtsEngine}
            onSwitchOperationMode={handleSwitchOperationMode}
            onDownloadAudio={handleDownloadAudio}
            onOpenCardsTab={() => setActiveTab('cards')}
            onOpenServerSettings={() => {
              setRequestedSettingsSection({ id: 'ai', nonce: Date.now() });
              setActiveTab('settings');
            }}
          />
        )}

        {activeTab === 'cards' && (
          <NewsCardsTab
            currentEdition={currentEdition}
            archiveEditions={archiveEditions}
            onLoadArchivedEdition={handleLoadArchivedEdition}
            onDeleteArchivedEdition={handleDeleteArchivedEdition}
            onClearOldEditions={handleClearOldEditions}
            onDownloadAudio={handleDownloadAudio}
            onGoToPlayer={() => setActiveTab('player')}
          />
        )}

        {activeTab === 'sources' && (
          <SourcesTab
            feeds={feeds}
            activeCategory={sourcesTabCategory}
            backendServerUrl={settings.backendServerUrl}
            onSelectCategory={handleSelectCategory}
            onToggleFeed={handleToggleFeed}
            onAddCustomFeed={handleAddCustomFeed}
            onRemoveFeed={handleRemoveFeed}
            onBuildFromCategory={(cat) => {
              handleSelectCategory(cat);
              setActiveTab('player');
              runBroadcastPipeline(cat, settings.ttsEngine === 'gemini_tts');
            }}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            settings={settings}
            feeds={feeds}
            activeCategory={activeCategory}
            archiveCount={archiveEditions.length}
            archiveSizeMB={estimateArchiveSizeMB(archiveEditions)}
            outputDirectoryName={outputDirectoryName}
            onUpdateSettings={updateSettings}
            onResetSettings={() => {
              saveSettings(DEFAULT_SETTINGS);
              setSettings(DEFAULT_SETTINGS);
            }}
            onTriggerAutoRunNow={() => {
              setActiveTab('player');
              const targetScope: BroadcastScopeId = settings.autoScheduleUseCombined
                ? 'combined'
                : activeCategory;
              runBroadcastPipeline(targetScope, settings.autoGenerateAudioOnSchedule, {
                autoSaveFile: settings.autoSavePodcastFileOnSchedule,
              });
            }}
            onPickOutputDirectory={handlePickOutputDirectory}
            onClearOutputDirectory={handleClearOutputDirectory}
            onClearOldEditions={handleClearOldEditions}
            onImportBackup={handleImportBackup}
            requestedSection={requestedSettingsSection}
          />
        )}
      </main>

      {/* Fixed Mobile Bottom Navigation Bar (Natural Thumb Zone) */}
      <nav
        aria-label="ناوبری اصلی"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0E1116]/95 backdrop-blur-md border-t border-white/10 pb-safe"
      >
        <div className="grid grid-cols-4 h-16 items-center">
          <button
            onClick={() => setActiveTab('player')}
            className={`h-full flex flex-col items-center justify-center gap-1 transition-colors ${
              activeTab === 'player' ? 'text-amber-400' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Radio className="w-5 h-5" />
            <span className="text-[11px] font-medium whitespace-nowrap">پخش خبر</span>
          </button>

          <button
            onClick={() => setActiveTab('cards')}
            className={`h-full flex flex-col items-center justify-center gap-1 transition-colors ${
              activeTab === 'cards' ? 'text-amber-400' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Newspaper className="w-5 h-5" />
            <span className="text-[11px] font-medium whitespace-nowrap">کارت‌ها</span>
          </button>

          <button
            onClick={() => setActiveTab('sources')}
            className={`h-full flex flex-col items-center justify-center gap-1 transition-colors ${
              activeTab === 'sources' ? 'text-amber-400' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Rss className="w-5 h-5" />
            <span className="text-[11px] font-medium whitespace-nowrap">منابع</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`h-full flex flex-col items-center justify-center gap-1 transition-colors ${
              activeTab === 'settings' ? 'text-amber-400' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <SlidersHorizontal className="w-5 h-5" />
            <span className="text-[11px] font-medium whitespace-nowrap">تنظیمات</span>
          </button>
        </div>
      </nav>

      {/* Full-Screen Car Mode & TV Teleprompter Cockpit */}
      <CarModeOverlay
        isOpen={carModeOpen}
        onClose={() => setCarModeOpen(false)}
        edition={currentEdition}
        archiveEditions={archiveEditions}
        sentences={player.sentences}
        activeSentenceIdx={player.activeSentenceIdx}
        activeWordRatio={player.activeWordRatio}
        isPlaying={player.isPlaying}
        effectiveMode={player.effectiveMode}
        ttsEngineSetting={settings.ttsEngine}
        progressPercent={player.progressPercent}
        currentTime={player.currentTime}
        duration={player.duration}
        playbackSpeed={settings.playbackSpeed}
        pipelineStage={pipelineStage}
        autoPlayNextInCar={settings.autoPlayNextInCar}
        sleepRemainingSec={sleepRemainingSec}
        onTogglePlay={player.togglePlay}
        onSeekToTime={player.seekToTime}
        onNext={player.nextTrackOrSentence}
        onPrev={player.prevTrackOrSentence}
        onJumpToSentence={player.jumpToSentence}
        onCycleSpeed={player.cycleSpeed}
        onSwitchTtsEngine={handleSwitchTtsEngine}
        onLoadArchivedEdition={handleLoadArchivedEdition}
        onFetchNow={() =>
          runBroadcastPipeline(activeCategory, settings.ttsEngine === 'gemini_tts')
        }
        onToggleAutoPlayNext={() =>
          updateSettings({ autoPlayNextInCar: !settings.autoPlayNextInCar })
        }
        onCycleSleepTimer={handleCycleSleepTimer}
      />
    </div>
  );
}
