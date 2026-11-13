package app.ravio.newsradio.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.widget.RemoteViews;
import app.ravio.newsradio.MainActivity;
import app.ravio.newsradio.R;

public class RavioDriveWidgetProvider extends AppWidgetProvider {
    public static final String ACTION_SELECT_CATEGORY = "app.ravio.newsradio.widget.ACTION_SELECT_CATEGORY";
    public static final String ACTION_BUILD_AND_PLAY = "app.ravio.newsradio.widget.ACTION_BUILD_AND_PLAY";
    public static final String ACTION_TOGGLE_PLAY = "app.ravio.newsradio.widget.ACTION_TOGGLE_PLAY";
    public static final String EXTRA_CATEGORY = "extra_category";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (intent == null || intent.getAction() == null) return;

        String action = intent.getAction();
        if (ACTION_SELECT_CATEGORY.equals(action)) {
            String cat = intent.getStringExtra(EXTRA_CATEGORY);
            if (cat != null && !cat.isEmpty()) {
                RavioWidgetConfig.prefs(context).edit()
                        .putString(RavioWidgetConfig.KEY_SELECTED_CATEGORY, cat)
                        .apply();
                String currentState = RavioWidgetConfig.prefs(context)
                        .getString(RavioWidgetConfig.KEY_WIDGET_STATE, RavioWidgetConfig.STATE_IDLE);
                if (RavioWidgetConfig.STATE_IDLE.equals(currentState) || RavioWidgetConfig.STATE_ERROR.equals(currentState)) {
                    RavioWidgetConfig.saveUiState(
                            context,
                            RavioWidgetConfig.STATE_IDLE,
                            "آماده",
                            "دسته «" + RavioWidgetConfig.getShortCategoryLabel(cat) + "» انتخاب شد · دکمه ساخت را بزنید"
                    );
                }
                refreshAllWidgets(context);
            }
        } else if (ACTION_BUILD_AND_PLAY.equals(action)) {
            String category = RavioWidgetConfig.getSelectedCategory(context);
            Intent serviceIntent = new Intent(context, RavioWidgetService.class);
            serviceIntent.setAction(RavioWidgetService.ACTION_BUILD_AND_PLAY);
            serviceIntent.putExtra(EXTRA_CATEGORY, category);
            startForegroundCompat(context, serviceIntent);
        } else if (ACTION_TOGGLE_PLAY.equals(action)) {
            Intent serviceIntent = new Intent(context, RavioWidgetService.class);
            serviceIntent.setAction(RavioWidgetService.ACTION_TOGGLE_PLAY);
            startForegroundCompat(context, serviceIntent);
        }
    }

    private static void startForegroundCompat(Context context, Intent serviceIntent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent);
        } else {
            context.startService(serviceIntent);
        }
    }

    public static void refreshAllWidgets(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component = new ComponentName(context, RavioDriveWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(component);
        if (ids != null) {
            for (int id : ids) {
                updateAppWidget(context, manager, id);
            }
        }
    }

    private static void updateAppWidget(Context context, AppWidgetManager manager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.ravio_drive_widget);
        SharedPreferences prefs = RavioWidgetConfig.prefs(context);

        String selectedCat = RavioWidgetConfig.getSelectedCategory(context);
        String state = prefs.getString(RavioWidgetConfig.KEY_WIDGET_STATE, RavioWidgetConfig.STATE_IDLE);
        String statusText = prefs.getString(RavioWidgetConfig.KEY_WIDGET_STATUS, "آماده");
        String headline = prefs.getString(
                RavioWidgetConfig.KEY_WIDGET_TITLE,
                "دسته را انتخاب کنید و «بساز و پخش کن» را بزنید"
        );

        boolean isBusy = RavioWidgetConfig.STATE_FETCHING.equals(state)
                || RavioWidgetConfig.STATE_SCRIPTING.equals(state)
                || RavioWidgetConfig.STATE_TTS.equals(state);
        boolean isPlaying = RavioWidgetConfig.STATE_PLAYING.equals(state);
        boolean isPaused = RavioWidgetConfig.STATE_PAUSED.equals(state);
        boolean isError = RavioWidgetConfig.STATE_ERROR.equals(state);

        // Header opens MainActivity
        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openAppPi = PendingIntent.getActivity(
                context,
                100,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_header, openAppPi);

        // Status pill styling
        views.setTextViewText(R.id.txt_widget_status, statusText);
        if (isPlaying) {
            views.setTextColor(R.id.txt_widget_status, Color.parseColor("#34D399"));
        } else if (isError) {
            views.setTextColor(R.id.txt_widget_status, Color.parseColor("#FCA5A5"));
        } else {
            views.setTextColor(R.id.txt_widget_status, Color.parseColor("#FACC15"));
        }

        // Category selector chips
        bindCategoryChip(context, views, R.id.btn_cat_combined, RavioWidgetConfig.CAT_COMBINED, selectedCat, 201);
        bindCategoryChip(context, views, R.id.btn_cat_iran, RavioWidgetConfig.CAT_IRAN, selectedCat, 202);
        bindCategoryChip(context, views, R.id.btn_cat_world, RavioWidgetConfig.CAT_WORLD, selectedCat, 203);
        bindCategoryChip(context, views, R.id.btn_cat_economy, RavioWidgetConfig.CAT_ECONOMY, selectedCat, 204);
        bindCategoryChip(context, views, R.id.btn_cat_tech, RavioWidgetConfig.CAT_TECH, selectedCat, 205);

        // Headline
        views.setTextViewText(R.id.txt_widget_headline, headline);

        // Build & Play button
        if (isBusy) {
            views.setInt(R.id.btn_build_play, "setBackgroundResource", R.drawable.ravio_widget_build_busy_btn);
            views.setTextColor(R.id.btn_build_play, Color.parseColor("#FDE047"));
            views.setTextViewText(R.id.btn_build_play, statusText);
        } else {
            views.setInt(R.id.btn_build_play, "setBackgroundResource", R.drawable.ravio_widget_build_btn);
            views.setTextColor(R.id.btn_build_play, Color.parseColor("#0B0D10"));
            views.setTextViewText(R.id.btn_build_play, "⚡ بساز و پخش کن");
        }
        views.setOnClickPendingIntent(
                R.id.btn_build_play,
                broadcastPendingIntent(context, ACTION_BUILD_AND_PLAY, null, 301)
        );

        // Play / Pause toggle button
        if (isPlaying) {
            views.setInt(R.id.btn_toggle_play, "setBackgroundResource", R.drawable.ravio_widget_play_active_btn);
            views.setTextColor(R.id.btn_toggle_play, Color.parseColor("#0B0D10"));
            views.setTextViewText(R.id.btn_toggle_play, "❚❚ توقف");
        } else if (isPaused) {
            views.setInt(R.id.btn_toggle_play, "setBackgroundResource", R.drawable.ravio_widget_play_idle_btn);
            views.setTextColor(R.id.btn_toggle_play, Color.parseColor("#34D399"));
            views.setTextViewText(R.id.btn_toggle_play, "▶ ادامه");
        } else {
            views.setInt(R.id.btn_toggle_play, "setBackgroundResource", R.drawable.ravio_widget_play_idle_btn);
            views.setTextColor(R.id.btn_toggle_play, Color.parseColor("#34D399"));
            views.setTextViewText(R.id.btn_toggle_play, "▶ پخش");
        }
        views.setOnClickPendingIntent(
                R.id.btn_toggle_play,
                broadcastPendingIntent(context, ACTION_TOGGLE_PLAY, null, 302)
        );

        manager.updateAppWidget(appWidgetId, views);
    }

    private static void bindCategoryChip(
            Context context,
            RemoteViews views,
            int viewId,
            String categoryId,
            String selectedCat,
            int requestCode
    ) {
        boolean isSelected = categoryId.equals(selectedCat);
        views.setInt(
                viewId,
                "setBackgroundResource",
                isSelected ? R.drawable.ravio_widget_chip_active : R.drawable.ravio_widget_chip_inactive
        );
        views.setTextColor(
                viewId,
                Color.parseColor(isSelected ? "#0B0D10" : "#E4E4E7")
        );
        views.setOnClickPendingIntent(
                viewId,
                broadcastPendingIntent(context, ACTION_SELECT_CATEGORY, categoryId, requestCode)
        );
    }

    private static PendingIntent broadcastPendingIntent(
            Context context,
            String action,
            String categoryExtra,
            int requestCode
    ) {
        Intent intent = new Intent(context, RavioDriveWidgetProvider.class);
        intent.setAction(action);
        if (categoryExtra != null) {
            intent.putExtra(EXTRA_CATEGORY, categoryExtra);
        }
        return PendingIntent.getBroadcast(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
