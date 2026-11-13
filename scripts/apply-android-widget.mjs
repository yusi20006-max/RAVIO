import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const WIDGET_SRC_ROOT = path.join(PROJECT_ROOT, "android-widget");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyDirFiles(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) {
    throw new Error(`Missing widget source directory: ${srcDir}`);
  }
  ensureDir(destDir);
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    fs.copyFileSync(path.join(srcDir, entry.name), path.join(destDir, entry.name));
  }
}

function escapeJavaString(val) {
  return String(val)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r|\n/g, "");
}

function patchStringsXml(stringsPath) {
  const widgetDesc =
    "ویجت رادیوی هوشمند رانندگی راویو برای انتخاب دسته‌بندی، ساخت خبر و پخش فوری در خودرو";
  if (!fs.existsSync(stringsPath)) {
    ensureDir(path.dirname(stringsPath));
    fs.writeFileSync(
      stringsPath,
      `<?xml version='1.0' encoding='utf-8'?>\n<resources>\n    <string name="app_name">Ravio</string>\n    <string name="ravio_widget_description">${widgetDesc}</string>\n</resources>\n`,
      "utf8"
    );
    return;
  }

  let xml = fs.readFileSync(stringsPath, "utf8");
  if (!xml.includes('name="ravio_widget_description"')) {
    xml = xml.replace(
      /<\/resources>/,
      `    <string name="ravio_widget_description">${widgetDesc}</string>\n</resources>`
    );
    fs.writeFileSync(stringsPath, xml, "utf8");
  }
}

function patchAndroidManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`AndroidManifest.xml not found at ${manifestPath}`);
  }

  let xml = fs.readFileSync(manifestPath, "utf8");

  const permissions = [
    "android.permission.INTERNET",
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
    "android.permission.POST_NOTIFICATIONS",
    "android.permission.WAKE_LOCK",
  ];

  for (const perm of permissions) {
    if (!xml.includes(perm)) {
      xml = xml.replace(
        /<application\b/,
        `    <uses-permission android:name="${perm}" />\n\n    <application`
      );
    }
  }

  const receiverBlock = `
        <receiver
            android:name=".widget.RavioDriveWidgetProvider"
            android:exported="true"
            android:label="راویو · ویجت رانندگی">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/ravio_drive_widget_info" />
        </receiver>

        <service
            android:name=".widget.RavioWidgetService"
            android:exported="false"
            android:foregroundServiceType="mediaPlayback" />`;

  if (!xml.includes("RavioDriveWidgetProvider")) {
    xml = xml.replace(/<\/application>/, `${receiverBlock}\n    </application>`);
  }

  fs.writeFileSync(manifestPath, xml, "utf8");
}

function patchMainActivity(mainActivityPath) {
  if (!fs.existsSync(mainActivityPath)) {
    ensureDir(path.dirname(mainActivityPath));
    fs.writeFileSync(
      mainActivityPath,
      `package app.ravio.newsradio;

import android.os.Bundle;
import app.ravio.newsradio.widget.RavioWidgetPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RavioWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`,
      "utf8"
    );
    return;
  }

  let java = fs.readFileSync(mainActivityPath, "utf8");
  if (!java.includes("RavioWidgetPlugin")) {
    if (!java.includes("import android.os.Bundle;")) {
      java = java.replace(
        /package\s+app\.ravio\.newsradio\s*;/,
        "package app.ravio.newsradio;\n\nimport android.os.Bundle;"
      );
    }
    java = java.replace(
      /import\s+com\.getcapacitor\.BridgeActivity\s*;/,
      "import app.ravio.newsradio.widget.RavioWidgetPlugin;\nimport com.getcapacitor.BridgeActivity;"
    );

    if (/super\.onCreate\s*\(\s*savedInstanceState\s*\)\s*;/.test(java)) {
      java = java.replace(
        /super\.onCreate\s*\(\s*savedInstanceState\s*\)\s*;/,
        "registerPlugin(RavioWidgetPlugin.class);\n        super.onCreate(savedInstanceState);"
      );
    } else {
      java = java.replace(
        /public\s+class\s+MainActivity\s+extends\s+BridgeActivity\s*\{/,
        `public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RavioWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }`
      );
    }
    fs.writeFileSync(mainActivityPath, java, "utf8");
  }
}

export function applyAndroidWidget(
  androidDir = path.join(PROJECT_ROOT, "android"),
  options = {}
) {
  const appMainDir = path.join(androidDir, "app", "src", "main");
  if (!fs.existsSync(appMainDir)) {
    throw new Error(`Capacitor Android app/src/main directory not found: ${appMainDir}`);
  }

  const resDir = path.join(appMainDir, "res");
  copyDirFiles(path.join(WIDGET_SRC_ROOT, "res", "drawable"), path.join(resDir, "drawable"));
  copyDirFiles(path.join(WIDGET_SRC_ROOT, "res", "layout"), path.join(resDir, "layout"));
  copyDirFiles(path.join(WIDGET_SRC_ROOT, "res", "xml"), path.join(resDir, "xml"));

  const widgetJavaDest = path.join(appMainDir, "java", "app", "ravio", "newsradio", "widget");
  copyDirFiles(
    path.join(WIDGET_SRC_ROOT, "java", "app", "ravio", "newsradio", "widget"),
    widgetJavaDest
  );

  const rawBackendUrl = String(
    options.backendUrl || process.env.VITE_BACKEND_URL || "https://ravio.pages.dev"
  )
    .trim()
    .replace(/\/+$/, "");

  const configJavaPath = path.join(widgetJavaDest, "RavioWidgetConfig.java");
  let configJava = fs.readFileSync(configJavaPath, "utf8");
  configJava = configJava.replace(
    /public static final String DEFAULT_BACKEND_URL = "[^"]*";/,
    `public static final String DEFAULT_BACKEND_URL = "${escapeJavaString(rawBackendUrl)}";`
  );
  fs.writeFileSync(configJavaPath, configJava, "utf8");

  patchStringsXml(path.join(resDir, "values", "strings.xml"));
  patchAndroidManifest(path.join(appMainDir, "AndroidManifest.xml"));
  patchMainActivity(path.join(appMainDir, "java", "app", "ravio", "newsradio", "MainActivity.java"));

  return {
    androidDir,
    backendUrl: rawBackendUrl,
    widgetJavaDest,
  };
}

const executedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (executedDirectly) {
  const customDir = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
  const result = applyAndroidWidget(customDir);
  console.log(
    `Applied Ravio Android Home Screen Widget to ${result.androidDir} (backend=${result.backendUrl})`
  );
}
