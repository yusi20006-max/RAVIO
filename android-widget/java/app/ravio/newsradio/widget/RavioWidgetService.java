package app.ravio.newsradio.widget;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.MediaPlayer;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Base64;
import android.util.Xml;
import app.ravio.newsradio.MainActivity;
import app.ravio.newsradio.R;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.StringReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONArray;
import org.json.JSONObject;
import org.xmlpull.v1.XmlPullParser;

public class RavioWidgetService extends Service {
    public static final String ACTION_BUILD_AND_PLAY = "app.ravio.newsradio.widget.SERVICE_BUILD_AND_PLAY";
    public static final String ACTION_TOGGLE_PLAY = "app.ravio.newsradio.widget.SERVICE_TOGGLE_PLAY";
    public static final String ACTION_STOP = "app.ravio.newsradio.widget.SERVICE_STOP";

    private static final String CHANNEL_ID = "ravio_widget_playback";
    private static final int NOTIFICATION_ID = 4041;
    private static final String WAV_CACHE_NAME = "ravio_widget_last.wav";

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicInteger generationSeq = new AtomicInteger(0);

    private MediaSession mediaSession;
    private MediaPlayer mediaPlayer;
    private TextToSpeech androidTts;
    private boolean androidTtsReady = false;
    private boolean isTtsSpeaking = false;
    private boolean pausedByAudioFocus = false;
    private boolean noisyReceiverRegistered = false;

    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private PowerManager.WakeLock wakeLock;

    private static final class RawNewsItem {
        final String id;
        final String title;
        final String description;
        final String source;
        final String link;
        final String pubDate;

        RawNewsItem(String id, String title, String description, String source, String link, String pubDate) {
            this.id = id;
            this.title = title;
            this.description = description;
            this.source = source;
            this.link = link;
            this.pubDate = pubDate;
        }
    }

    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                pauseAllPlayback();
            }
        }
    };

    private final AudioManager.OnAudioFocusChangeListener focusListener = new AudioManager.OnAudioFocusChangeListener() {
        @Override
        public void onAudioFocusChange(int focusChange) {
            if (focusChange == AudioManager.AUDIOFOCUS_LOSS) {
                pausedByAudioFocus = false;
                pauseAllPlayback();
            } else if (focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT
                    || focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
                if (isCurrentlyPlaying()) {
                    pausedByAudioFocus = true;
                    pauseAllPlayback();
                }
            } else if (focusChange == AudioManager.AUDIOFOCUS_GAIN && pausedByAudioFocus) {
                pausedByAudioFocus = false;
                resumeExistingPlayback();
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        ensureChannel();
        initMediaSession();
        initWakeLock();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String currentHeadline = RavioWidgetConfig.prefs(this)
                .getString(RavioWidgetConfig.KEY_WIDGET_TITLE, "راویو · رادیوی رانندگی");
        String currentStatus = RavioWidgetConfig.prefs(this)
                .getString(RavioWidgetConfig.KEY_WIDGET_STATUS, "آماده");
        startForegroundCompat(buildNotification(currentStatus, currentHeadline, isCurrentlyPlaying()));

        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) {
            generationSeq.incrementAndGet();
            stopAllPlayback();
            updateWidgetAndNotification(
                    RavioWidgetConfig.STATE_IDLE,
                    "متوقف شد",
                    currentHeadline,
                    false
            );
            stopForegroundCompat(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        if (ACTION_TOGGLE_PLAY.equals(action)) {
            handleTogglePlay();
            return START_NOT_STICKY;
        }

        String requestedCategory = intent != null
                ? intent.getStringExtra(RavioDriveWidgetProvider.EXTRA_CATEGORY)
                : null;
        if (requestedCategory == null || requestedCategory.isEmpty()) {
            requestedCategory = RavioWidgetConfig.getSelectedCategory(this);
        }
        startBuildAndPlay(requestedCategory);
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        generationSeq.incrementAndGet();
        stopAllPlayback();
        releaseWakeLock();
        if (androidTts != null) {
            try {
                androidTts.shutdown();
            } catch (Exception ignored) {
            }
            androidTts = null;
        }
        if (mediaSession != null) {
            try {
                mediaSession.setActive(false);
                mediaSession.release();
            } catch (Exception ignored) {
            }
            mediaSession = null;
        }
        executor.shutdownNow();
        super.onDestroy();
    }

    private void initMediaSession() {
        mediaSession = new MediaSession(this, "RavioDriveSession");
        mediaSession.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                resumeExistingPlayback();
            }

            @Override
            public void onPause() {
                pauseAllPlayback();
            }

            @Override
            public void onStop() {
                stopAllPlayback();
                String headline = RavioWidgetConfig.prefs(RavioWidgetService.this)
                        .getString(RavioWidgetConfig.KEY_WIDGET_TITLE, "راویو");
                updateWidgetAndNotification(RavioWidgetConfig.STATE_IDLE, "آماده", headline, false);
            }
        });
        mediaSession.setActive(true);
    }

    private void initWakeLock() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Ravio:DriveWidgetLock");
            wakeLock.setReferenceCounted(false);
        }
    }

    private void acquireWakeLock() {
        try {
            if (wakeLock != null && !wakeLock.isHeld()) {
                wakeLock.acquire(10 * 60 * 1000L);
            }
        } catch (Exception ignored) {
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        } catch (Exception ignored) {
        }
    }

    private void startBuildAndPlay(final String categoryId) {
        final int taskSeq = generationSeq.incrementAndGet();
        stopAllPlayback();
        acquireWakeLock();

        final String categoryLabel = RavioWidgetConfig.getCategoryLabel(categoryId);
        updateWidgetAndNotification(
                RavioWidgetConfig.STATE_FETCHING,
                "دریافت خبر...",
                "در حال دریافت فیدهای «" + RavioWidgetConfig.getShortCategoryLabel(categoryId) + "»",
                false
        );

        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    String backendUrl = RavioWidgetConfig.getBackendUrl(RavioWidgetService.this);
                    List<RawNewsItem> items = fetchCategoryOrCombinedItems(categoryId, backendUrl);
                    if (taskSeq != generationSeq.get()) return;
                    if (items.isEmpty()) {
                        throw new IllegalStateException("خبری از منابع دریافت نشد.");
                    }

                    updateWidgetAndNotification(
                            RavioWidgetConfig.STATE_SCRIPTING,
                            "نگارش خبر...",
                            "در حال تهیه بولتن «" + RavioWidgetConfig.getShortCategoryLabel(categoryId) + "»",
                            false
                    );

                    SharedPreferences prefs = RavioWidgetConfig.prefs(RavioWidgetService.this);
                    String tone = prefs.getString(RavioWidgetConfig.KEY_BROADCAST_TONE, "morning_host");
                    String voice = prefs.getString(RavioWidgetConfig.KEY_GEMINI_VOICE, "Kore");

                    JSONObject scriptResult = requestScript(backendUrl, items, categoryLabel, tone);
                    if (taskSeq != generationSeq.get()) return;

                    final String broadcastTitle = scriptResult.optString("broadcastTitle", categoryLabel);
                    final String script = scriptResult.optString("script", "").trim();
                    if (script.isEmpty()) {
                        throw new IllegalStateException("متن بولتن خالی بود.");
                    }

                    prefs.edit()
                            .putString(RavioWidgetConfig.KEY_LAST_SCRIPT, script)
                            .putString(RavioWidgetConfig.KEY_WIDGET_TITLE, broadcastTitle)
                            .apply();

                    updateWidgetAndNotification(
                            RavioWidgetConfig.STATE_TTS,
                            "ساخت صدا...",
                            broadcastTitle,
                            false
                    );

                    try {
                        byte[] wavBytes = requestTtsWav(backendUrl, script, voice);
                        if (taskSeq != generationSeq.get()) return;
                        File wavFile = new File(getCacheDir(), WAV_CACHE_NAME);
                        FileOutputStream fos = new FileOutputStream(wavFile);
                        try {
                            fos.write(wavBytes);
                        } finally {
                            fos.close();
                        }
                        prefs.edit().putBoolean(RavioWidgetConfig.KEY_HAS_CACHED_AUDIO, true).apply();
                        mainHandler.post(new Runnable() {
                            @Override
                            public void run() {
                                if (taskSeq == generationSeq.get()) {
                                    playWavFile(wavFile, broadcastTitle, categoryLabel);
                                }
                            }
                        });
                    } catch (final Exception ttsErr) {
                        if (taskSeq != generationSeq.get()) return;
                        // Fallback to built-in Android Persian TTS so driving audio still plays
                        prefs.edit().putBoolean(RavioWidgetConfig.KEY_HAS_CACHED_AUDIO, false).apply();
                        mainHandler.post(new Runnable() {
                            @Override
                            public void run() {
                                if (taskSeq == generationSeq.get()) {
                                    speakWithAndroidTts(script, broadcastTitle, categoryLabel);
                                }
                            }
                        });
                    }
                } catch (final Exception err) {
                    if (taskSeq != generationSeq.get()) return;
                    releaseWakeLock();
                    String shortErr = sanitizeShortError(err.getMessage());
                    updateWidgetAndNotification(
                            RavioWidgetConfig.STATE_ERROR,
                            "خطا",
                            shortErr,
                            false
                    );
                }
            }
        });
    }

    private void handleTogglePlay() {
        if (isCurrentlyPlaying()) {
            pauseAllPlayback();
            return;
        }
        resumeExistingPlayback();
    }

    private void resumeExistingPlayback() {
        if (mediaPlayer != null) {
            if (!requestAudioFocus()) return;
            registerNoisyReceiver();
            mediaPlayer.start();
            String headline = RavioWidgetConfig.prefs(this)
                    .getString(RavioWidgetConfig.KEY_WIDGET_TITLE, "راویو");
            String catLabel = RavioWidgetConfig.getCategoryLabel(RavioWidgetConfig.getSelectedCategory(this));
            updateMediaSessionState(PlaybackState.STATE_PLAYING, headline, catLabel);
            updateWidgetAndNotification(RavioWidgetConfig.STATE_PLAYING, "در حال پخش", headline, true);
            return;
        }

        File wavFile = new File(getCacheDir(), WAV_CACHE_NAME);
        SharedPreferences prefs = RavioWidgetConfig.prefs(this);
        boolean hasWav = prefs.getBoolean(RavioWidgetConfig.KEY_HAS_CACHED_AUDIO, false) && wavFile.exists() && wavFile.length() > 44;
        String headline = prefs.getString(RavioWidgetConfig.KEY_WIDGET_TITLE, "بخش خبری راویو");
        String catLabel = RavioWidgetConfig.getCategoryLabel(RavioWidgetConfig.getSelectedCategory(this));

        if (hasWav) {
            playWavFile(wavFile, headline, catLabel);
            return;
        }

        String lastScript = prefs.getString(RavioWidgetConfig.KEY_LAST_SCRIPT, "");
        if (lastScript != null && !lastScript.trim().isEmpty()) {
            speakWithAndroidTts(lastScript, headline, catLabel);
            return;
        }

        startBuildAndPlay(RavioWidgetConfig.getSelectedCategory(this));
    }

    private void pauseAllPlayback() {
        boolean changed = false;
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) {
                    mediaPlayer.pause();
                    changed = true;
                }
            } catch (Exception ignored) {
            }
        }
        if (isTtsSpeaking && androidTts != null) {
            try {
                androidTts.stop();
            } catch (Exception ignored) {
            }
            isTtsSpeaking = false;
            changed = true;
        }
        unregisterNoisyReceiver();
        abandonAudioFocus();
        releaseWakeLock();

        if (changed) {
            String headline = RavioWidgetConfig.prefs(this)
                    .getString(RavioWidgetConfig.KEY_WIDGET_TITLE, "راویو");
            String catLabel = RavioWidgetConfig.getCategoryLabel(RavioWidgetConfig.getSelectedCategory(this));
            updateMediaSessionState(PlaybackState.STATE_PAUSED, headline, catLabel);
            updateWidgetAndNotification(RavioWidgetConfig.STATE_PAUSED, "متوقف شده", headline, false);
        }
    }

    private void stopAllPlayback() {
        pausedByAudioFocus = false;
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) mediaPlayer.stop();
            } catch (Exception ignored) {
            }
            try {
                mediaPlayer.release();
            } catch (Exception ignored) {
            }
            mediaPlayer = null;
        }
        if (isTtsSpeaking && androidTts != null) {
            try {
                androidTts.stop();
            } catch (Exception ignored) {
            }
        }
        isTtsSpeaking = false;
        unregisterNoisyReceiver();
        abandonAudioFocus();
    }

    private boolean isCurrentlyPlaying() {
        if (isTtsSpeaking) return true;
        try {
            return mediaPlayer != null && mediaPlayer.isPlaying();
        } catch (Exception e) {
            return false;
        }
    }

    private void playWavFile(final File wavFile, final String title, final String categoryLabel) {
        stopAllPlayback();
        if (!requestAudioFocus()) {
            releaseWakeLock();
            updateWidgetAndNotification(RavioWidgetConfig.STATE_PAUSED, "آماده پخش", title, false);
            return;
        }
        try {
            mediaPlayer = new MediaPlayer();
            mediaPlayer.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build());
            mediaPlayer.setDataSource(wavFile.getAbsolutePath());
            mediaPlayer.setOnPreparedListener(new MediaPlayer.OnPreparedListener() {
                @Override
                public void onPrepared(MediaPlayer mp) {
                    registerNoisyReceiver();
                    mp.start();
                    releaseWakeLock();
                    updateMediaSessionState(PlaybackState.STATE_PLAYING, title, categoryLabel);
                    updateWidgetAndNotification(RavioWidgetConfig.STATE_PLAYING, "در حال پخش", title, true);
                }
            });
            mediaPlayer.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                @Override
                public void onCompletion(MediaPlayer mp) {
                    unregisterNoisyReceiver();
                    abandonAudioFocus();
                    try {
                        mp.seekTo(0);
                    } catch (Exception ignored) {
                    }
                    updateMediaSessionState(PlaybackState.STATE_PAUSED, title, categoryLabel);
                    updateWidgetAndNotification(RavioWidgetConfig.STATE_PAUSED, "پایان پخش", title, false);
                }
            });
            mediaPlayer.setOnErrorListener(new MediaPlayer.OnErrorListener() {
                @Override
                public boolean onError(MediaPlayer mp, int what, int extra) {
                    stopAllPlayback();
                    releaseWakeLock();
                    updateWidgetAndNotification(RavioWidgetConfig.STATE_ERROR, "خطای پخش", title, false);
                    return true;
                }
            });
            mediaPlayer.prepareAsync();
        } catch (Exception err) {
            stopAllPlayback();
            releaseWakeLock();
            updateWidgetAndNotification(RavioWidgetConfig.STATE_ERROR, "خطای پخش", sanitizeShortError(err.getMessage()), false);
        }
    }

    private void speakWithAndroidTts(final String script, final String title, final String categoryLabel) {
        stopAllPlayback();
        if (!requestAudioFocus()) {
            releaseWakeLock();
            return;
        }
        final Runnable speakTask = new Runnable() {
            @Override
            public void run() {
                if (androidTts == null) return;
                Locale fa = new Locale("fa", "IR");
                int avail = androidTts.isLanguageAvailable(fa);
                if (avail >= TextToSpeech.LANG_AVAILABLE) {
                    androidTts.setLanguage(fa);
                }
                androidTts.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build());
                androidTts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override
                    public void onStart(String utteranceId) {
                        mainHandler.post(new Runnable() {
                            @Override
                            public void run() {
                                isTtsSpeaking = true;
                                releaseWakeLock();
                                registerNoisyReceiver();
                                updateMediaSessionState(PlaybackState.STATE_PLAYING, title, categoryLabel);
                                updateWidgetAndNotification(RavioWidgetConfig.STATE_PLAYING, "گوینده گوشی", title, true);
                            }
                        });
                    }

                    @Override
                    public void onDone(String utteranceId) {
                        mainHandler.post(new Runnable() {
                            @Override
                            public void run() {
                                isTtsSpeaking = false;
                                unregisterNoisyReceiver();
                                abandonAudioFocus();
                                updateMediaSessionState(PlaybackState.STATE_PAUSED, title, categoryLabel);
                                updateWidgetAndNotification(RavioWidgetConfig.STATE_PAUSED, "پایان پخش", title, false);
                            }
                        });
                    }

                    @Override
                    public void onError(String utteranceId) {
                        mainHandler.post(new Runnable() {
                            @Override
                            public void run() {
                                isTtsSpeaking = false;
                                releaseWakeLock();
                                unregisterNoisyReceiver();
                                abandonAudioFocus();
                                updateWidgetAndNotification(RavioWidgetConfig.STATE_ERROR, "خطای گوینده", title, false);
                            }
                        });
                    }
                });
                String speakText = script.length() > 3800 ? script.substring(0, 3800) : script;
                isTtsSpeaking = true;
                androidTts.speak(speakText, TextToSpeech.QUEUE_FLUSH, null, "ravio_widget_utt");
            }
        };

        if (androidTts != null && androidTtsReady) {
            speakTask.run();
            return;
        }
        androidTts = new TextToSpeech(getApplicationContext(), new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                if (status == TextToSpeech.SUCCESS) {
                    androidTtsReady = true;
                    speakTask.run();
                } else {
                    releaseWakeLock();
                    updateWidgetAndNotification(RavioWidgetConfig.STATE_ERROR, "خطای صوتی", "گوینده دستگاه در دسترس نیست", false);
                }
            }
        });
    }

    private List<RawNewsItem> fetchCategoryOrCombinedItems(String categoryId, String backendUrl) throws Exception {
        SharedPreferences prefs = RavioWidgetConfig.prefs(this);
        int maxItems = Math.max(3, Math.min(12, prefs.getInt(RavioWidgetConfig.KEY_MAX_ITEMS, 6)));

        List<String> targetCategories = new ArrayList<>();
        if (RavioWidgetConfig.CAT_COMBINED.equals(categoryId)) {
            targetCategories.addAll(RavioWidgetConfig.getCombinedCategories(this));
        } else {
            targetCategories.add(categoryId);
        }

        Map<String, List<RavioWidgetConfig.FeedEntry>> groupedFeeds =
                RavioWidgetConfig.getFeedsByCategory(this, targetCategories);

        List<List<RawNewsItem>> perCategoryItems = new ArrayList<>();
        Set<String> seenTitles = new LinkedHashSet<>();

        for (String cat : targetCategories) {
            List<RavioWidgetConfig.FeedEntry> feeds = groupedFeeds.get(cat);
            List<RawNewsItem> catItems = new ArrayList<>();
            if (feeds != null) {
                for (RavioWidgetConfig.FeedEntry feed : feeds) {
                    try {
                        String proxyUrl = backendUrl + "/api/rss?url=" + URLEncoder.encode(feed.url, "UTF-8");
                        String xml = httpGetText(proxyUrl, 12000);
                        List<RawNewsItem> parsed = parseRssOrAtom(xml, feed.label, cat);
                        for (RawNewsItem item : parsed) {
                            String key = item.title.toLowerCase(Locale.ROOT);
                            if (key.length() > 60) key = key.substring(0, 60);
                            if (seenTitles.add(key)) {
                                catItems.add(item);
                            }
                        }
                        if (catItems.size() >= maxItems) break;
                    } catch (Exception ignored) {
                    }
                }
            }
            if (!catItems.isEmpty()) {
                perCategoryItems.add(catItems);
            }
        }

        List<RawNewsItem> selected = new ArrayList<>();
        int round = 0;
        while (selected.size() < maxItems) {
            boolean added = false;
            for (List<RawNewsItem> bucket : perCategoryItems) {
                if (round < bucket.size() && selected.size() < maxItems) {
                    selected.add(bucket.get(round));
                    added = true;
                }
            }
            if (!added) break;
            round++;
        }
        return selected;
    }

    private static List<RawNewsItem> parseRssOrAtom(String xmlText, String fallbackSource, String category) {
        List<RawNewsItem> list = new ArrayList<>();
        if (xmlText == null || xmlText.trim().isEmpty()) return list;
        try {
            XmlPullParser parser = Xml.newPullParser();
            parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false);
            parser.setInput(new StringReader(xmlText));

            boolean inEntry = false;
            String title = "";
            String desc = "";
            String link = "";
            String pubDate = "";
            String source = fallbackSource;
            int idx = 0;

            int event = parser.getEventType();
            while (event != XmlPullParser.END_DOCUMENT) {
                String tag = parser.getName();
                if (event == XmlPullParser.START_TAG) {
                    if ("item".equalsIgnoreCase(tag) || "entry".equalsIgnoreCase(tag)) {
                        inEntry = true;
                        title = "";
                        desc = "";
                        link = "";
                        pubDate = "";
                        source = fallbackSource;
                    } else if (inEntry) {
                        if ("title".equalsIgnoreCase(tag)) {
                            title = stripHtml(safeNextText(parser));
                        } else if ("description".equalsIgnoreCase(tag)
                                || "summary".equalsIgnoreCase(tag)
                                || "content".equalsIgnoreCase(tag)) {
                            String raw = stripHtml(safeNextText(parser));
                            if (desc.isEmpty() && !raw.isEmpty()) {
                                desc = raw.length() > 360 ? raw.substring(0, 360) : raw;
                            }
                        } else if ("link".equalsIgnoreCase(tag)) {
                            String href = parser.getAttributeValue(null, "href");
                            String text = safeNextText(parser).trim();
                            link = (href != null && !href.isEmpty()) ? href : text;
                        } else if ("pubDate".equalsIgnoreCase(tag)
                                || "updated".equalsIgnoreCase(tag)
                                || "published".equalsIgnoreCase(tag)) {
                            pubDate = safeNextText(parser).trim();
                        } else if ("source".equalsIgnoreCase(tag)) {
                            String s = stripHtml(safeNextText(parser));
                            if (!s.isEmpty()) source = s;
                        }
                    }
                } else if (event == XmlPullParser.END_TAG) {
                    if (inEntry && ("item".equalsIgnoreCase(tag) || "entry".equalsIgnoreCase(tag))) {
                        inEntry = false;
                        if (!title.isEmpty()) {
                            idx++;
                            list.add(new RawNewsItem(
                                    "w-" + category + "-" + idx,
                                    title,
                                    desc,
                                    source,
                                    link,
                                    pubDate
                            ));
                            if (list.size() >= 10) break;
                        }
                    }
                }
                event = parser.next();
            }
        } catch (Exception ignored) {
        }
        return list;
    }

    private static String safeNextText(XmlPullParser parser) {
        try {
            return parser.nextText();
        } catch (Exception e) {
            return "";
        }
    }

    private static String stripHtml(String raw) {
        if (raw == null) return "";
        return raw.replaceAll("<[^>]*>", " ")
                .replace("&nbsp;", " ")
                .replace("&amp;", "&")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private JSONObject requestScript(
            String backendUrl,
            List<RawNewsItem> items,
            String categoryLabel,
            String tone
    ) throws Exception {
        JSONArray arr = new JSONArray();
        for (RawNewsItem it : items) {
            JSONObject obj = new JSONObject();
            obj.put("id", it.id);
            obj.put("title", it.title);
            obj.put("description", it.description);
            obj.put("source", it.source);
            obj.put("link", it.link);
            obj.put("pubDate", it.pubDate);
            arr.put(obj);
        }
        JSONObject body = new JSONObject();
        body.put("items", arr);
        body.put("categoryLabel", categoryLabel);
        body.put("tone", tone);
        body.put("model", "gemini-2.5-flash");

        String responseText = httpPostJson(backendUrl + "/api/gemini/script", body.toString(), 65000);
        return new JSONObject(responseText);
    }

    private byte[] requestTtsWav(String backendUrl, String scriptText, String voiceName) throws Exception {
        JSONObject body = new JSONObject();
        String bounded = scriptText.length() > 11000 ? scriptText.substring(0, 11000) : scriptText;
        body.put("text", bounded);
        body.put("voiceName", voiceName);
        body.put("model", "gemini-2.5-flash-preview-tts");

        String responseText = httpPostJson(backendUrl + "/api/gemini/tts", body.toString(), 95000);
        JSONObject json = new JSONObject(responseText);
        String base64 = json.optString("audioBase64", "");
        if (base64.isEmpty()) {
            throw new IllegalStateException("پاسخ صوتی از سرور خالی بود.");
        }
        return Base64.decode(base64, Base64.DEFAULT);
    }

    private static String httpGetText(String urlStr, int timeoutMs) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(timeoutMs);
        conn.setReadTimeout(timeoutMs);
        conn.setRequestProperty("Accept", "application/xml, application/rss+xml, text/xml, */*");
        return readHttpResponse(conn);
    }

    private static String httpPostJson(String urlStr, String jsonBody, int timeoutMs) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setRequestMethod("POST");
        conn.setDoOutput(true);
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(timeoutMs);
        conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        conn.setRequestProperty("Accept", "application/json");
        byte[] payload = jsonBody.getBytes(StandardCharsets.UTF_8);
        OutputStream os = conn.getOutputStream();
        try {
            os.write(payload);
            os.flush();
        } finally {
            os.close();
        }
        return readHttpResponse(conn);
    }

    private static String readHttpResponse(HttpURLConnection conn) throws Exception {
        try {
            int code = conn.getResponseCode();
            InputStream stream = code >= 200 && code < 300 ? conn.getInputStream() : conn.getErrorStream();
            String body = "";
            if (stream != null) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8));
                try {
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        sb.append(line).append('\n');
                    }
                    body = sb.toString();
                } finally {
                    reader.close();
                }
            }
            if (code < 200 || code >= 300) {
                String msg = "خطای سرور (" + code + ")";
                try {
                    JSONObject errJson = new JSONObject(body);
                    String serverErr = errJson.optString("error", "").trim();
                    if (!serverErr.isEmpty()) msg = serverErr;
                } catch (Exception ignored) {
                }
                throw new IllegalStateException(msg);
            }
            return body;
        } finally {
            conn.disconnect();
        }
    }

    private static String sanitizeShortError(String raw) {
        if (raw == null || raw.trim().isEmpty()) {
            return "خطا در ارتباط با سرور یا اینترنت";
        }
        String clean = raw.trim();
        return clean.length() > 75 ? clean.substring(0, 72) + "..." : clean;
    }

    private boolean requestAudioFocus() {
        if (audioManager == null) return true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (audioFocusRequest == null) {
                audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                        .setAudioAttributes(new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_MEDIA)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                                .build())
                        .setAcceptsDelayedFocusGain(true)
                        .setOnAudioFocusChangeListener(focusListener)
                        .build();
            }
            return audioManager.requestAudioFocus(audioFocusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        }
        return audioManager.requestAudioFocus(
                focusListener,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN
        ) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    private void abandonAudioFocus() {
        if (audioManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (audioFocusRequest != null) {
                audioManager.abandonAudioFocusRequest(audioFocusRequest);
            }
        } else {
            audioManager.abandonAudioFocus(focusListener);
        }
    }

    private void registerNoisyReceiver() {
        if (noisyReceiverRegistered) return;
        IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(noisyReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(noisyReceiver, filter);
        }
        noisyReceiverRegistered = true;
    }

    private void unregisterNoisyReceiver() {
        if (!noisyReceiverRegistered) return;
        try {
            unregisterReceiver(noisyReceiver);
        } catch (Exception ignored) {
        }
        noisyReceiverRegistered = false;
    }

    private void updateMediaSessionState(int state, String title, String artist) {
        if (mediaSession == null) return;
        mediaSession.setMetadata(new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, "راویو · " + artist)
                .build());
        mediaSession.setPlaybackState(new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP)
                .setState(state, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1.0f)
                .build());
    }

    private void updateWidgetAndNotification(
            final String state,
            final String statusText,
            final String headline,
            final boolean isPlaying
    ) {
        RavioWidgetConfig.saveUiState(this, state, statusText, headline);
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                RavioDriveWidgetProvider.refreshAllWidgets(RavioWidgetService.this);
                try {
                    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null) {
                        nm.notify(NOTIFICATION_ID, buildNotification(statusText, headline, isPlaying));
                    }
                } catch (SecurityException ignored) {
                }
            }
        });
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                NotificationChannel ch = new NotificationChannel(
                        CHANNEL_ID,
                        "پخش رادیوی رانندگی راویو",
                        NotificationManager.IMPORTANCE_LOW
                );
                ch.setShowBadge(false);
                nm.createNotificationChannel(ch);
            }
        }
    }

    private void startForegroundCompat(Notification notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void stopForegroundCompat(boolean removeNotification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(removeNotification ? STOP_FOREGROUND_REMOVE : STOP_FOREGROUND_DETACH);
        } else {
            stopForeground(removeNotification);
        }
    }

    private Notification buildNotification(String statusText, String headline, boolean isPlaying) {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentPi = PendingIntent.getActivity(
                this,
                400,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent toggleIntent = new Intent(this, RavioWidgetService.class);
        toggleIntent.setAction(ACTION_TOGGLE_PLAY);
        PendingIntent togglePi = PendingIntent.getService(
                this,
                401,
                toggleIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent stopIntent = new Intent(this, RavioWidgetService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(
                this,
                402,
                stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);

        builder.setSmallIcon(R.drawable.ic_ravio_stat_radio)
                .setContentTitle(headline != null && !headline.isEmpty() ? headline : "راویو · رادیوی رانندگی")
                .setContentText(statusText != null ? statusText : "آماده")
                .setContentIntent(contentPi)
                .setOngoing(isPlaying)
                .setOnlyAlertOnce(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            builder.addAction(new Notification.Action.Builder(
                    Icon.createWithResource(this, R.drawable.ic_ravio_stat_radio),
                    isPlaying ? "توقف" : "پخش",
                    togglePi
            ).build());
            builder.addAction(new Notification.Action.Builder(
                    Icon.createWithResource(this, R.drawable.ic_ravio_stat_radio),
                    "بستن",
                    stopPi
            ).build());
        }

        if (mediaSession != null) {
            Notification.MediaStyle style = new Notification.MediaStyle()
                    .setMediaSession(mediaSession.getSessionToken());
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                style.setShowActionsInCompactView(0, 1);
            }
            builder.setStyle(style);
        }

        return builder.build();
    }
}
