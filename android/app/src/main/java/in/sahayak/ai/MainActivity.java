package in.sahayak.ai;

import android.Manifest;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;

/**
 * Sahayak: the chat app UI is local HTML/JS (assets/www, same code as the laptop web app).
 * This class adds what a phone app needs: file picker, voice in/out, fingerprint lock,
 * reminders, saving files and opening links outside the app.
 */
public class MainActivity extends FragmentActivity {
    static final String HOST = "appassets.androidplatform.net";
    static final String START = "https://" + HOST + "/assets/www/index.html";
    static final int REQ_FILE = 11, REQ_VOICE = 12, REQ_NOTIFY = 13;
    static final int AUTH = BiometricManager.Authenticators.BIOMETRIC_WEAK
            | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    private WebView web;
    private ValueCallback<Uri[]> fileCb;
    private String voiceId;
    private TextToSpeech tts;
    private boolean ttsReady;
    private final Set<String> speakWaiting = new HashSet<>();
    private final ArrayList<Runnable> ttsQueue = new ArrayList<>();
    private long stoppedAt;
    private boolean ownActivity;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        prefs = getSharedPreferences("sahayak", MODE_PRIVATE);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                return loader.shouldInterceptRequest(req.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                openExternal(u.toString());
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                Intent i = p.createIntent();
                if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    ownActivity = true;
                    startActivityForResult(Intent.createChooser(i, "File chuno"), REQ_FILE);
                } catch (Exception e) {
                    fileCb = null;
                    return false;
                }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "Native");
        String view = getIntent().getStringExtra("view");
        web.loadUrl(START + ("cases".equals(view) ? "#cases" : ""));
        if (lockOn()) lock();
    }

    // ---------- fingerprint lock ----------
    private boolean lockOn() { return prefs.getBoolean("lock", false); }

    private boolean canAuth() {
        return BiometricManager.from(this).canAuthenticate(AUTH) == BiometricManager.BIOMETRIC_SUCCESS;
    }

    private void lock() {
        if (!canAuth()) { web.setVisibility(View.VISIBLE); return; }
        web.setVisibility(View.INVISIBLE);
        BiometricPrompt bp = new BiometricPrompt(this, ContextCompat.getMainExecutor(this),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult r) {
                        web.setVisibility(View.VISIBLE);
                    }

                    @Override
                    public void onAuthenticationError(int code, @NonNull CharSequence msg) {
                        finish();
                    }
                });
        bp.authenticate(new BiometricPrompt.PromptInfo.Builder()
                .setTitle("Sahayak kholo")
                .setSubtitle("Fingerprint ya phone ka lock")
                .setAllowedAuthenticators(AUTH)
                .build());
    }

    @Override
    protected void onStop() {
        super.onStop();
        stoppedAt = SystemClock.elapsedRealtime();
    }

    @Override
    protected void onRestart() {
        super.onRestart();
        boolean mine = ownActivity;
        ownActivity = false;
        if (!mine && lockOn() && SystemClock.elapsedRealtime() - stoppedAt > 60_000) lock();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if ("cases".equals(intent.getStringExtra("view")))
            web.evaluateJavascript("window.App&&App.go('cases')", null);
    }

    // ---------- results from file picker / voice ----------
    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_FILE && fileCb != null) {
            Uri[] out = null;
            if (res == RESULT_OK && data != null) {
                ClipData cd = data.getClipData();
                if (cd != null && cd.getItemCount() > 0) {
                    out = new Uri[cd.getItemCount()];
                    for (int i = 0; i < cd.getItemCount(); i++) out[i] = cd.getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    out = new Uri[]{data.getData()};
                }
            }
            fileCb.onReceiveValue(out);
            fileCb = null;
        } else if (req == REQ_VOICE && voiceId != null) {
            JSONObject o = new JSONObject();
            try {
                ArrayList<String> r = data == null ? null : data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                o.put("text", res == RESULT_OK && r != null && !r.isEmpty() ? r.get(0) : "");
            } catch (Exception ignored) { }
            cb(voiceId, o);
            voiceId = null;
        }
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.onBack&&window.onBack()", v -> {
            if (!"true".equals(v)) finish();
        });
    }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        super.onDestroy();
    }

    // ---------- helpers ----------
    private void cb(String id, JSONObject o) {
        final String js = "window.NativeCb(" + JSONObject.quote(id) + "," + o.toString() + ")";
        runOnUiThread(() -> web.evaluateJavascript(js, null));
    }

    private static JSONObject obj(Object... kv) {
        JSONObject o = new JSONObject();
        try {
            for (int i = 0; i + 1 < kv.length; i += 2) o.put((String) kv[i], kv[i + 1]);
        } catch (Exception ignored) { }
        return o;
    }

    private void openExternal(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception e) {
            Toast.makeText(this, "Is link ko kholne wala app nahi mila", Toast.LENGTH_SHORT).show();
        }
    }

    private void withTts(Runnable r) {
        if (tts != null && ttsReady) { r.run(); return; }
        ttsQueue.add(r);
        if (tts != null) return;
        tts = new TextToSpeech(this, status -> runOnUiThread(() -> {
            ttsReady = status == TextToSpeech.SUCCESS;
            ArrayList<Runnable> q = new ArrayList<>(ttsQueue);
            ttsQueue.clear();
            for (Runnable x : q) x.run();
        }));
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String u) { }
            @Override public void onDone(String u) { speakDone(u); }
            @Override public void onError(String u) { speakDone(u); }
            @Override public void onStop(String u, boolean interrupted) { speakDone(u); }
        });
    }

    private void speakDone(String utterance) {
        if (utterance == null || utterance.contains("#")) return;
        boolean had;
        synchronized (speakWaiting) { had = speakWaiting.remove(utterance); }
        if (had) cb(utterance, new JSONObject());
    }

    /** JavaScript can call these (window.Native.*). */
    class Bridge {
        @JavascriptInterface
        public String version() {
            try {
                return String.valueOf(getPackageManager().getPackageInfo(getPackageName(), 0).versionCode);
            } catch (Exception e) {
                return "0";
            }
        }

        @JavascriptInterface
        public void listen(String id, String lang) {
            runOnUiThread(() -> {
                Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                        .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                        .putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
                        .putExtra(RecognizerIntent.EXTRA_PROMPT, "Boliye…");
                try {
                    voiceId = id;
                    ownActivity = true;
                    startActivityForResult(i, REQ_VOICE);
                } catch (Exception e) {
                    voiceId = null;
                    cb(id, obj("error", "Phone mein Google voice typing nahi mila"));
                }
            });
        }

        @JavascriptInterface
        public void speak(String id, String text, String lang) {
            runOnUiThread(() -> withTts(() -> {
                if (!ttsReady) { cb(id, obj("error", "Phone mein bolne wala engine nahi mila")); return; }
                int ok = tts.setLanguage(Locale.forLanguageTag(lang));
                if (ok == TextToSpeech.LANG_MISSING_DATA || ok == TextToSpeech.LANG_NOT_SUPPORTED)
                    tts.setLanguage(new Locale("en", "IN"));
                synchronized (speakWaiting) { speakWaiting.add(id); }
                int max = 3500, n = 0;
                for (int start = 0; start < text.length(); start += max, n++) {
                    String part = text.substring(start, Math.min(text.length(), start + max));
                    boolean last = start + max >= text.length();
                    tts.speak(part, TextToSpeech.QUEUE_ADD, null, last ? id : id + "#" + n);
                }
                if (text.isEmpty()) speakDone(id);
            }));
        }

        @JavascriptInterface
        public void stopSpeak() {
            runOnUiThread(() -> {
                if (tts != null) tts.stop();
                ArrayList<String> ids;
                synchronized (speakWaiting) { ids = new ArrayList<>(speakWaiting); speakWaiting.clear(); }
                for (String x : ids) cb(x, new JSONObject());
            });
        }

        /** Network: Gemini API, GitHub public API, and the trading app's Sahayak link on this phone. */
        @JavascriptInterface
        public void http(String id, String method, String url, String headersJson, String body) {
            new Thread(() -> {
                JSONObject o = new JSONObject();
                try {
                    if (!(url.startsWith("https://generativelanguage.googleapis.com/") || url.startsWith("https://api.github.com/")
                            || url.startsWith("http://localhost:8787/sahayak/")))
                        throw new SecurityException("not allowed");
                    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                    c.setRequestMethod(method);
                    c.setConnectTimeout(20000);
                    c.setReadTimeout(180000);
                    JSONObject h = new JSONObject(headersJson == null || headersJson.isEmpty() ? "{}" : headersJson);
                    for (Iterator<String> it = h.keys(); it.hasNext(); ) {
                        String k = it.next();
                        c.setRequestProperty(k, h.getString(k));
                    }
                    if (body != null && !body.isEmpty()) {
                        c.setDoOutput(true);
                        try (OutputStream os = c.getOutputStream()) { os.write(body.getBytes(StandardCharsets.UTF_8)); }
                    }
                    int code = c.getResponseCode();
                    InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    if (in != null) {
                        byte[] buf = new byte[16384];
                        int n;
                        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                        in.close();
                    }
                    o.put("status", code);
                    o.put("text", new String(bo.toByteArray(), StandardCharsets.UTF_8));
                } catch (Exception e) {
                    try { o.put("status", 0); o.put("text", String.valueOf(e.getMessage())); } catch (Exception ignored) { }
                }
                cb(id, o);
            }).start();
        }

        @JavascriptInterface
        public void share(String text) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(i, "Share"));
            });
        }

        @JavascriptInterface
        public void openUrl(String url) {
            if (url != null && url.startsWith("https://")) runOnUiThread(() -> openExternal(url));
        }

        @JavascriptInterface
        public void openApp(String pkg, String fallback) {
            runOnUiThread(() -> {
                Intent i = getPackageManager().getLaunchIntentForPackage(pkg);
                if (i != null) startActivity(i);
                else if (fallback != null && fallback.startsWith("https://")) {
                    Toast.makeText(MainActivity.this, "App nahi mila — download ho raha hai", Toast.LENGTH_SHORT).show();
                    openExternal(fallback);
                }
            });
        }

        /** Save into Downloads/Sahayak (Android 10+), or the app's own Downloads folder on older phones. */
        @JavascriptInterface
        public void saveFile(String id, String name, String mime, String b64) {
            new Thread(() -> {
                boolean ok = false;
                try {
                    String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
                    byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                    if (Build.VERSION.SDK_INT >= 29) {
                        ContentValues cv = new ContentValues();
                        cv.put(MediaStore.MediaColumns.DISPLAY_NAME, safe);
                        cv.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                        cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Sahayak");
                        Uri u = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                        if (u != null) try (OutputStream os = getContentResolver().openOutputStream(u)) { os.write(bytes); ok = true; }
                    } else {
                        File dir = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "Sahayak");
                        if (dir.exists() || dir.mkdirs()) try (OutputStream os = new FileOutputStream(new File(dir, safe))) { os.write(bytes); ok = true; }
                    }
                } catch (Exception ignored) { }
                cb(id, obj("ok", ok));
            }).start();
        }

        @JavascriptInterface
        public void remind(String key, double when, String title, String body) {
            ReminderReceiver.schedule(MainActivity.this, key, (long) when, title, body);
        }

        @JavascriptInterface
        public void cancelRemind(String key) {
            ReminderReceiver.cancel(MainActivity.this, key);
        }

        @JavascriptInterface
        public void askNotify() {
            if (Build.VERSION.SDK_INT >= 33
                    && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY));
        }

        @JavascriptInterface
        public boolean getLock() { return lockOn(); }

        @JavascriptInterface
        public boolean setLock(boolean on) {
            if (on && !canAuth()) return false;
            prefs.edit().putBoolean("lock", on).apply();
            return true;
        }

        @JavascriptInterface
        public void clearAll() {
            ReminderReceiver.cancelAll(MainActivity.this);
            prefs.edit().clear().apply();
        }
    }
}
