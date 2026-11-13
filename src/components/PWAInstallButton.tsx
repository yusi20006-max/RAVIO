import { Download, Smartphone, X } from 'lucide-react';
import { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export function PWAInstallButton({ compact = false }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={
          compact
            ? 'min-h-[40px] px-3 rounded-xl bg-[#1A2029] hover:bg-[#232B37] border border-white/10 text-zinc-100 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0'
            : 'min-h-[44px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors whitespace-nowrap'
        }
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>{compact ? 'نصب اپ' : 'نصب روی گوشی / تلویزیون (PWA)'}</span>
      </button>
    );
  }

  if (isIOS || !compact) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className={
            compact
              ? 'min-h-[40px] px-3 rounded-xl bg-[#1A2029] hover:bg-[#232B37] border border-white/10 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0'
              : 'min-h-[44px] px-4 rounded-xl bg-[#1A2029] hover:bg-[#232B37] border border-white/10 text-zinc-200 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap'
          }
        >
          <Smartphone className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{isIOS ? 'راهنمای نصب در آیفون' : 'راهنمای نصب مستقیم (PWA)'}</span>
        </button>

        {showGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-sm rounded-2xl bg-[#13171D] border border-white/15 p-5 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-bold text-white">نصب مستقیم راویو (Ravio)</h3>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  className="min-h-[36px] min-w-[36px] rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {isIOS ? (
                <ol className="text-xs sm:text-sm text-zinc-300 space-y-2 leading-relaxed list-decimal pr-4">
                  <li>در نوار پایین یا بالای مرورگر Safari دکمه <strong>Share</strong> را بزنید.</li>
                  <li>به پایین اسکرول کنید و گزینه <strong>Add to Home Screen</strong> را انتخاب نمایید.</li>
                  <li>دکمه <strong>Add</strong> را لمس کنید تا راویو به‌صورت تمام‌صفحه نصب شود.</li>
                </ol>
              ) : (
                <ol className="text-xs sm:text-sm text-zinc-300 space-y-2 leading-relaxed list-decimal pr-4">
                  <li>در مرورگر Chrome گوشی یا Android TV منوی سه‌نقطه بالا را باز کنید.</li>
                  <li>گزینه <strong>Install app</strong> یا <strong>Add to Home screen</strong> را بزنید.</li>
                  <li>پس از نصب، رابط برنامه و آرشیو دانلودشده حتی بدون اینترنت نیز باز می‌شوند.</li>
                </ol>
              )}
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="w-full min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm transition-colors"
              >
                متوجه شدم
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
