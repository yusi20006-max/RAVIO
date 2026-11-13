import { BroadcastEdition } from '../types/radio';

interface DirectoryHandleLike {
  name: string;
  queryPermission?: (opts: { mode: 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission?: (opts: { mode: 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
  getFileHandle: (
    name: string,
    opts: { create: boolean }
  ) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

function toAsciiDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

export function formatPersianBroadcastDateTime(timestamp = Date.now()): {
  fullLabel: string;
  jalaliDateSlug: string;
  clockSlug: string;
} {
  const date = new Date(timestamp);

  let fullLabel = '';
  try {
    const datePart = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
    const timePart = new Intl.DateTimeFormat('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
    fullLabel = `${datePart}، ساعت ${timePart}`;
  } catch {
    fullLabel = date.toLocaleString('fa-IR');
  }

  let jalaliDateSlug = '';
  try {
    const parts = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const y = toAsciiDigits(parts.find((p) => p.type === 'year')?.value || '');
    const m = toAsciiDigits(parts.find((p) => p.type === 'month')?.value || '').padStart(2, '0');
    const d = toAsciiDigits(parts.find((p) => p.type === 'day')?.value || '').padStart(2, '0');
    if (y && m && d) {
      jalaliDateSlug = `${y}-${m}-${d}`;
    }
  } catch {
    // Fallback below
  }

  if (!jalaliDateSlug) {
    jalaliDateSlug = date.toISOString().slice(0, 10);
  }

  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const clockSlug = `${hh}-${mm}`;

  return { fullLabel, jalaliDateSlug, clockSlug };
}

function sanitizeSegment(text: string): string {
  return text
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 42);
}

export function buildPodcastFilename(
  edition: Pick<BroadcastEdition, 'categoryLabel' | 'createdAt' | 'broadcastTitle'>
): string {
  const { jalaliDateSlug, clockSlug } = formatPersianBroadcastDateTime(edition.createdAt);
  const categorySlug = sanitizeSegment(edition.categoryLabel || 'اخبار-روز') || 'اخبار';
  return `Ravio_${categorySlug}_${jalaliDateSlug}_ساعت-${clockSlug}.wav`;
}

export function supportsDirectoryPicker(): boolean {
  return (
    typeof window !== 'undefined' &&
    'showDirectoryPicker' in window &&
    typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
  );
}

export async function pickPodcastOutputDirectory(): Promise<DirectoryHandleLike | null> {
  if (!supportsDirectoryPicker()) return null;
  const picker = (
    window as unknown as {
      showDirectoryPicker: (opts?: { mode?: 'readwrite' }) => Promise<DirectoryHandleLike>;
    }
  ).showDirectoryPicker;
  const handle = await picker({ mode: 'readwrite' });
  return handle;
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function savePodcastFile(
  edition: BroadcastEdition,
  savedDirHandle?: unknown
): Promise<{ method: 'directory' | 'download'; filename: string; directoryName?: string }> {
  if (!edition.audioBlob) {
    throw new Error('فایل صوتی برای ذخیره آماده نیست.');
  }

  const filename = buildPodcastFilename(edition);
  const dir = savedDirHandle as DirectoryHandleLike | null | undefined;

  if (dir && typeof dir.getFileHandle === 'function') {
    try {
      let permission = dir.queryPermission
        ? await dir.queryPermission({ mode: 'readwrite' })
        : 'granted';

      if (permission !== 'granted' && dir.requestPermission) {
        permission = await dir.requestPermission({ mode: 'readwrite' });
      }

      if (permission === 'granted') {
        const fileHandle = await dir.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(edition.audioBlob);
        await writable.close();
        return {
          method: 'directory',
          filename,
          directoryName: dir.name,
        };
      }
    } catch {
      // Fall back to standard browser/Android Downloads folder save
    }
  }

  triggerBlobDownload(edition.audioBlob, filename);
  return {
    method: 'download',
    filename,
  };
}
