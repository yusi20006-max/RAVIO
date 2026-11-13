<div align="center">
  <img src="public/github-banner.png" alt="Ravio — روایتِ هوشمندِ خبر" width="100%" />
  <br /><br />
  <img src="public/pwa-192x192.png" alt="Ravio App Icon" width="76" height="76" />
  <h1>Ravio · راویو</h1>
  <p><strong>روایتِ هوشمندِ خبر</strong></p>
  <p>
    استودیوی رادیو خبر هوشمند و متن‌باز به زبان فارسی با پشتیبانی از فیدهای RSS، هوش مصنوعی، حالت رانندگی، تله‌پرامپتر تلویزیون، PWA و خروجی اندروید
  </p>

  <p>
    <img src="https://img.shields.io/badge/Version-1.0.0-F59E0B?style=flat-square" alt="Version 1.0.0" />
    <img src="https://img.shields.io/badge/React-19-149ECA?style=flat-square&logo=react&logoColor=white" alt="React 19" />
    <img src="https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/PWA-Ready-5A0FC8?style=flat-square" alt="PWA Ready" />
    <img src="https://img.shields.io/badge/Android-Capacitor-3DDC84?style=flat-square&logo=android&logoColor=black" alt="Capacitor Android" />
  </p>
</div>

---

## معرفی راویو

**راویو (Ravio)** یک استودیوی هوشمند برای تبدیل خودکار خبرهای متنی به بولتن رادیویی فارسی است. برنامه سرخط‌های تازه را از خبرگزاری‌های داخلی و بین‌المللی (RSS) جمع‌آوری می‌کند، با مدل‌های هوش مصنوعی به یک متن رادیویی روان و خوش‌خوان تبدیل می‌سازد و آن را با صدای گوینده هوشمند (یا موتور گفتار آفلاین دستگاه) پخش می‌کند.

رابط کاربری راویو برای **استفاده مینیمال روزمره**، **رانندگی بدون حواس‌پرتی** و **نمایش روی مانیتور خودرو و تلویزیون** (به‌صورت تله‌پرامپتر پرکنتراست) طراحی شده است.

---

## ویژگی‌های کلیدی

- **صفحه پخش مینیمال و تله‌پرامپتر زنده:** انتخاب سریع دسته‌بندی یا تولید **«خلاصه صبحگاهی ترکیبی»** از چند موضوع هم‌زمان، همراه با هایلایت هم‌زمان جملات و کلمات حین پخش.
- **منابع خبری آماده + فیدهای سفارشی:** شامل بی‌بی‌سی فارسی، ایسنا، زومیت، یورونیوز، اقتصاد ایران، فناوری و هوش مصنوعی، و امکان افزودن هر لینک RSS دلخواه.
- **مدیریت خطای تلفظ در فارسی (TTS Pronunciation Guard):** آوانگاری خودکار اسامی و مخفف‌های خارجی، تبدیل درصدها، واحدهای پول و ارقام به فارسی، پشتیبانی از اعراب راهنما و تشخیص تغییر متن نسبت به فایل صوتی ساخته‌شده.
- **پیش‌نمایش و انتخاب صدای گوینده:** امکان تست زنده صداهای Gemini (`Kore`, `Puck`, `Charon`, `Zephyr`, `Fenrir`) با متن دلخواه و ذخیره در حافظه برنامه.
- **حالت رانندگی و تله‌پرامپتر تلویزیون (Car Mode & TV):** تم تله‌پرامپتر پرکنتراست (متن زرد درخشان روی پس‌زمینه مشکی مطلق `#000000`)، پخش زنجیره‌ای آرشیو (**Auto-Next**) و **تایمر خواب** (۱۵ تا ۴۵ دقیقه).
- **کارت‌های خبر و آرشیو آفلاین (IndexedDB):** تب مستقل برای مرور خلاصه فارسی خبرها، لینک منبع اصلی و مدیریت حافظه فایل‌های WAV ذخیره‌شده روی دستگاه.
- **زمان‌بند روزانه و ذخیره خودکار پادکست:** ساخت خودکار بولتن سر ساعت مشخص و ذخیره فایل WAV با نام‌گذاری دقیق شامل دسته‌بندی، تاریخ شمسی و ساعت (`Ravio_<دسته>_<تاریخ>_ساعت-<HH-mm>.wav`).
- **پشتیبانی کامل از حالت آفلاین و چندارائه‌دهنده‌ای:** امکان اتصال به سرور Gemini (بدون نیاز به کلید API روی گوشی)، OpenRouter، APIهای سازگار با OpenAI یا اجرای کاملاً آفلاین و مستقل با گوینده داخلی دستگاه.
- **نصب مستقیم PWA و خروجی اندروید (APK):** قابل نصب روی اندروید و Android TV از مرورگر + پیکربندی آماده Capacitor و خروجی/ورودی JSON برای انتقال تنظیمات و فیدها.

---

## فناوری‌های استفاده‌شده

| بخش | فناوری |
| :--- | :--- |
| **رابط کاربری (Frontend)** | React 19, TypeScript, Tailwind CSS v4, Lucide Icons |
| **سرویس وب و بیلد** | Vite 8, `vite-plugin-pwa` (Workbox Service Worker) |
| **سرور و پروکسی امن (Backend)** | Node.js, Express, `@google/genai` SDK |
| **ذخیره‌سازی محلی** | IndexedDB (فایل‌های WAV و پوشه خروجی) + `localStorage` |
| **خروجی موبایل** | Capacitor (`app.ravio.newsradio`) |

---

## نصب و راه‌اندازی محلی

### پیش‌نیازها
- **Node.js 20+**
- کلید **Gemini API** (برای تولید متن و صدای هوشمند سمت سرور)

### مراحل اجرا

۱. کلون کردن مخزن:

```bash
git clone https://github.com/yusi20006-max/RAVIO.git
cd RAVIO
```

۲. نصب وابستگی‌ها:

```bash
npm install
```

۳. تنظیم متغیرهای محیطی:
فایل `.env` را از روی `.env.example` بسازید و کلید Gemini را قرار دهید:

```env
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
# اختیاری: آدرس سرور مستقرشده برای ساخت نسخه مستقل APK
VITE_BACKEND_URL=""
```

۴. اجرای محیط توسعه (پورت `3000`):

```bash
npm run dev
```

۵. بیلد و اجرای نسخه نهایی (Production):

```bash
npm run build
npm start
```

---

## ساخت خروجی اندروید (APK) در گیت‌هاب و به‌صورت محلی

### روش ۱: ساخت خودکار APK از داخل گیت‌هاب (GitHub Actions)
ورک‌فلو `.github/workflows/build-apk.yml` به‌صورت آماده در مخزن قرار دارد و روی هر Push (یا اجرای دستی) فایل نصبی اندروید را می‌سازد:

1. در مخزن گیت‌هاب خود وارد تب **Actions** شوید.
2. گزینه **Build Android APK (Ravio)** را انتخاب کرده و روی **Run workflow** بزنید *(در صورت تمایل می‌توانید آدرس سرور `backend_url` را نیز در ورودی وارد کنید تا داخل APK ثبت شود)*.
3. پس از پایان اجرا، از بخش **Artifacts** در پایین صفحه، فایل **`ravio-android-debug-apk`** (`app-debug.apk`) را دانلود و روی گوشی یا اندروید تی‌وی نصب کنید.

### روش ۲: ساخت محلی با Capacitor و Android Studio

فایل `capacitor.config.ts` به‌صورت آماده با شناسه `app.ravio.newsradio` در پروژه قرار دارد:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

سپس از داخل Android Studio خروجی APK یا AAB را بسازید. در اپلیکیشن اندروید می‌توانید از بخش **تنظیمات ← هوش مصنوعی و سرور** آدرس سرور خودتان را وارد کنید تا بدون ذخیره کلید API روی گوشی، به Gemini و پروکسی RSS متصل شوید.

---

## ساختار پروژه

```text
RAVIO/
├── .github/workflows/build-apk.yml # ورک‌فلو خودکار ساخت APK در GitHub Actions
├── server.ts                  # سرور Express، پروکسی امن RSS و اندپوینت‌های Gemini Script/TTS
├── capacitor.config.ts        # پیکربندی ساخت نسخه اندروید (Capacitor)
├── vite.config.ts             # تنظیمات Vite و مانیفست / Service Worker اپلیکیشن PWA
├── public/                    # آیکون‌های استاندارد، بنر گیت‌هاب و دارایی‌های PWA
└── src/
    ├── App.tsx                # ساختار اصلی، ناوبری ۴ بخشی، زمان‌بند روزانه و حالت رانندگی
    ├── components/
    │   ├── PlayerScriptTab.tsx # صفحه اول مینیمال: انتخاب دسته، پخش‌کننده و تله‌پرامپتر
    │   ├── NewsCardsTab.tsx    # صفحه کارت‌های خبر و آرشیو آفلاین (IndexedDB)
    │   ├── SourcesTab.tsx      # مدیریت و تست فیدهای RSS آماده و سفارشی
    │   ├── SettingsTab.tsx     # تنظیمات بازشونده (AI، پیش‌نمایش صدا، زمان‌بند، آرشیو، PWA و درباره)
    │   ├── CarModeOverlay.tsx  # حالت رانندگی و تله‌پرامپتر پرکنتراست تلویزیون
    │   └── PWAInstallButton.tsx
    ├── hooks/
    │   ├── useRadioPlayer.ts   # موتور پخش دوگانه (WAV + Web Speech)، اسکرول جملات و کلیدهای خودرو
    │   └── usePWAInstall.ts    # تشخیص قابلیت نصب PWA و وضعیت شبکه
    ├── services/
    │   ├── aiService.ts        # ارتباط با Gemini / OpenRouter / OpenAI و حالت آفلاین
    │   ├── rssService.ts       # دریافت، پاک‌سازی و ترکیب چنددسته‌ای فیدهای RSS
    │   ├── archiveDb.ts        # ذخیره‌سازی آفلاین در IndexedDB و مدیریت پوشه خروجی
    │   ├── fileSaveService.ts  # تاریخ شمسی، نام‌گذاری فایل و ذخیره خودکار پادکست
    │   └── storageService.ts   # تنظیمات محلی، ادغام فیدهای جدید و پشتیبان‌گیری JSON
    └── data/
        └── presets.ts          # دسته‌بندی‌ها، فیدهای پیش‌فرض فارسی/بین‌المللی و صداهای Gemini
```

---

## مخزن گیت‌هاب و نسخه

- **نسخه فعلی:** `1.0.0`
- **مخزن گیت‌هاب:** [https://github.com/yusi20006-max/RAVIO](https://github.com/yusi20006-max/RAVIO)
