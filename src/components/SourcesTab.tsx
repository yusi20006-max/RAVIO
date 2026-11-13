import { ExternalLink, Plus, RefreshCw, Rss, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { CATEGORY_OPTIONS } from '../data/presets';
import { fetchSingleRssFeed } from '../services/rssService';
import { FeedCategoryId, RawNewsItem, RssFeedSource } from '../types/radio';

interface SourcesTabProps {
  feeds: RssFeedSource[];
  activeCategory: FeedCategoryId;
  backendServerUrl?: string;
  onSelectCategory: (cat: FeedCategoryId) => void;
  onToggleFeed: (id: string) => void;
  onAddCustomFeed: (label: string, url: string, category: FeedCategoryId) => void;
  onRemoveFeed: (id: string) => void;
  onBuildFromCategory: (cat: FeedCategoryId) => void;
}

export function SourcesTab({
  feeds,
  activeCategory,
  backendServerUrl,
  onSelectCategory,
  onToggleFeed,
  onAddCustomFeed,
  onRemoveFeed,
  onBuildFromCategory,
}: SourcesTabProps) {
  const [customLabel, setCustomLabel] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customCategory, setCustomCategory] = useState<FeedCategoryId>('custom');
  const [formError, setFormError] = useState<string | null>(null);

  const [testingFeedId, setTestingFeedId] = useState<string | null>(null);
  const [previewItems, setPreviewItems] = useState<RawNewsItem[]>([]);
  const [previewLabel, setPreviewLabel] = useState<string>('');
  const [previewError, setPreviewError] = useState<string | null>(null);

  const categoryFeeds = feeds.filter((f) => f.category === activeCategory);
  const activeCatMeta = CATEGORY_OPTIONS.find((c) => c.id === activeCategory);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const trimmedUrl = customUrl.trim();
    const trimmedLabel = customLabel.trim() || 'فید سفارشی کاربر';

    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      setFormError('لطفاً آدرس معتبر با http:// یا https:// وارد کنید.');
      return;
    }

    onAddCustomFeed(trimmedLabel, trimmedUrl, customCategory);
    onSelectCategory(customCategory);
    setCustomLabel('');
    setCustomUrl('');
  };

  const handleTestFeed = async (feed: RssFeedSource) => {
    setTestingFeedId(feed.id);
    setPreviewError(null);
    setPreviewLabel(feed.label);
    try {
      const items = await fetchSingleRssFeed(feed, backendServerUrl);
      setPreviewItems(items.slice(0, 6));
    } catch (err) {
      setPreviewItems([]);
      setPreviewError(err instanceof Error ? err.message : 'خطا در تست دریافت فید');
    } finally {
      setTestingFeedId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Category Selection */}
      <section className="bg-[#13171D] border border-white/10 rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-white">مدیریت منابع خبری و فیدهای RSS</h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              فیدهای فعال هر دسته‌بندی را انتخاب کنید یا آدرس RSS دلخواه خود را اضافه نمایید.
            </p>
          </div>

          <button
            onClick={() => onBuildFromCategory(activeCategory)}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
          >
            <Rss className="w-4 h-4" />
            <span>ساخت خبر از این دسته</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {CATEGORY_OPTIONS.map((cat) => {
            const count = feeds.filter((f) => f.category === cat.id && f.enabled).length;
            const isSelected = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className={`p-3 rounded-xl border text-right transition-colors min-h-[68px] flex flex-col justify-between ${
                  isSelected
                    ? 'bg-[#1D2430] border-amber-500/50 text-white'
                    : 'bg-[#0E1116] border-white/10 text-zinc-300 hover:bg-[#181D25]'
                }`}
              >
                <span className="text-xs sm:text-sm font-bold">{cat.shortLabel}</span>
                <span className="text-[11px] text-zinc-400 tabular-nums">{count} منبع فعال</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Active Feeds List */}
        <section className="lg:col-span-7 bg-[#13171D] border border-white/10 rounded-2xl p-4 sm:p-6 space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-white">
              منابع دسته «{activeCatMeta?.label}»
            </h2>
            <p className="text-xs text-zinc-400">{activeCatMeta?.description}</p>
          </div>

          {categoryFeeds.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-white/10 rounded-xl text-xs sm:text-sm text-zinc-400">
              هنوز هیچ فید RSS برای این دسته‌بندی ثبت نشده است. از فرم کنار صفحه یک فید اضافه کنید.
            </div>
          ) : (
            <div className="space-y-3">
              {categoryFeeds.map((feed) => (
                <div
                  key={feed.id}
                  className="bg-[#0E1116] border border-white/10 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={feed.enabled}
                        onClick={() => onToggleFeed(feed.id)}
                        className={`w-11 h-6 rounded-full transition-colors p-0.5 shrink-0 ${
                          feed.enabled ? 'bg-amber-500' : 'bg-zinc-700'
                        }`}
                      >
                        <span
                          className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                            feed.enabled ? '-translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                      <span className="text-sm font-semibold text-white truncate">
                        {feed.label}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 truncate font-mono-tabular" dir="ltr">
                      {feed.url}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleTestFeed(feed)}
                      disabled={testingFeedId === feed.id}
                      className="min-h-[40px] px-3 rounded-lg bg-[#1A2029] hover:bg-[#232B37] text-xs font-medium text-zinc-200 flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 text-amber-400 ${
                          testingFeedId === feed.id ? 'animate-spin' : ''
                        }`}
                      />
                      <span>تست و پیش‌نمایش</span>
                    </button>

                    {feed.isCustom && (
                      <button
                        onClick={() => onRemoveFeed(feed.id)}
                        aria-label="حذف فید"
                        className="min-h-[40px] min-w-[40px] rounded-lg hover:bg-red-500/15 text-zinc-400 hover:text-red-300 flex items-center justify-center transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Add Custom RSS Feed Form + Live Preview */}
        <div className="lg:col-span-5 space-y-6">
          <section className="bg-[#13171D] border border-white/10 rounded-2xl p-4 sm:p-6 space-y-4">
            <h2 className="text-base font-bold text-white">افزودن آدرس RSS سفارشی</h2>
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-zinc-300">
                  نام منبع (اختیاری)
                </label>
                <input
                  type="text"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="مثلاً: زومیت، دیجیاتو یا فید گوگل نیوز"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D10] border border-white/15 focus:border-amber-500 focus:outline-none text-sm text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-zinc-300">
                  لینک فید RSS / Atom
                </label>
                <input
                  type="url"
                  dir="ltr"
                  required
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://news.google.com/rss/search?q=..."
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D10] border border-white/15 focus:border-amber-500 focus:outline-none text-sm text-white font-mono-tabular"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-zinc-300">
                  دسته‌بندی مقصد
                </label>
                <select
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value as FeedCategoryId)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D10] border border-white/15 focus:border-amber-500 focus:outline-none text-sm text-white"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {formError && <p className="text-xs text-red-400">{formError}</p>}

              <button
                type="submit"
                className="w-full min-h-[46px] rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>افزودن منبع به لیست</span>
              </button>
            </form>
          </section>

          {/* Live Raw Preview */}
          {(previewItems.length > 0 || previewError) && (
            <section className="bg-[#13171D] border border-white/10 rounded-2xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white truncate">
                  پیش‌نمایش زنده: {previewLabel}
                </h3>
                <span className="text-xs text-zinc-400 tabular-nums">
                  {previewItems.length} خبر
                </span>
              </div>

              {previewError ? (
                <p className="text-xs text-red-300">{previewError}</p>
              ) : (
                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pl-1">
                  {previewItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl bg-[#0E1116] border border-white/10 space-y-1"
                    >
                      <p className="text-xs font-semibold text-zinc-100 leading-relaxed" dir="auto">
                        {item.title}
                      </p>
                      <div className="flex items-center justify-between text-[11px] text-zinc-400">
                        <span>{item.source}</span>
                        {item.link && (
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-amber-400 flex items-center gap-1"
                          >
                            <span>لینک</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
