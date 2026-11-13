import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { applyAndroidWidget } from "../scripts/apply-android-widget.mjs";
import { syncAndroidWidgetConfig } from "../src/services/androidWidgetBridge.ts";
import { DEFAULT_FEEDS, DEFAULT_SETTINGS } from "../src/data/presets.ts";

function createSyntheticCapacitorAndroidDir(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ravio-android-test-"));
  const appMain = path.join(root, "app", "src", "main");
  const javaDir = path.join(appMain, "java", "app", "ravio", "newsradio");
  const valuesDir = path.join(appMain, "res", "values");

  fs.mkdirSync(javaDir, { recursive: true });
  fs.mkdirSync(valuesDir, { recursive: true });

  fs.writeFileSync(
    path.join(appMain, "AndroidManifest.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:label="@string/app_name">
        <activity android:name=".MainActivity" android:exported="true" />
    </application>
    <uses-permission android:name="android.permission.INTERNET" />
</manifest>
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(valuesDir, "strings.xml"),
    `<?xml version='1.0' encoding='utf-8'?>
<resources>
    <string name="app_name">Ravio</string>
</resources>
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(javaDir, "MainActivity.java"),
    `package app.ravio.newsradio;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {}
`,
    "utf8"
  );

  return root;
}

test("applyAndroidWidget injects widget layout, 5-category buttons, Java classes, manifest receiver/service, and MainActivity plugin idempotently", () => {
  const androidDir = createSyntheticCapacitorAndroidDir();
  try {
    const res = applyAndroidWidget(androidDir, { backendUrl: "https://ravio.pages.dev/" });
    assert.equal(res.backendUrl, "https://ravio.pages.dev");

    // Re-running should remain idempotent without duplicating XML blocks or imports
    applyAndroidWidget(androidDir, { backendUrl: "https://ravio.pages.dev" });

    const appMain = path.join(androidDir, "app", "src", "main");
    const widgetPkg = path.join(appMain, "java", "app", "ravio", "newsradio", "widget");

    for (const javaFile of [
      "RavioWidgetConfig.java",
      "RavioDriveWidgetProvider.java",
      "RavioWidgetService.java",
      "RavioWidgetPlugin.java",
    ]) {
      assert.equal(fs.existsSync(path.join(widgetPkg, javaFile)), true, `Missing ${javaFile}`);
    }

    const configJava = fs.readFileSync(path.join(widgetPkg, "RavioWidgetConfig.java"), "utf8");
    assert.match(configJava, /DEFAULT_BACKEND_URL = "https:\/\/ravio\.pages\.dev";/);
    assert.match(configJava, /formatPersianShortDateTime/);
    assert.match(configJava, /formatPersianFullDateTime/);
    assert.match(configJava, /formatWidgetBroadcastHeadline/);

    const serviceJava = fs.readFileSync(path.join(widgetPkg, "RavioWidgetService.java"), "utf8");
    assert.match(serviceJava, /oldWav\.delete\(\)/);
    assert.match(serviceJava, /setUseCaches\(false\)/);
    assert.match(serviceJava, /&_ts=/);
    assert.match(serviceJava, /parseRssDateMillis/);
    assert.match(serviceJava, /Long\.compare\(b\.pubDateMillis, a\.pubDateMillis\)/);
    assert.match(serviceJava, /generatedAtLabel/);
    assert.match(serviceJava, /formatWidgetBroadcastHeadline/);

    const layoutXml = fs.readFileSync(
      path.join(appMain, "res", "layout", "ravio_drive_widget.xml"),
      "utf8"
    );
    for (const id of [
      "btn_cat_combined",
      "btn_cat_iran",
      "btn_cat_world",
      "btn_cat_economy",
      "btn_cat_tech",
      "btn_build_play",
      "btn_toggle_play",
    ]) {
      assert.ok(layoutXml.includes(`@+id/${id}`), `Widget layout missing ${id}`);
    }
    assert.match(layoutXml, /android:maxLines="2"/);
    assert.doesNotMatch(layoutXml, /<androidx\.|<com\.google\./);

    const manifest = fs.readFileSync(path.join(appMain, "AndroidManifest.xml"), "utf8");
    assert.match(manifest, /android\.permission\.FOREGROUND_SERVICE_MEDIA_PLAYBACK/);
    assert.match(manifest, /android\.permission\.POST_NOTIFICATIONS/);
    assert.match(manifest, /android\.permission\.WAKE_LOCK/);
    assert.equal(manifest.match(/RavioDriveWidgetProvider/g)?.length, 1);
    assert.equal(manifest.match(/RavioWidgetService/g)?.length, 1);
    assert.match(manifest, /android:foregroundServiceType="mediaPlayback"/);

    const mainActivity = fs.readFileSync(
      path.join(appMain, "java", "app", "ravio", "newsradio", "MainActivity.java"),
      "utf8"
    );
    assert.equal(mainActivity.match(/registerPlugin\(RavioWidgetPlugin\.class\);/g)?.length, 1);

    const stringsXml = fs.readFileSync(path.join(appMain, "res", "values", "strings.xml"), "utf8");
    assert.equal(stringsXml.match(/ravio_widget_description/g)?.length, 1);
  } finally {
    fs.rmSync(androidDir, { recursive: true, force: true });
  }
});

test("syncAndroidWidgetConfig no-ops cleanly in browser and forwards settings/feeds when Capacitor plugin exists", async () => {
  const prevWindow = (globalThis as { window?: unknown }).window;
  try {
    delete (globalThis as { window?: unknown }).window;
    const browserResult = await syncAndroidWidgetConfig({
      settings: DEFAULT_SETTINGS,
      feeds: DEFAULT_FEEDS,
      activeCategory: "iran",
    });
    assert.equal(browserResult, false);

    let capturedOptions: Record<string, unknown> | null = null;
    (globalThis as { window?: unknown }).window = {
      Capacitor: {
        isNativePlatform: () => true,
        Plugins: {
          RavioWidget: {
            syncConfig: async (opts: Record<string, unknown>) => {
              capturedOptions = opts;
              return { ok: true };
            },
          },
        },
      },
    };

    const nativeResult = await syncAndroidWidgetConfig({
      settings: {
        ...DEFAULT_SETTINGS,
        backendServerUrl: "https://ravio.pages.dev",
        geminiVoice: "Puck",
      },
      feeds: DEFAULT_FEEDS,
      activeCategory: "economy",
    });
    assert.equal(nativeResult, true);
    assert.ok(capturedOptions);
    assert.equal(capturedOptions.backendServerUrl, "https://ravio.pages.dev");
    assert.equal(capturedOptions.activeCategory, "economy");
    assert.equal(capturedOptions.geminiVoice, "Puck");
    const parsedFeeds = JSON.parse(String(capturedOptions.feedsJson)) as Array<{ category: string }>;
    assert.ok(parsedFeeds.length >= DEFAULT_FEEDS.length);
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = prevWindow;
    }
  }
});
