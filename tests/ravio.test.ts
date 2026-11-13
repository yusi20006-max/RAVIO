import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatGeminiServerError,
  isAllowedCorsOrigin,
  isAllowedRssContentType,
  isLikelyXmlFeedBody,
  isPrivateOrReservedIp,
  preparePersianTextForTts,
  SlidingWindowRateLimiter,
  validateFeedUrlSyntax,
} from '../serverUtils.ts';
import { DEFAULT_FEEDS, DEFAULT_SETTINGS } from '../src/data/presets.ts';
import { formatClientAiError, generateRadioScript } from '../src/services/aiService.ts';
import { buildPodcastFilename } from '../src/services/fileSaveService.ts';
import { validateClientRssUrl } from '../src/services/rssService.ts';
import { createBackupPayload, parseBackupPayload } from '../src/services/storageService.ts';

test('preparePersianTextForTts normalizes acronyms, units, URLs, and digits', () => {
  const input = 'گزارش BBC درباره AI و CENTCOM با رشد 12.5% و $50 میلیون https://example.com/news *مهم*';
  const result = preparePersianTextForTts(input);

  assert.match(result, /بی‌بی‌سی/);
  assert.match(result, /هوش مصنوعی/);
  assert.match(result, /سِنت‌کام/);
  assert.match(result, /۱۲\.۵ درصد/);
  assert.match(result, /۵۰ دلار/);
  assert.doesNotMatch(result, /https?:\/\//);
  assert.doesNotMatch(result, /[*]/);
});

test('isPrivateOrReservedIp blocks loopback, private, link-local, metadata, IPv6, and IPv4-mapped IPv6', () => {
  const blocked = [
    '127.0.0.1',
    '10.0.0.5',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.10',
    '0.0.0.0',
    '100.64.0.1',
    '::',
    '::1',
    '0:0:0:0:0:0:0:1',
    'fe80::1',
    'fc00::1',
    'fd12:3456:789a::1',
    '2001:db8::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe',
    '::7f00:1',
    '64:ff9b::7f00:1',
  ];
  for (const ip of blocked) {
    assert.equal(isPrivateOrReservedIp(ip), true, `Expected ${ip} to be blocked`);
  }

  assert.equal(isPrivateOrReservedIp('8.8.8.8'), false);
  assert.equal(isPrivateOrReservedIp('1.1.1.1'), false);
  assert.equal(isPrivateOrReservedIp('2606:4700:4700::1111'), false);
});

test('validateFeedUrlSyntax and validateClientRssUrl reject unsafe URLs and allow public feeds', () => {
  const unsafeUrls = [
    'http://localhost:3000/api/health',
    'http://ip6-localhost/rss',
    'http://127.0.0.1/admin',
    'http://169.254.169.254/latest/meta-data/',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://10.0.0.1/feed.xml',
    'http://user:pass@example.com/rss.xml',
    'ftp://example.com/rss.xml',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'not-a-url',
  ];
  for (const url of unsafeUrls) {
    assert.throws(() => validateFeedUrlSyntax(url), `Server validator should block ${url}`);
    assert.throws(() => validateClientRssUrl(url), `Client validator should block ${url}`);
  }

  const valid = validateFeedUrlSyntax('https://feeds.bbci.co.uk/persian/rss.xml');
  assert.equal(valid.hostname, 'feeds.bbci.co.uk');
  assert.equal(
    validateClientRssUrl('https://feeds.bbci.co.uk/persian/rss.xml'),
    'https://feeds.bbci.co.uk/persian/rss.xml'
  );
});

test('RSS Content-Type and XML body checks reject HTML/binary payloads and accept valid feeds', () => {
  assert.equal(isAllowedRssContentType('application/rss+xml; charset=utf-8'), true);
  assert.equal(isAllowedRssContentType('application/atom+xml'), true);
  assert.equal(isAllowedRssContentType('text/xml; charset=utf-8'), true);
  assert.equal(isAllowedRssContentType('text/html; charset=utf-8'), false);
  assert.equal(isAllowedRssContentType('application/json'), false);
  assert.equal(isAllowedRssContentType('application/octet-stream'), false);

  assert.equal(isLikelyXmlFeedBody('<?xml version="1.0"?><rss version="2.0"><channel/></rss>'), true);
  assert.equal(isLikelyXmlFeedBody('\uFEFF<feed xmlns="http://www.w3.org/2005/Atom"></feed>'), true);
  assert.equal(isLikelyXmlFeedBody('<!doctype html><html><body>Login</body></html>'), false);
  assert.equal(isLikelyXmlFeedBody('{"error":"not rss"}'), false);
});

test('SlidingWindowRateLimiter enforces request limits and recovers after window elapses', () => {
  const limiter = new SlidingWindowRateLimiter(2, 1000);
  const t0 = 1_000_000;

  assert.equal(limiter.consume('client-1', t0).allowed, true);
  assert.equal(limiter.consume('client-1', t0 + 100).allowed, true);

  const third = limiter.consume('client-1', t0 + 200);
  assert.equal(third.allowed, false);
  assert.ok(third.retryAfterSec >= 1);

  assert.equal(limiter.consume('client-1', t0 + 1100).allowed, true);
});

test('isAllowedCorsOrigin allows same-host, APP_URL, and Capacitor origins while rejecting unknown origins', () => {
  assert.equal(isAllowedCorsOrigin(undefined, 'ravio.run.app'), true);
  assert.equal(isAllowedCorsOrigin('https://localhost', 'ravio.run.app'), true);
  assert.equal(isAllowedCorsOrigin('capacitor://localhost', 'ravio.run.app'), true);
  assert.equal(isAllowedCorsOrigin('https://ravio.run.app', 'ravio.run.app'), true);
  assert.equal(isAllowedCorsOrigin('https://evil.example.com', 'ravio.run.app'), false);
  assert.equal(
    isAllowedCorsOrigin('https://custom.example.com', 'ravio.run.app', 'https://custom.example.com'),
    true
  );
  assert.equal(
    isAllowedCorsOrigin('https://my-app.run.app', 'localhost:3000', '', 'https://my-app.run.app/sub'),
    true
  );
});

test('Server and client AI error formatters classify auth, quota, timeout, and redact keys', () => {
  const keyErr = formatGeminiServerError(new Error('401 API_KEY_INVALID for key AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz12345'));
  assert.equal(keyErr.status, 401);
  assert.doesNotMatch(keyErr.message, /AIzaSy/);

  const orKeyErr = formatGeminiServerError(new Error('OpenRouter error with sk-or-v1-abcdef1234567890'));
  assert.doesNotMatch(orKeyErr.message, /sk-or-v1/);

  const quotaErr = formatGeminiServerError(new Error('429 RESOURCE_EXHAUSTED quota exceeded'));
  assert.equal(quotaErr.status, 429);

  const abortErr = new Error('The operation was aborted');
  abortErr.name = 'AbortError';
  assert.equal(formatGeminiServerError(abortErr).status, 504);

  assert.match(formatClientAiError(new Error('Unauthorized'), 401), /احراز هویت|کلید API/);
  assert.match(formatClientAiError(new Error('Rate limit'), 429), /سهمیه/);
  assert.match(formatClientAiError(abortErr), /زمان انتظار/);
  assert.match(formatClientAiError(new TypeError('Failed to fetch')), /اتصال به سرویس/);
});

test('generateRadioScript supports offline mode cleanly and validates missing keys / bad Base URL', async () => {
  const sampleItems = [
    {
      id: 'item-1',
      title: 'خبر آزمایشی فناوری',
      description: 'جزئیات خبر آزمایشی.',
      link: 'https://example.com/1',
      pubDate: new Date().toISOString(),
      source: 'منبع تست',
      category: 'tech_ai' as const,
    },
  ];

  const offlineRes = await generateRadioScript(sampleItems, 'فناوری و هوش مصنوعی', {
    ...DEFAULT_SETTINGS,
    aiProvider: 'offline',
  });
  assert.match(offlineRes.broadcastTitle, /مرور آفلاین/);
  assert.match(offlineRes.script, /خبر آزمایشی فناوری/);
  assert.equal(offlineRes.cards.length, 1);

  await assert.rejects(
    () =>
      generateRadioScript(sampleItems, 'فناوری و هوش مصنوعی', {
        ...DEFAULT_SETTINGS,
        aiProvider: 'openrouter',
        openRouterApiKey: '',
      }),
    /کلید API سرویس OpenRouter/
  );

  await assert.rejects(
    () =>
      generateRadioScript(sampleItems, 'فناوری و هوش مصنوعی', {
        ...DEFAULT_SETTINGS,
        aiProvider: 'custom_openai',
        customBaseUrl: 'invalid-url',
        customApiKey: 'sk-test',
      }),
    /Base URL/
  );
});

test('createBackupPayload strips API keys by default and parseBackupPayload preserves local keys and validates format', () => {
  const userSettings = {
    ...DEFAULT_SETTINGS,
    openRouterApiKey: 'sk-or-secret-123',
    customApiKey: 'sk-custom-secret-456',
  };

  const sanitized = createBackupPayload(userSettings, DEFAULT_FEEDS, 'iran');
  assert.equal(sanitized.includesApiKeys, false);
  assert.equal(sanitized.settings.openRouterApiKey, '');
  assert.equal(sanitized.settings.customApiKey, '');

  const imported = parseBackupPayload(JSON.stringify(sanitized), userSettings);
  assert.equal(imported.settings.openRouterApiKey, 'sk-or-secret-123');
  assert.equal(imported.settings.customApiKey, 'sk-custom-secret-456');

  const withKeys = createBackupPayload(userSettings, DEFAULT_FEEDS, 'iran', {
    includeApiKeys: true,
  });
  assert.equal(withKeys.includesApiKeys, true);
  assert.equal(withKeys.settings.openRouterApiKey, 'sk-or-secret-123');
  assert.equal(withKeys.settings.customApiKey, 'sk-custom-secret-456');

  assert.throws(() => parseBackupPayload('{"invalid":true}'), /ساختار فایل پشتیبان/);
  assert.throws(
    () => parseBackupPayload(JSON.stringify({ settings: DEFAULT_SETTINGS, feeds: [] })),
    /منبع خبری معتبری ندارد/
  );
});

test('buildPodcastFilename generates clean Jalali-tagged WAV filenames', () => {
  const filename = buildPodcastFilename({
    categoryLabel: 'ایران و منطقه',
    createdAt: Date.UTC(2026, 4, 10, 6, 30, 0),
    broadcastTitle: 'بخش صبحگاهی',
  });

  assert.match(filename, /^Ravio_ایران-و-منطقه_.*_ساعت-\d{2}-\d{2}\.wav$/);
});
