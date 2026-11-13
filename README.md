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

## استقرار رایگان روی Cloudflare Pages

راویو از یک معماری یکپارچه روی Cloudflare Pages استفاده می‌کند: رابط React/Vite به‌صورت فایل‌های Static منتشر می‌شود و درخواست‌های API از طریق Pages Functions به کد مشترک `cloudflare/worker.mjs` می‌رسند. بنابراین وب‌اپ و API روی یک دامنه قرار می‌گیرند و برای نسخه وب نیازی به تنظیم جداگانه Base URL یا سرور Express نیست.

**آدرس Production پروژه:** [https://ravio.pages.dev](https://ravio.pages.dev)

### معماری و مسیرهای API

- `GET /api/health` — بررسی سلامت API و اعلام اینکه Secret مربوط به Gemini تنظیم شده است یا نه.
- `GET /api/rss?url=<RSS_URL>` — دریافت فید از طریق پروکسی RSS؛ URLهای محلی/خصوصی، محتوای نامعتبر و حجم بیش از حد رد می‌شوند.
- `POST /api/gemini/script` — تبدیل خبرها به متن بولتن فارسی.
- `POST /api/gemini/tts` — تولید خروجی صوتی WAV از متن.

مسیر اتصال Pages Functions در فایل `functions/api/[[path]].ts` تعریف شده و منطق API در `cloudflare/worker.mjs` قرار دارد. تنظیمات سازگاری Cloudflare در `wrangler.toml` و نسخه Node در `.nvmrc` ثبت شده‌اند.

### پیش‌نیازها

- حساب Cloudflare با دسترسی به Workers & Pages.
- مخزن GitHub: [yusi20006-max/RAVIO](https://github.com/yusi20006-max/RAVIO).
- کلید Gemini API از Google AI Studio؛ این کلید را فقط به‌صورت Secret در Cloudflare وارد کنید، نه در GitHub، فایل‌های پروژه یا APK.

### راه‌اندازی اولیه در Cloudflare

پروژه `ravio` قبلاً در حساب Cloudflare ایجاد و به مخزن GitHub متصل شده است. اگر می‌خواهید آن را از ابتدا بسازید یا اتصال را دوباره برقرار کنید:

1. وارد [Cloudflare Dashboard](https://dash.cloudflare.com/) شوید و از بخش **Workers & Pages** گزینه **Create application → Pages → Connect to Git** را انتخاب کنید.
2. حساب GitHub را متصل کنید و مخزن **`yusi20006-max/RAVIO`** را انتخاب کنید.
3. شاخه Production را روی **`main`** قرار دهید.
4. تنظیمات Build را مطابق جدول زیر وارد کنید.

| گزینه | مقدار |
| --- | --- |
| Framework preset | Vite |
| Production branch | `main` |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |
| Node.js version | `22` |

5. پروژه را ایجاد کنید. Cloudflare پس از هر Push به شاخه `main`، Build و Deployment جدید را به‌صورت خودکار اجرا می‌کند.
6. در بخش **Settings → Functions → Compatibility Flags**، پرچم `nodejs_compat` را برای محیط Production فعال نگه دارید. این مقدار در `wrangler.toml` نیز تعریف شده است.
7. در بخش **Settings → Variables and Secrets**، متغیرهای محیطی Production را تنظیم کنید.

### تنظیم متغیرها و Secretها

در مسیر **Workers & Pages → ravio → Settings → Variables and Secrets → Production**:

| نام | نوع | مقدار |
| --- | --- | --- |
| `GEMINI_API_KEY` | **Secret** | کلید خصوصی Gemini API شما |
| `ALLOWED_ORIGINS` | Plain text | `capacitor://localhost,https://localhost` |
| `NODE_VERSION` | Plain text | `22` |

نکات امنیتی و پیکربندی:

- مقدار `GEMINI_API_KEY` را با گزینه **Encrypt / Secret** ثبت کنید. این کلید نباید در کد فرانت‌اند، فایل `.env` عمومی، GitHub Secrets غیرضروری یا تنظیمات قابل مشاهده APK قرار گیرد.
- درخواست‌های وب هم‌مبدأ به‌صورت خودکار مجازند؛ نیازی نیست دامنه `https://ravio.pages.dev` را دستی به `ALLOWED_ORIGINS` اضافه کنید.
- دو Origin مربوط به Capacitor در فهرست بالا برای درخواست‌های APK در نظر گرفته شده‌اند. اگر از دامنه سفارشی یا Origin دیگری استفاده می‌کنید، آن را با کاما به این مقدار اضافه کنید.
- `RAVIO_API_SECRET` را در استقرار فعلی تنظیم نکنید؛ APK فعلی این Secret را به‌عنوان هدر ارسال نمی‌کند و فعال‌کردن آن باعث ردشدن درخواست‌های Gemini از APK خواهد شد.
- پس از تغییر Secretها یا متغیرهای محیطی، یک Deployment جدید اجرا کنید تا تنظیمات در نسخه فعال اعمال شوند.

برای پروژه موجود می‌توانید مستقیماً وارد [تنظیمات پروژه ravio در Cloudflare](https://dash.cloudflare.com/65449de9c053ae9b57ba192402c1f6a6/pages/view/ravio/settings) شوید.

### بررسی موفقیت استقرار

پس از پایان Deployment، این آدرس را در مرورگر باز کنید:

```text
https://ravio.pages.dev/api/health
```

پاسخ سالم باید JSON شامل `"ok": true` و `"service": "ravio-api"` باشد. پس از ثبت Secret، مقدار `"geminiConfigured": true` نیز باید دیده شود. اگر این مقدار `false` است، نام Secret، محیط Production و اجرای Deployment جدید را بررسی کنید.

سپس صفحه اصلی را باز کنید:

```text
https://ravio.pages.dev
```

اگر API در دسترس نیست، ابتدا وضعیت آخرین Deployment و Build log را در تب **Deployments** بررسی کنید؛ وضعیت ساخته‌شدن پروژه در Dashboard به‌تنهایی به معنی موفقیت Build و انتشار نسخه Production نیست.

### اتصال نسخه اندروید (Capacitor)

نسخه APK باید به دامنه Pages متصل شود، نه به آدرس محلی توسعه‌دهنده:

```text
https://ravio.pages.dev
```

- Workflow ساخت APK مقدار پیش‌فرض Backend را روی همین دامنه قرار می‌دهد.
- در GitHub وارد **Actions → Build Android APK (Ravio) → Run workflow** شوید.
- در صورت نیاز، ورودی `backend_url` را با آدرس سرور خود جایگزین کنید؛ در غیر این صورت مقدار پیش‌فرض را نگه دارید.
- پس از موفقیت Workflow، فایل `app-debug.apk` را از Artifact با نام `ravio-android-debug-apk` دریافت و نصب کنید.
- در صورت استفاده از آدرس دیگر، همان Base URL را در تنظیمات اتصال سرور داخل برنامه وارد کنید.

کلید Gemini در APK ذخیره نمی‌شود؛ درخواست‌های Gemini و RSS به API مستقرشده ارسال می‌شوند. اگر نسخه وب کار می‌کند اما APK به API دسترسی ندارد، مقدار Base URL و Originهای Capacitor در `ALLOWED_ORIGINS` را بررسی کنید.

### محدودیت‌های پلن رایگان و هزینه‌ها

- میزبانی Static و اجرای API روی Cloudflare با سهمیه و محدودیت‌های پلن Free انجام می‌شود؛ محدودیت درخواست، زمان CPU و حجم مصرفی Cloudflare پابرجاست.
- رایگان بودن Cloudflare به معنی رایگان بودن استفاده از Gemini API نیست. تولید متن و به‌ویژه TTS تابع سهمیه، محدودیت نرخ و تعرفه حساب Google AI است.
- در صورت دریافت خطای `429`، سهمیه یا محدودیت نرخ Gemini را بررسی کنید؛ خطای `503` در مسیر Gemini معمولاً به تنظیم‌نشدن `GEMINI_API_KEY` اشاره دارد.
- این معماری به سرویس پولی Render یا سرور Node.js دائمی نیاز ندارد؛ با این حال در پلن Free تضمین دسترس‌پذیری یا ظرفیت نامحدود وجود ندارد.

## فناوری‌های استفاده‌شده

| بخش | فناوری |
| :--- | :--- |
| **رابط کاربری (Frontend)** | React 19, TypeScript, Tailwind CSS v4, Lucide Icons |
| **سرویس وب و بیلد** | Vite 8, `vite-plugin-pwa` (Workbox Service Worker) |
| **سرور و پروکسی امن (Backend)** | Node.js, Express, `@google/genai` SDK |
| **ذخیره‌سازی محلی** | IndexedDB (فایل‌های WAV و پوشه خروجی) + `localStorage` |
| **خروجی موبایل** | Capacitor (`app.ravio.newsradio`) |

---

## استقرار رایگان روی Cloudflare Pages

راویو از یک معماری یکپارچه روی **Cloudflare Pages** استفاده می‌کند: رابط React/Vite به‌صورت فایل‌های Static منتشر می‌شود و درخواست‌های API از طریق Pages Functions به کد مشترک `cloudflare/worker.mjs` می‌رسند.

**آدرس Production پروژه:** [https://ravio.pages.dev](https://ravio.pages.dev)

### معماری و مسیرهای API
- `GET /api/health` — بررسی سلامت API و وضعیت تنظیم `GEMINI_API_KEY`
- `GET /api/rss?url=<RSS_URL>` — پروکسی امن RSS (با مسدودسازی SSRF، بررسی MIME/XML و سقف حجم ۲ مگابایت)
- `POST /api/gemini/script` — تبدیل خبرها به بولتن فارسی (با Fallback خودکار مدل در خطاهای `404`/`503`)
- `POST /api/gemini/tts` — تولید فایل صوتی WAV فارسی

### تنظیمات Cloudflare Pages
| گزینه | مقدار |
| :--- | :--- |
| **Build command** | `npm ci && npm run build` |
| **Build output directory** | `dist` |
| **Node.js version** | `22` (فایل `.nvmrc`) |
| **Compatibility Flag** | `nodejs_compat` (فایل `wrangler.toml`) |
| **`GEMINI_API_KEY`** | **Secret** (از Google AI Studio) |
| **`GEMINI_API_KEY_FALLBACK`** | **Secret** (اختیاری — کلید دوم Gemini برای فال‌بک خودکار در خطای `429`/`401`/`503`) |
| **`OPENROUTER_API_KEY`** | **Secret** (اختیاری — فال‌بک سمت سرور برای `/api/gemini/script` با مدل‌های OpenRouter) |
| **`OPENROUTER_FALLBACK_MODEL`** | Plain text (اختیاری — مثلاً `google/gemini-2.5-flash` یا `deepseek/deepseek-chat-v3-0324:free`) |
| **`ALLOWED_ORIGINS`** | `capacitor://localhost,https://localhost` |

*(متغیر `RAVIO_API_SECRET` در صورت نیاز به احراز هویت اختصاصی فعال می‌شود؛ بدون تنظیم آن، APK اندروید با `VITE_BACKEND_URL=https://ravio.pages.dev` مستقیم به سرور متصل می‌شود.)*

---

## نصب و راه‌اندازی محلی

### پیش‌نیازها
- **Node.js 22+** (بسته `@google/genai` نیازمند `node >= 22.0.0` است و سرور `server.ts` در حالت تولید به‌صورت بومی روی Node 22 اجرا می‌شود)
- **Java 21 (JDK 21 / Temurin)** برای ساخت بومی APK اندروید با Gradle و Capacitor
- کلید **Gemini API** (برای تولید متن و صدای هوشمند سمت سرور)

### مراحل اجرا

۱. کلون کردن مخزن:

```bash
git clone https://github.com/yusi20006-max/RAVIO.git
cd RAVIO
```

۲. نصب وابستگی‌ها (با استفاده از `package-lock.json` قفل‌شده):

```bash
npm ci
```

۳. تنظیم متغیرهای محیطی:
فایل `.env` را از روی `.env.example` بسازید:

| متغیر محیطی | کاربرد | اجباری؟ |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | کلید Gemini برای تولید اسکریپت رادیویی و صوت WAV سمت سرور | بله (در حالت سرور Gemini) |
| `APP_URL` | آدرس عمومی سرور مستقرشده (برای لینک‌ها و لیست مجاز CORS) | اختیاری |
| `VITE_BACKEND_URL` | آدرس سرور بک‌اند جهت ثبت پیش‌فرض هنگام بیلد APK مستقل | اختیاری |
| `RAVIO_API_SECRET` | کلید محرمانه اختیاری (`Bearer` / هدر `X-Ravio-Secret`) برای محدود کردن `/api/gemini/*` | اختیاری |
| `ALLOWED_ORIGINS` | دامنه‌های مجاز CORS با کاما (اورجین‌های Capacitor و دامنه خود سرور به‌صورت خودکار مجازند) | اختیاری |

۴. بررسی TypeScript و اجرای تست‌های خودکار:

```bash
npm run lint
npm test
```

۵. اجرای محیط توسعه (پورت `3000`):

```bash
npm run dev
```

۶. بیلد و اجرای نسخه نهایی (Production):

```bash
npm run build
npm start
```

---

## تنظیم ارائه‌دهنده‌های هوش مصنوعی و محدودیت‌های زمان‌بند

### انتخاب مدل و سرور هوش مصنوعی
* **Gemini متصل به سرور (پیشنهادی برای گوشی و APK):** کلید `GEMINI_API_KEY` تنها روی سرور نگهداری می‌شود و هیچ‌گاه در فایل خروجی Web یا APK قرار نمی‌گیرد. در نسخه اندروید می‌توانید آدرس سرور را در بخش **تنظیمات ← ۱. هوش مصنوعی، اتصال سرور و حالت آفلاین** وارد کنید.
* **OpenRouter و OpenAI سفارشی:** می‌توانید مستقیماً داخل تنظیمات برنامه `API Key` و برای سرویس سفارشی `Base URL` (مثلاً `https://api.openai.com/v1` یا سرور سازگار داخلی) و شناسه مدل را وارد کنید. هنگام دریافت خروجی JSON، کلیدهای API به‌صورت پیش‌فرض حذف می‌شوند مگر اینکه تیک گزینه اختیاری را بزنید.
* **حالت کاملاً آفلاین:** بدون نیاز به اینترنت و هیچ کلید API، خبرها به فرمت رادیویی تبدیل شده و با گوینده داخلی دستگاه خوانده می‌شوند.

### محدودیت زمان‌بند روزانه در پس‌زمینه
زمان‌بند روزانه زمانی که برنامه باز است، صفحه بیدار می‌شود (`visibilitychange` / `focus`) یا اینترنت دوباره متصل می‌گردد (`online`) وضعیت را بررسی می‌کند. در نسخه وب/PWA یا زمانی که سیستم‌عامل اندروید برنامه را در پس‌زمینه کاملاً ببندد، اجرای خودکار تا زمان بازشدن دوباره برنامه انجام نمی‌شود (اجرای قطعی هنگام بسته‌بودن کامل برنامه نیازمند سرویس بومی Android `WorkManager` / `AlarmManager` و مجوزهای مربوطه است).

---

## ساخت خروجی اندروید (APK) در گیت‌هاب و به‌صورت محلی

### روش ۱: ساخت خودکار APK از داخل گیت‌هاب (GitHub Actions)
ورک‌فلو `.github/workflows/build-apk.yml` روی **Node.js 22** و **Java 21** اجرا می‌شود و پیش از ساخت APK مراحل بررسی تایپ (`tsc --noEmit`)، `npm run lint`، تست‌های واحد (`npm test`) و بیلد وب را انجام می‌دهد:

1. در مخزن گیت‌هاب خود وارد تب **Actions** شوید.
2. گزینه **Build Android APK (Ravio)** را انتخاب کرده و روی **Run workflow** بزنید *(در صورت تمایل می‌توانید آدرس سرور `backend_url` را نیز در ورودی وارد کنید تا داخل APK ثبت شود)*.
3. پس از پایان اجرا، از بخش **Artifacts** در پایین صفحه، فایل **`ravio-android-debug-apk`** (`app-debug.apk`) را دانلود و روی گوشی یا اندروید تی‌وی نصب کنید.

### روش ۲: ساخت محلی با Capacitor و Android Studio

فایل `capacitor.config.ts` به‌صورت آماده با شناسه `app.ravio.newsradio` در پروژه قرار دارد:

```bash
npm install --no-save @capacitor/core @capacitor/cli @capacitor/android
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

سپس از داخل Android Studio خروجی Debug یا Release (پس از تنظیم امضای دیجیتال Keystore) را بسازید. در اپلیکیشن اندروید می‌توانید از بخش **تنظیمات ← هوش مصنوعی و سرور** آدرس سرور خودتان را وارد کنید تا بدون ذخیره کلید API روی گوشی، به Gemini و پروکسی RSS متصل شوید.

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
