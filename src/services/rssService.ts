import { FeedCategoryId, RawNewsItem, RssFeedSource } from '../types/radio';
import { buildBackendUrl } from './aiService';

function stripHtml(input: string): string {
  if (!input) return '';
  return input
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitleAndSource(rawTitle: string, fallbackSource: string): { title: string; source: string } {
  const cleaned = stripHtml(rawTitle);
  // Google News titles often end with " - Source Name"
  const lastDash = cleaned.lastIndexOf(' - ');
  if (lastDash > 18 && lastDash < cleaned.length - 2) {
    const possibleTitle = cleaned.slice(0, lastDash).trim();
    const possibleSource = cleaned.slice(lastDash + 3).trim();
    if (possibleSource.length <= 45) {
      return { title: possibleTitle, source: possibleSource };
    }
  }
  return { title: cleaned, source: fallbackSource };
}

function parseXmlRss(xmlText: string, category: FeedCategoryId, feedLabel: string): RawNewsItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('فرمت XML فید قابل خواندن نیست.');
  }

  const channelTitle = doc.querySelector('channel > title')?.textContent?.trim() || feedLabel;
  const rssItems = Array.from(doc.querySelectorAll('item'));

  if (rssItems.length > 0) {
    return rssItems.map((el, idx) => {
      const rawTitle = el.querySelector('title')?.textContent || '';
      const rawDesc = el.querySelector('description')?.textContent || '';
      const link = el.querySelector('link')?.textContent?.trim() || '';
      const pubDate = el.querySelector('pubDate')?.textContent?.trim() || new Date().toISOString();
      const sourceEl = el.querySelector('source')?.textContent?.trim();
      const { title, source } = cleanTitleAndSource(rawTitle, sourceEl || channelTitle);
      return {
        id: `rss-${category}-${idx}-${Math.abs(hashCode(link || title))}`,
        title,
        description: stripHtml(rawDesc).slice(0, 420),
        link,
        pubDate,
        source,
        category,
      };
    });
  }

  // Fallback for Atom feeds (<entry>)
  const atomEntries = Array.from(doc.querySelectorAll('entry'));
  return atomEntries.map((el, idx) => {
    const rawTitle = el.querySelector('title')?.textContent || '';
    const rawDesc =
      el.querySelector('summary')?.textContent || el.querySelector('content')?.textContent || '';
    const linkEl = el.querySelector('link');
    const link = linkEl?.getAttribute('href') || linkEl?.textContent?.trim() || '';
    const pubDate =
      el.querySelector('updated')?.textContent?.trim() ||
      el.querySelector('published')?.textContent?.trim() ||
      new Date().toISOString();
    const { title, source } = cleanTitleAndSource(rawTitle, channelTitle);
    return {
      id: `atom-${category}-${idx}-${Math.abs(hashCode(link || title))}`,
      title,
      description: stripHtml(rawDesc).slice(0, 420),
      link,
      pubDate,
      source,
      category,
    };
  });
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchSingleRssFeed(
  feed: RssFeedSource,
  backendServerUrl?: string
): Promise<RawNewsItem[]> {
  const encodedUrl = encodeURIComponent(feed.url);

  // 1. Primary: rss2json.com CORS-friendly JSON bridge
  try {
    const res = await fetchWithTimeout(`https://api.rss2json.com/v1/api.json?rss_url=${encodedUrl}`, 9000);
    if (res.ok) {
      const data = (await res.json()) as {
        status?: string;
        feed?: { title?: string };
        items?: Array<{
          title?: string;
          description?: string;
          content?: string;
          link?: string;
          pubDate?: string;
          author?: string;
        }>;
      };
      if (data.status === 'ok' && Array.isArray(data.items) && data.items.length > 0) {
        const channelName = data.feed?.title || feed.label;
        return data.items.map((item, idx) => {
          const { title, source } = cleanTitleAndSource(item.title || '', item.author || channelName);
          return {
            id: `r2j-${feed.id}-${idx}-${Math.abs(hashCode(item.link || title))}`,
            title,
            description: stripHtml(item.description || item.content || '').slice(0, 420),
            link: item.link || '',
            pubDate: item.pubDate || new Date().toISOString(),
            source,
            category: feed.category,
          };
        });
      }
    }
  } catch {
    // Fall through to next CORS bridge
  }

  // 2. Fallback: allorigins.win CORS bridge + DOMParser
  try {
    const res = await fetchWithTimeout(`https://api.allorigins.win/get?url=${encodedUrl}`, 10000);
    if (res.ok) {
      const data = (await res.json()) as { contents?: string };
      if (data.contents && data.contents.includes('<')) {
        const parsed = parseXmlRss(data.contents, feed.category, feed.label);
        if (parsed.length > 0) return parsed;
      }
    }
  } catch {
    // Fall through to server-side proxy fallback
  }

  // 3. Final fallback: Built-in Express RSS proxy (/api/rss)
  const serverRes = await fetchWithTimeout(
    buildBackendUrl(`/api/rss?url=${encodedUrl}`, backendServerUrl),
    12000
  );
  if (!serverRes.ok) {
    throw new Error(`دریافت فید «${feed.label}» با خطا مواجه شد.`);
  }
  const xmlText = await serverRes.text();
  return parseXmlRss(xmlText, feed.category, feed.label);
}

export async function fetchCategoryFeeds(
  feeds: RssFeedSource[],
  category: FeedCategoryId,
  maxItems: number,
  backendServerUrl?: string
): Promise<{ items: RawNewsItem[]; errors: string[] }> {
  const activeFeeds = feeds.filter((f) => f.category === category && f.enabled);
  if (activeFeeds.length === 0) {
    throw new Error('هیچ منبع خبری فعالی برای این دسته‌بندی انتخاب نشده است.');
  }

  const settled = await Promise.allSettled(
    activeFeeds.map((feed) => fetchSingleRssFeed(feed, backendServerUrl))
  );
  const allItems: RawNewsItem[] = [];
  const errors: string[] = [];

  settled.forEach((result, idx) => {
    if (result.status === 'fulfilled') {
      allItems.push(...result.value);
    } else {
      errors.push(`${activeFeeds[idx].label}: ${result.reason?.message || 'خطا در اتصال'}`);
    }
  });

  if (allItems.length === 0) {
    throw new Error(errors[0] || 'هیچ خبری از منابع انتخابی دریافت نشد.');
  }

  // Deduplicate by normalized title and sort newest first
  const seen = new Set<string>();
  const deduped = allItems
    .filter((item) => {
      if (!item.title) return false;
      const key = item.title.toLowerCase().slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, maxItems);

  return { items: deduped, errors };
}

export async function fetchMultiCategoryFeeds(
  feeds: RssFeedSource[],
  categories: FeedCategoryId[],
  maxItems: number,
  backendServerUrl?: string
): Promise<{ items: RawNewsItem[]; errors: string[] }> {
  const uniqueCats = Array.from(new Set(categories));
  const activeFeeds = feeds.filter((f) => uniqueCats.includes(f.category) && f.enabled);
  if (activeFeeds.length === 0) {
    throw new Error('برای بولتن ترکیبی هیچ منبع خبری فعالی انتخاب نشده است.');
  }

  const settled = await Promise.allSettled(
    activeFeeds.map((feed) => fetchSingleRssFeed(feed, backendServerUrl))
  );

  const byCategory = new Map<FeedCategoryId, RawNewsItem[]>();
  const errors: string[] = [];

  settled.forEach((result, idx) => {
    const feed = activeFeeds[idx];
    if (result.status === 'fulfilled') {
      const list = byCategory.get(feed.category) ?? [];
      list.push(...result.value);
      byCategory.set(feed.category, list);
    } else {
      errors.push(`${feed.label}: ${result.reason?.message || 'خطا در اتصال'}`);
    }
  });

  // Fairly round-robin pick across categories so every selected topic is represented
  const seen = new Set<string>();
  const sortedQueues = uniqueCats.map((cat) => {
    const rawList = byCategory.get(cat) ?? [];
    return rawList
      .filter((item) => {
        if (!item.title) return false;
        const key = item.title.toLowerCase().slice(0, 60);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
  });

  const combined: RawNewsItem[] = [];
  let round = 0;
  while (combined.length < maxItems) {
    let addedInRound = false;
    for (const queue of sortedQueues) {
      if (round < queue.length && combined.length < maxItems) {
        combined.push(queue[round]);
        addedInRound = true;
      }
    }
    if (!addedInRound) break;
    round++;
  }

  if (combined.length === 0) {
    throw new Error(errors[0] || 'هیچ خبری برای بولتن ترکیبی دریافت نشد.');
  }

  return { items: combined, errors };
}
