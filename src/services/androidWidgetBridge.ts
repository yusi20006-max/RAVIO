import { BroadcastScopeId, RssFeedSource, StudioSettings } from '../types/radio';
import { resolveBackendBaseUrl } from './aiService';

interface RavioWidgetCapacitorPlugin {
  syncConfig(options: {
    backendServerUrl?: string;
    activeCategory?: string;
    combinedCategoriesJson?: string;
    geminiVoice?: string;
    broadcastTone?: string;
    maxNewsItems?: number;
    feedsJson?: string;
  }): Promise<{ ok: boolean }>;
  getWidgetState(): Promise<{
    selectedCategory: string;
    state: string;
    statusText: string;
    headline: string;
    hasCachedAudio: boolean;
  }>;
}

function getNativeWidgetPlugin(): RavioWidgetCapacitorPlugin | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      Plugins?: { RavioWidget?: RavioWidgetCapacitorPlugin };
    };
  };
  if (!win.Capacitor?.isNativePlatform?.()) return null;
  return win.Capacitor.Plugins?.RavioWidget ?? null;
}

export function isAndroidWidgetBridgeAvailable(): boolean {
  return getNativeWidgetPlugin() !== null;
}

export async function syncAndroidWidgetConfig(params: {
  settings: StudioSettings;
  feeds: RssFeedSource[];
  activeCategory?: BroadcastScopeId;
}): Promise<boolean> {
  const plugin = getNativeWidgetPlugin();
  if (!plugin) return false;

  try {
    const resolvedBackend = resolveBackendBaseUrl(params.settings.backendServerUrl);
    await plugin.syncConfig({
      backendServerUrl: resolvedBackend,
      ...(params.activeCategory ? { activeCategory: params.activeCategory } : {}),
      combinedCategoriesJson: JSON.stringify(params.settings.combinedCategories),
      geminiVoice: params.settings.geminiVoice,
      broadcastTone: params.settings.broadcastTone,
      maxNewsItems: params.settings.maxNewsItems,
      feedsJson: JSON.stringify(
        params.feeds.map((f) => ({
          label: f.label,
          url: f.url,
          category: f.category,
          enabled: f.enabled,
        }))
      ),
    });
    return true;
  } catch {
    return false;
  }
}
