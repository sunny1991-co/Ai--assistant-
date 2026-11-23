package in.sahayak.ai;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

/**
 * Runs only while a video is being made. A visible notification keeps Android from
 * killing the app (and its page) when the owner briefly switches to another app.
 * The video itself pauses in the background and continues when the app is opened again.
 */
public class VideoService extends Service {
    private static final String CH = "video";

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CH, "Video banana", NotificationManager.IMPORTANCE_LOW));
            b = new Notification.Builder(this, CH);
        } else {
            b = new Notification.Builder(this);
        }
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        b.setSmallIcon(R.drawable.ic_notify)
                .setContentTitle("🎬 Video ban rahi hai")
                .setContentText("Ruki hui hai — yahan dabao, Sahayak par wapas aate hi aage chalegi")
                .setOngoing(true)
                .setContentIntent(PendingIntent.getActivity(this, 7, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        Notification n = b.build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(77, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(77, n);
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopSelf(); // app swiped away: nothing left to keep alive
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
