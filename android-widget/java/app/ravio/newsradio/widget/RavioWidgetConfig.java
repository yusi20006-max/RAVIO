package app.ravio.newsradio.widget;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

public final class RavioWidgetConfig {
    public static final String DEFAULT_BACKEND_URL = "https://ravio.pages.dev";
    public static final String PREFS_NAME = "ravio_drive_widget_prefs";

    public static final String KEY_BACKEND_URL = "backend_url";
    public static final String KEY_SELECTED_CATEGORY = "selected_category";
    public static final String KEY_COMBINED_CATEGORIES = "combined_categories";
    public static final String KEY_GEMINI_VOICE = "gemini_voice";
    public static final String KEY_BROADCAST_TONE = "broadcast_tone";
    public static final String KEY_MAX_ITEMS = "max_news_items";
    public static final String KEY_FEEDS_JSON = "synced_feeds_json";
    public static final String KEY_WIDGET_STATE = "widget_state";
    public static final String KEY_WIDGET_STATUS = "widget_status";
    public static final String KEY_WIDGET_TITLE = "widget_title";
    public static final String KEY_LAST_SCRIPT = "last_script";
    public static final String KEY_HAS_CACHED_AUDIO = "has_cached_audio";

    public static final String CAT_COMBINED = "combined";
    public static final String CAT_IRAN = "iran";
    public static final String CAT_WORLD = "world";
    public static final String CAT_ECONOMY = "economy";
    public static final String CAT_TECH = "tech_ai";

    public static final String STATE_IDLE = "idle";
    public static final String STATE_FETCHING = "fetching";
    public static final String STATE_SCRIPTING = "scripting";
    public static final String STATE_TTS = "tts";
    public static final String STATE_PLAYING = "playing";
    public static final String STATE_PAUSED = "paused";
    public static final String STATE_ERROR = "error";

    private RavioWidgetConfig() {}

    public static final class FeedEntry {
        public final String label;
        public final String url;
        public final String category;

        public FeedEntry(String label, String url, String category) {
            this.label = label;
            this.url = url;
            this.category = category;
        }
    }

    public static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public static String getBackendUrl(Context context) {
        String saved = prefs(context).getString(KEY_BACKEND_URL, "");
        String clean = saved == null ? "" : saved.trim().replaceAll("/+$", "");
        if (!clean.isEmpty()) {
            if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
                return "https://" + clean;
            }
            return clean;
        }
        return DEFAULT_BACKEND_URL;
    }

    public static String getSelectedCategory(Context context) {
        String cat = prefs(context).getString(KEY_SELECTED_CATEGORY, CAT_COMBINED);
        if (CAT_IRAN.equals(cat) || CAT_WORLD.equals(cat) || CAT_ECONOMY.equals(cat) || CAT_TECH.equals(cat)) {
            return cat;
        }
        return CAT_COMBINED;
    }

    public static String getCategoryLabel(String cat) {
        if (CAT_IRAN.equals(cat)) return "اخبار ایران";
        if (CAT_WORLD.equals(cat)) return "اخبار جهان";
        if (CAT_ECONOMY.equals(cat)) return "اقتصاد و بازار";
        if (CAT_TECH.equals(cat)) return "فناوری و هوش مصنوعی";
        return "بولتن ترکیبی راویو";
    }

    public static String getShortCategoryLabel(String cat) {
        if (CAT_IRAN.equals(cat)) return "ایران";
        if (CAT_WORLD.equals(cat)) return "جهان";
        if (CAT_ECONOMY.equals(cat)) return "اقتصاد";
        if (CAT_TECH.equals(cat)) return "فناوری";
        return "ترکیبی";
    }

    public static List<String> getCombinedCategories(Context context) {
        List<String> result = new ArrayList<>();
        String raw = prefs(context).getString(KEY_COMBINED_CATEGORIES, "[\"iran\",\"tech_ai\",\"economy\"]");
        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                String c = arr.optString(i, "").trim();
                if (!c.isEmpty() && !result.contains(c)) {
                    result.add(c);
                }
            }
        } catch (Exception ignored) {
        }
        if (result.isEmpty()) {
            result.add(CAT_IRAN);
            result.add(CAT_TECH);
            result.add(CAT_ECONOMY);
        }
        return result;
    }

    public static Map<String, List<FeedEntry>> getFeedsByCategory(Context context, List<String> targetCategories) {
        Map<String, List<FeedEntry>> grouped = new LinkedHashMap<>();
        for (String cat : targetCategories) {
            grouped.put(cat, new ArrayList<FeedEntry>());
        }

        String syncedRaw = prefs(context).getString(KEY_FEEDS_JSON, "");
        if (syncedRaw != null && !syncedRaw.trim().isEmpty()) {
            try {
                JSONArray arr = new JSONArray(syncedRaw);
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject obj = arr.optJSONObject(i);
                    if (obj == null || !obj.optBoolean("enabled", true)) continue;
                    String cat = obj.optString("category", "").trim();
                    String url = obj.optString("url", "").trim();
                    String label = obj.optString("label", "خبرگزاری").trim();
                    if (grouped.containsKey(cat) && !url.isEmpty()) {
                        grouped.get(cat).add(new FeedEntry(label, url, cat));
                    }
                }
            } catch (Exception ignored) {
            }
        }

        for (String cat : targetCategories) {
            if (grouped.get(cat).isEmpty()) {
                grouped.get(cat).addAll(getDefaultFeeds(cat));
            }
        }
        return grouped;
    }

    private static List<FeedEntry> getDefaultFeeds(String category) {
        List<FeedEntry> list = new ArrayList<>();
        if (CAT_IRAN.equals(category)) {
            list.add(new FeedEntry("BBC فارسی", "https://feeds.bbci.co.uk/persian/rss.xml", CAT_IRAN));
            list.add(new FeedEntry("گوگل نیوز ایران", "https://news.google.com/rss/search?q=%D8%A7%DB%8C%D8%B1%D8%A7%D9%86&hl=fa&gl=IR&ceid=IR:fa", CAT_IRAN));
            list.add(new FeedEntry("خبرگزاری ایسنا", "https://www.isna.ir/rss", CAT_IRAN));
        } else if (CAT_WORLD.equals(category)) {
            list.add(new FeedEntry("گوگل نیوز جهان (فارسی)", "https://news.google.com/rss/search?q=%D8%A7%D8%AE%D8%A8%D8%A7%D8%B1+%D8%AC%D9%87%D8%A7%D9%86&hl=fa&gl=IR&ceid=IR:fa", CAT_WORLD));
            list.add(new FeedEntry("Google News World", "https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en", CAT_WORLD));
        } else if (CAT_ECONOMY.equals(category)) {
            list.add(new FeedEntry("گوگل نیوز اقتصاد (فارسی)", "https://news.google.com/rss/search?q=%D8%A7%D9%82%D8%AA%D8%B5%D8%A7%D8%AF+OR+%D8%A8%D9%88%D8%B1%D8%B3&hl=fa&gl=IR&ceid=IR:fa", CAT_ECONOMY));
            list.add(new FeedEntry("Google News Business", "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en", CAT_ECONOMY));
        } else if (CAT_TECH.equals(category)) {
            list.add(new FeedEntry("زومیت", "https://www.zoomit.ir/feed/", CAT_TECH));
            list.add(new FeedEntry("گوگل نیوز فناوری (فارسی)", "https://news.google.com/rss/search?q=%D9%87%D9%88%D8%B4+%D9%85%D8%B5%D9%86%D9%88%D8%B9%DB%8C+OR+%D9%81%D9%86%D8%A7%D9%88%D8%B1%DB%8C&hl=fa&gl=IR&ceid=IR:fa", CAT_TECH));
            list.add(new FeedEntry("Google News Tech", "https://news.google.com/rss/search?q=Technology+OR+AI+OR+OpenAI+OR+Google&hl=en-US&gl=US&ceid=US:en", CAT_TECH));
        }
        return list;
    }

    public static void saveUiState(Context context, String state, String statusText, String headline) {
        SharedPreferences.Editor ed = prefs(context).edit();
        ed.putString(KEY_WIDGET_STATE, state);
        if (statusText != null) {
            ed.putString(KEY_WIDGET_STATUS, statusText);
        }
        if (headline != null) {
            ed.putString(KEY_WIDGET_TITLE, headline);
        }
        ed.apply();
    }
}
