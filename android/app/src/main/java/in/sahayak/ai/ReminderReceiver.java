package in.sahayak.ai;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Iterator;

/** Case-date reminders: scheduled with AlarmManager, kept in prefs so they survive a phone restart. */
public class ReminderReceiver extends BroadcastReceiver {
    static final String ACT = "in.sahayak.ai.REMIND";
    static final String CH = "reminders";

    private static SharedPreferences store(Context c) {
        return c.getSharedPreferences("sahayak_reminders", Context.MODE_PRIVATE);
    }

    private static PendingIntent pending(Context c, String key, String title, String body, int flags) {
        Intent i = new Intent(c, ReminderReceiver.class)
                .setAction(ACT)
                .setData(Uri.parse("sahayak://remind/" + Uri.encode(key)))
                .putExtra("key", key).putExtra("title", title).putExtra("body", body);
        return PendingIntent.getBroadcast(c, 0, i, flags | PendingIntent.FLAG_IMMUTABLE);
    }

    static void schedule(Context c, String key, long when, String title, String body) {
        if (when <= System.currentTimeMillis()) return;
        try {
            JSONObject o = new JSONObject().put("when", when).put("title", title).put("body", body);
            store(c).edit().putString(key, o.toString()).apply();
        } catch (Exception ignored) { }
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when,
                pending(c, key, title, body, PendingIntent.FLAG_UPDATE_CURRENT));
    }

    static void cancel(Context c, String key) {
        store(c).edit().remove(key).apply();
        PendingIntent p = pending(c, key, "", "", PendingIntent.FLAG_NO_CREATE);
        if (p != null) {
            ((AlarmManager) c.getSystemService(Context.ALARM_SERVICE)).cancel(p);
            p.cancel();
        }
    }

    static void cancelAll(Context c) {
        for (String k : new ArrayList<>(store(c).getAll().keySet())) cancel(c, k);
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        String a = intent.getAction();
        if (ACT.equals(a)) {
            String key = intent.getStringExtra("key");
            store(c).edit().remove(key).apply();
            show(c, key, intent.getStringExtra("title"), intent.getStringExtra("body"));
            // daily ones ("auto:…") set themselves again for tomorrow, even if the app is not opened
            if (key != null && key.startsWith("auto:"))
                schedule(c, key, System.currentTimeMillis() + 24L * 3600 * 1000 - 60 * 1000, intent.getStringExtra("title"), intent.getStringExtra("body"));
        } else if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) {
            for (String k : new ArrayList<>(store(c).getAll().keySet())) {
                try {
                    JSONObject o = new JSONObject(store(c).getString(k, "{}"));
                    long when = o.getLong("when");
                    if (when > System.currentTimeMillis()) schedule(c, k, when, o.optString("title"), o.optString("body"));
                    else store(c).edit().remove(k).apply();
                } catch (Exception ignored) { }
            }
        }
    }

    private static void show(Context c, String key, String title, String body) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CH, "Case reminders", NotificationManager.IMPORTANCE_HIGH));
            b = new Notification.Builder(c, CH);
        } else {
            b = new Notification.Builder(c).setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        }
        String view = key == null ? "cases" : key.startsWith("auto:") ? "global-auto" : key.startsWith("video:") ? "global" : "cases";
        Intent open = new Intent(c, MainActivity.class).putExtra("view", view)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        b.setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(title == null ? "Sahayak" : title)
                .setContentText(body == null ? "" : body)
                .setAutoCancel(true)
                .setContentIntent(PendingIntent.getActivity(c, key == null ? 1 : key.hashCode(), open,
                        PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        nm.notify(key == null ? 1 : key.hashCode(), b.build());
    }
}
