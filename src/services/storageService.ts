import { DEFAULT_FEEDS, DEFAULT_SETTINGS } from '../data/presets';
import { BroadcastScopeId, RssFeedSource, StudioSettings } from '../types/radio';

const SETTINGS_KEY = 'radio_khabar_settings_v1';
const FEEDS_KEY = 'radio_khabar_feeds_v1';
const CATEGORY_KEY = 'radio_khabar_active_category_v1';

const VALID_SCOPES: BroadcastScopeId[] = ['tech_ai', 'world', 'economy', 'iran', 'custom', 'combined'];

export function loadSettings(): StudioSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: StudioSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadFeeds(): RssFeedSource[] {
  try {
    const raw = localStorage.getItem(FEEDS_KEY);
    if (!raw) return DEFAULT_FEEDS;
    const parsed = JSON.parse(raw) as RssFeedSource[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_FEEDS;

    // Merge newly added preset feeds so existing users receive new Iran/Persian sources
    const existingIds = new Set(parsed.map((f) => f.id));
    const missingPresets = DEFAULT_FEEDS.filter((f) => !existingIds.has(f.id));
    if (missingPresets.length > 0) {
      const merged = [...parsed, ...missingPresets];
      saveFeeds(merged);
      return merged;
    }
    return parsed;
  } catch {
    return DEFAULT_FEEDS;
  }
}

export function saveFeeds(feeds: RssFeedSource[]): void {
  try {
    localStorage.setItem(FEEDS_KEY, JSON.stringify(feeds));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadActiveCategory(): BroadcastScopeId {
  try {
    const raw = localStorage.getItem(CATEGORY_KEY) as BroadcastScopeId | null;
    if (raw && VALID_SCOPES.includes(raw)) {
      return raw;
    }
    return 'tech_ai';
  } catch {
    return 'tech_ai';
  }
}

export function saveActiveCategory(cat: BroadcastScopeId): void {
  try {
    localStorage.setItem(CATEGORY_KEY, cat);
  } catch {
    // Ignore
  }
}

export interface StudioBackupPayload {
  app: 'ravio';
  version: 1;
  exportedAt: string;
  activeCategory: BroadcastScopeId;
  settings: StudioSettings;
  feeds: RssFeedSource[];
}

export function createBackupPayload(
  settings: StudioSettings,
  feeds: RssFeedSource[],
  activeCategory: BroadcastScopeId
): StudioBackupPayload {
  return {
    app: 'ravio',
    version: 1,
    exportedAt: new Date().toISOString(),
    activeCategory,
    settings,
    feeds,
  };
}

export function parseBackupPayload(rawText: string): StudioBackupPayload {
  const parsed = JSON.parse(rawText) as Partial<StudioBackupPayload>;
  if (!parsed || typeof parsed !== 'object' || !parsed.settings || !Array.isArray(parsed.feeds)) {
    throw new Error('ساختار فایل پشتیبان راویو معتبر نیست.');
  }

  const validFeeds = parsed.feeds.filter(
    (f): f is RssFeedSource =>
      Boolean(f && typeof f.id === 'string' && typeof f.url === 'string' && typeof f.label === 'string')
  );
  if (validFeeds.length === 0) {
    throw new Error('فایل پشتیبان هیچ منبع خبری معتبری ندارد.');
  }

  const activeCategory: BroadcastScopeId =
    parsed.activeCategory && VALID_SCOPES.includes(parsed.activeCategory)
      ? parsed.activeCategory
      : 'tech_ai';

  return {
    app: 'ravio',
    version: 1,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
    activeCategory,
    settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
    feeds: validFeeds,
  };
}
