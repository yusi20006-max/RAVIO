export type FeedCategoryId = 'tech_ai' | 'world' | 'economy' | 'iran' | 'custom';
export type BroadcastScopeId = FeedCategoryId | 'combined';

export interface RssFeedSource {
  id: string;
  label: string;
  url: string;
  category: FeedCategoryId;
  enabled: boolean;
  isCustom?: boolean;
}

export interface RawNewsItem {
  id: string;
  title: string;
  description: string;
  link: string;
  pubDate: string;
  source: string;
  category: FeedCategoryId;
}

export interface StructuredNewsCard {
  id: string;
  originalTitle: string;
  source: string;
  link: string;
  pubDate: string;
  persianTitle: string;
  persianSummary: string;
  topic: string;
}

export type AIProviderType = 'gemini' | 'openrouter' | 'custom_openai' | 'offline';
export type BroadcastTone = 'morning_host' | 'fast_brief' | 'analytical';
export type TTSEngineType = 'gemini_tts' | 'offline_speech';
export type GeminiVoiceName = 'Kore' | 'Puck' | 'Charon' | 'Zephyr' | 'Fenrir';

export interface StudioSettings {
  aiProvider: AIProviderType;
  backendServerUrl: string;
  geminiModel: string;
  openRouterApiKey: string;
  openRouterModel: string;
  customBaseUrl: string;
  customApiKey: string;
  customModel: string;
  ttsEngine: TTSEngineType;
  geminiTtsModel: string;
  geminiVoice: GeminiVoiceName;
  broadcastTone: BroadcastTone;
  maxNewsItems: number;
  playbackSpeed: number;
  combinedCategories: FeedCategoryId[];
  maxArchiveCount: number;
  autoPlayNextInCar: boolean;
  autoScheduleEnabled: boolean;
  autoScheduleTime: string; // "HH:MM" 24h
  autoScheduleUseCombined: boolean;
  autoGenerateAudioOnSchedule: boolean;
  autoSavePodcastFileOnSchedule: boolean;
  lastAutoRunDate: string; // "YYYY-MM-DD"
}

export interface BroadcastEdition {
  id: string;
  createdAt: number;
  category: BroadcastScopeId;
  categoryLabel: string;
  broadcastTitle: string;
  script: string;
  cards: StructuredNewsCard[];
  providerUsed: AIProviderType;
  hasAudio: boolean;
  audioBlob?: Blob;
  audioMimeType?: string;
  voiceName?: string;
  audioScriptSnapshot?: string;
  savedFilename?: string;
}

export type ActiveTab = 'player' | 'cards' | 'sources' | 'settings';
export type PipelineStage = 'idle' | 'fetching_rss' | 'generating_script' | 'synthesizing_audio' | 'saving' | 'error';
