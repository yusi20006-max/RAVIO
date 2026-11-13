import { Archive, Download, ExternalLink, Newspaper, Radio, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { estimateArchiveSizeMB } from '../services/archiveDb';
import { buildPodcastFilename } from '../services/fileSaveService';
import { BroadcastEdition } from '../types/radio';

interface NewsCardsTabProps {
  currentEdition: BroadcastEdition | null;
  archiveEditions: BroadcastEdition[];
  onLoadArchivedEdition: (edition: BroadcastEdition) => void;
  onDeleteArchivedEdition: (id: string) => void;
  onClearOldEditions: () => void;
  onDownloadAudio: (edition: BroadcastEdition) => void;
  onGoToPlayer: () => void;
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

export function NewsCardsTab({
  currentEdition,
  archiveEditions,
  onLoadArchivedEdition,
  onDeleteArchivedEdition,
  onClearOldEditions,
  onDownloadAudio,
  onGoToPlayer,
}: NewsCardsTabProps) {
  const [subView, setSubView] = useState<'cards' | 'archive'>('cards');
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});

  const archiveSizeMB = estimateArchiveSizeMB(archiveEditions);

  const toggleOriginalTitle = (id: string) => {
    setExpandedCardIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header & Sub-view Switcher */}
      <section className="bg-[#13171D] border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-white truncate">
            {subView === 'cards' ? 'کارت‌های خبر' : 'آرشیو آفلاین دستگاه'}
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 truncate">
            {currentEdition
              ? `${currentEdition.broadcastTitle} · ${currentEdition.categoryLabel}`
              : 'هنوز بخش خبری فعالی انتخاب نشده است'}
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#0B0D10] border border-white/10 rounded-xl shrink-0">
          <button
            type="button"
            onClick={() => setSubView('cards')}
            className={`min-h-[40px] px-3.5 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              subView === 'cards' ? 'bg-[#1D2430] text-amber-300' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Newspaper className="w-4 h-4" />
            <span>کارت‌های خبر ({currentEdition?.cards.length || 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView('archive')}
            className={`min-h-[40px] px-3.5 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              subView === 'archive' ? 'bg-[#1D2430] text-amber-300' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Archive className="w-4 h-4" />
            <span>آرشیو ({archiveEditions.length})</span>
          </button>
        </div>
      </section>

      {subView === 'cards' ? (
        !currentEdition || currentEdition.cards.length === 0 ? (
          <div className="bg-[#13171D] border border-white/10 rounded-2xl p-10 text-center space-y-3">
            <Newspaper className="w-10 h-10 text-zinc-600 mx-auto" />
            <p className="text-sm font-semibold text-zinc-200">
              هنوز کارت خبری برای نمایش وجود ندارد
            </p>
            <p className="text-xs text-zinc-400">
              از صفحه پخش‌کننده یک بخش خبری جدید بسازید تا خلاصه و لینک منابع اینجا نمایش داده شوند.
            </p>
            <button
              type="button"
              onClick={onGoToPlayer}
              className="min-h-[42px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs sm:text-sm inline-flex items-center gap-2 transition-colors"
            >
              <Radio className="w-4 h-4" />
              <span>رفتن به صفحه پخش</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentEdition.cards.map((card) => {
              const isExpanded = Boolean(expandedCardIds[card.id]);
              return (
                <article
                  key={card.id}
                  className="bg-[#13171D] border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <span className="text-amber-400 font-semibold">{card.topic}</span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{card.source}</span>
                    </div>

                    <h2 className="text-sm sm:text-base font-bold text-white leading-snug">
                      {card.persianTitle}
                    </h2>

                    <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                      {card.persianSummary}
                    </p>

                    {isExpanded && (
                      <div className="pt-2 border-t border-white/10 text-xs text-zinc-400" dir="auto">
                        {card.originalTitle}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <button
                      type="button"
                      onClick={() => toggleOriginalTitle(card.id)}
                      className="min-h-[36px] text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      {isExpanded ? 'بستن تیتر اصلی' : 'نمایش تیتر اصلی'}
                    </button>

                    {card.link && (
                      <a
                        href={card.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[36px] px-2.5 rounded-lg hover:bg-white/5 text-xs text-amber-400 flex items-center gap-1 transition-colors"
                      >
                        <span>منبع خبر</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : (
        <div className="space-y-3">
          <div className="bg-[#13171D] border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between gap-2">
            <div className="text-xs sm:text-sm text-zinc-300 font-mono-tabular">
              {archiveEditions.length} نسخه ذخیره‌شده · حدود {archiveSizeMB} مگابایت
            </div>
            {archiveEditions.length > 1 && (
              <button
                type="button"
                onClick={onClearOldEditions}
                className="min-h-[38px] px-3 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف نسخه‌های قدیمی</span>
              </button>
            )}
          </div>

          {archiveEditions.length === 0 ? (
            <div className="bg-[#13171D] border border-white/10 rounded-2xl p-8 text-center text-xs sm:text-sm text-zinc-400">
              آرشیو آفلاین خالی است. بخش‌های خبری تولیدشده به‌صورت خودکار در حافظه دستگاه ذخیره می‌شوند.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {archiveEditions.map((item) => {
                const isCurrent = currentEdition?.id === item.id;
                return (
                  <div
                    key={item.id}
                    className={`bg-[#13171D] border rounded-2xl p-4 flex flex-col justify-between gap-3 ${
                      isCurrent ? 'border-amber-500/45' : 'border-white/10'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                        <span>{item.categoryLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatPersianDate(item.createdAt)}</span>
                        {item.hasAudio && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-400">دارای صوت</span>
                          </>
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-white leading-snug">
                        {item.broadcastTitle}
                      </h3>
                      {item.hasAudio && (
                        <p className="text-[11px] text-zinc-500 truncate font-mono-tabular" dir="ltr">
                          {item.savedFilename || buildPodcastFilename(item)}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onLoadArchivedEdition(item);
                            onGoToPlayer();
                          }}
                          className="min-h-[40px] px-3.5 rounded-xl bg-[#1A2029] hover:bg-[#232B37] text-xs font-semibold text-white transition-colors whitespace-nowrap"
                        >
                          {isCurrent ? 'مشاهده در پخش‌کننده' : 'پخش در استودیو'}
                        </button>

                        {item.hasAudio && item.audioBlob && (
                          <button
                            type="button"
                            onClick={() => onDownloadAudio(item)}
                            aria-label="دانلود فایل صوتی"
                            className="min-h-[40px] min-w-[40px] px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 flex items-center justify-center transition-colors"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onDeleteArchivedEdition(item.id)}
                        aria-label="حذف از آرشیو"
                        className="min-h-[40px] min-w-[40px] rounded-xl hover:bg-red-500/15 text-zinc-400 hover:text-red-300 flex items-center justify-center transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
