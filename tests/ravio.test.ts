import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isAllowedCorsOrigin,
  isPrivateOrReservedIp,
  preparePersianTextForTts,
  SlidingWindowRateLimiter,
  validateFeedUrlSyntax,
} from '../serverUtils.ts';
import { DEFAULT_FEEDS, DEFAULT_SETTINGS } from '../src/data/presets.ts';
import { buildPodcastFilename } from '../src/services/fileSaveService.ts';
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

test('isPrivateOrReservedIp blocks loopback, private, link-local, metadata, and IPv4-mapped IPv6', () => {
  const blocked = [
    '127.0.0.1',
    '10.0.0.5',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.10',
    '0.0.0.0',
    '100.64.0.1',
    '::1',
    'fe80::1',
    'fc00::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
  ];
  for (const ip of blocked) {
    assert.equal(isPrivateOrReservedIp(ip), true, `Expected ${ip} to be blocked`);
  }

  assert.equal(isPrivateOrReservedIp('8.8.8.8'), false);
  assert.equal(isPrivateOrReservedIp('1.1.1.1'), false);
});

test('validateFeedUrlSyntax rejects unsafe URLs and allows public HTTP/HTTPS feeds', () => {
  const unsafeUrls = [
    'http://localhost:3000/api/health',
    'http://127.0.0.1/admin',
    'http://169.254.169.254/latest/meta-data/',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://user:pass@example.com/rss.xml',
    'ftp://example.com/rss.xml',
    'file:///etc/passwd',
    'not-a-url',
  ];
  for (const url of unsafeUrls) {
    assert.throws(() => validateFeedUrlSyntax(url), `Expected ${url} to throw`);
  }

  const valid = validateFeedUrlSyntax('https://feeds.bbci.co.uk/persian/rss.xml');
  assert.equal(valid.hostname, 'feeds.bbci.co.uk');
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

test('isAllowedCorsOrigin allows same-host and Capacitor origins while rejecting unknown origins', () => {
  assert.equal(isAllowedCorsOrigin(undefined, 'ravio.run.app'), true);
  assert.equal(isAllowedCorsOrigin('https://localhost', 'ravio.run.app'), true);
  assert.equal(isAllowedCorsOrigin('capacitor://localhost', 'ravio.run.app'), true);
  assert.equal(isAllowedCorsOrigin('https://ravio.run.app', 'ravio.run.app'), true);
  assert.equal(isAllowedCorsOrigin('https://evil.example.com', 'ravio.run.app'), false);
  assert.equal(
    isAllowedCorsOrigin('https://custom.example.com', 'ravio.run.app', 'https://custom.example.com'),
    true
  );
});

test('createBackupPayload strips API keys by default and parseBackupPayload preserves existing local keys', () => {
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
});

test('buildPodcastFilename generates clean Jalali-tagged WAV filenames', () => {
  const filename = buildPodcastFilename({
    categoryLabel: 'ایران و منطقه',
    createdAt: Date.UTC(2026, 4, 10, 6, 30, 0),
    broadcastTitle: 'بخش صبحگاهی',
  });

  assert.match(filename, /^Ravio_ایران-و-منطقه_.*_ساعت-\d{2}-\d{2}\.wav$/);
});
