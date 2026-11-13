package app.ravio.newsradio.widget;

import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "RavioWidget")
public class RavioWidgetPlugin extends Plugin {
    @PluginMethod
    public void syncConfig(PluginCall call) {
        SharedPreferences.Editor editor = RavioWidgetConfig.prefs(getContext()).edit();

        if (call.hasOption("backendServerUrl")) {
            String backend = call.getString("backendServerUrl", "");
            editor.putString(RavioWidgetConfig.KEY_BACKEND_URL, backend == null ? "" : backend.trim());
        }
        if (call.hasOption("activeCategory")) {
            String category = call.getString("activeCategory", RavioWidgetConfig.CAT_COMBINED);
            editor.putString(RavioWidgetConfig.KEY_SELECTED_CATEGORY, category);
        }
        if (call.hasOption("combinedCategoriesJson")) {
            editor.putString(RavioWidgetConfig.KEY_COMBINED_CATEGORIES, call.getString("combinedCategoriesJson", "[]"));
        }
        if (call.hasOption("geminiVoice")) {
            editor.putString(RavioWidgetConfig.KEY_GEMINI_VOICE, call.getString("geminiVoice", "Kore"));
        }
        if (call.hasOption("broadcastTone")) {
            editor.putString(RavioWidgetConfig.KEY_BROADCAST_TONE, call.getString("broadcastTone", "morning_host"));
        }
        if (call.hasOption("maxNewsItems")) {
            Integer maxItems = call.getInt("maxNewsItems", 6);
            editor.putInt(RavioWidgetConfig.KEY_MAX_ITEMS, maxItems != null ? maxItems : 6);
        }
        if (call.hasOption("feedsJson")) {
            editor.putString(RavioWidgetConfig.KEY_FEEDS_JSON, call.getString("feedsJson", "[]"));
        }

        editor.apply();
        RavioDriveWidgetProvider.refreshAllWidgets(getContext());

        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void getWidgetState(PluginCall call) {
        SharedPreferences prefs = RavioWidgetConfig.prefs(getContext());
        JSObject ret = new JSObject();
        ret.put("selectedCategory", RavioWidgetConfig.getSelectedCategory(getContext()));
        ret.put("state", prefs.getString(RavioWidgetConfig.KEY_WIDGET_STATE, RavioWidgetConfig.STATE_IDLE));
        ret.put("statusText", prefs.getString(RavioWidgetConfig.KEY_WIDGET_STATUS, "آماده"));
        ret.put("headline", prefs.getString(RavioWidgetConfig.KEY_WIDGET_TITLE, ""));
        ret.put("hasCachedAudio", prefs.getBoolean(RavioWidgetConfig.KEY_HAS_CACHED_AUDIO, false));
        call.resolve(ret);
    }
}
