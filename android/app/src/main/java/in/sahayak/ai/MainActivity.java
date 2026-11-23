package in.sahayak.ai;

import android.Manifest;
import android.content.ClipData;
import android.content.ContentUris;
import android.database.Cursor;
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

import org.json.JSONArray;
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
    static final int REQ_FILE = 11, REQ_VOICE = 12, REQ_NOTIFY = 13, REQ_MIC = 14;
    private android.webkit.PermissionRequest pendingMic;
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

            // Page process died (mostly phone memory full while making a video):
            // rebuild the screen instead of leaving it blank or crashing the app.
            @Override
            public boolean onRenderProcessGone(WebView v, android.webkit.RenderProcessGoneDetail d) {
                try {
                    android.view.ViewGroup p = (android.view.ViewGroup) v.getParent();
                    if (p != null) p.removeView(v);
                    v.destroy();
                } catch (Exception ignored) { }
                recreate();
                return true;
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
            /** Microphone for recording the owner's own voice-over (our own page only). */
            @Override
            public void onPermissionRequest(android.webkit.PermissionRequest req) {
                runOnUiThread(() -> {
                    boolean mine = req.getOrigin() != null && HOST.equals(req.getOrigin().getHost());
                    boolean audio = false;
                    for (String r : req.getResources()) if (android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) audio = true;
                    if (!mine || !audio) { req.deny(); return; }
                    String[] res = {android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE};
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) req.grant(res);
                    else { pendingMic = req; requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC); }
                });
            }

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
    private volatile boolean videoBusy = false; // a video is being made right now

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
        // tell the page directly (screen off / other app), in case the browser's own signal is late
        if (web != null) web.evaluateJavascript("window.dispatchEvent(new Event('apphide'))", null);
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (web != null) web.evaluateJavascript("window.dispatchEvent(new Event('appshow'))", null);
    }

    @Override
    protected void onRestart() {
        super.onRestart();
        boolean mine = ownActivity;
        ownActivity = false;
        // While a video is being made, don't hide the page behind Sahayak's own fingerprint lock
        // (the phone's own screen lock still protects the phone). Hiding it stopped the video.
        if (!mine && !videoBusy && lockOn() && SystemClock.elapsedRealtime() - stoppedAt > 60_000) lock();
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
    public void onRequestPermissionsResult(int req, @NonNull String[] perms, @NonNull int[] results) {
        super.onRequestPermissionsResult(req, perms, results);
        if (req == REQ_MIC && pendingMic != null) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED)
                pendingMic.grant(new String[]{android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            else pendingMic.deny();
            pendingMic = null;
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
        try { stopService(new Intent(this, VideoService.class)); } catch (Exception ignored) { }
        if (tts != null) tts.shutdown();
        super.onDestroy();
    }

    // ---------- helpers ----------
    /** Move a finished file where the phone can find it: videos → Movies/Sahayak (Gallery), pictures → Pictures/Sahayak. */
    private String publish(File tmp, String safe, String mime) throws Exception {
        if (Build.VERSION.SDK_INT >= 29) {
            Uri coll; String dir;
            if (mime.startsWith("video/")) { coll = MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY); dir = Environment.DIRECTORY_MOVIES + "/Sahayak"; }
            else if (mime.startsWith("image/")) { coll = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY); dir = Environment.DIRECTORY_PICTURES + "/Sahayak"; }
            else { coll = MediaStore.Downloads.EXTERNAL_CONTENT_URI; dir = Environment.DIRECTORY_DOWNLOADS + "/Sahayak"; }
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.MediaColumns.DISPLAY_NAME, safe);
            cv.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            cv.put(MediaStore.MediaColumns.RELATIVE_PATH, dir);
            cv.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri u = getContentResolver().insert(coll, cv);
            if (u == null) return null;
            try (OutputStream os = getContentResolver().openOutputStream(u); InputStream in = new java.io.FileInputStream(tmp)) {
                byte[] buf = new byte[65536]; int n; while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            getContentResolver().update(u, done, null, null);
            return u.toString();
        }
        File dir = new File(getExternalFilesDir(mime.startsWith("video/") ? Environment.DIRECTORY_MOVIES : mime.startsWith("image/") ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS), "Sahayak");
        if (!dir.exists() && !dir.mkdirs()) return null;
        File out = new File(dir, safe);
        try (OutputStream os = new FileOutputStream(out); InputStream in = new java.io.FileInputStream(tmp)) {
            byte[] buf = new byte[65536]; int n; while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
        }
        return androidx.core.content.FileProvider.getUriForFile(this, "in.sahayak.ai.files", out).toString();
    }

    private void addRows(JSONArray arr, Uri coll, String pathLike) throws Exception {
        String[] proj = {MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.SIZE, MediaStore.MediaColumns.DATE_ADDED, MediaStore.MediaColumns.MIME_TYPE};
        try (Cursor c = getContentResolver().query(coll, proj,
                MediaStore.MediaColumns.RELATIVE_PATH + " LIKE ? AND " + MediaStore.MediaColumns.MIME_TYPE + " LIKE 'video/%'",
                new String[]{pathLike}, MediaStore.MediaColumns.DATE_ADDED + " DESC")) {
            if (c == null) return;
            while (c.moveToNext()) {
                JSONObject r = new JSONObject();
                r.put("uri", ContentUris.withAppendedId(coll, c.getLong(0)).toString());
                r.put("name", c.getString(1)); r.put("size", c.getLong(2)); r.put("date", c.getLong(3)); r.put("mime", c.getString(4));
                arr.put(r);
            }
        }
    }
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
            @Override public void onDone(String u) { if (u != null && u.startsWith("file:")) fileDone(u, true); else speakDone(u); }
            @Override public void onError(String u) { if (u != null && u.startsWith("file:")) fileDone(u, false); else speakDone(u); }
            @Override public void onStop(String u, boolean interrupted) { speakDone(u); }
        });
    }

    /** Indian voice: the one the user chose, else the best installed hi-IN / en-IN voice. */
    private void pickVoice(String lang) {
        try {
            String want = prefs.getString("voice", "");
            android.speech.tts.Voice best = null;
            int bestScore = -1;
            Locale target = Locale.forLanguageTag(lang);
            for (android.speech.tts.Voice v : tts.getVoices()) {
                if (v.getFeatures() != null && v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
                if (!want.isEmpty() && v.getName().equals(want)) { best = v; break; }
                Locale l = v.getLocale();
                int score = 0;
                if (l.getLanguage().equals(target.getLanguage())) score += 100;
                if ("IN".equals(l.getCountry())) score += 50;
                if (l.getLanguage().equals("hi") || l.getLanguage().equals("en")) score += 10;
                score += v.getQuality() / 100;
                if (!v.isNetworkConnectionRequired()) score += 1;
                if (score > bestScore) { bestScore = score; best = v; }
            }
            if (best != null && bestScore >= 50 || best != null && !want.isEmpty() && best.getName().equals(want)) {
                tts.setVoice(best);
                return;
            }
        } catch (Exception ignored) { }
        int ok = tts.setLanguage(Locale.forLanguageTag(lang));
        if (ok == TextToSpeech.LANG_MISSING_DATA || ok == TextToSpeech.LANG_NOT_SUPPORTED)
            tts.setLanguage(new Locale("en", "IN"));
    }

    /** Voice-over to a WAV file (for videos): send it back to the page as base64. */
    private void fileDone(String utterance, boolean ok) {
        String id = utterance.substring(5);
        File f = new File(getCacheDir(), "tts_" + id.replaceAll("[^A-Za-z0-9]", "") + ".wav");
        JSONObject o = new JSONObject();
        try {
            if (!ok || !f.exists()) throw new IllegalStateException("tts failed");
            byte[] b = new byte[(int) f.length()];
            try (InputStream in = new java.io.FileInputStream(f)) { int off = 0, n; while (off < b.length && (n = in.read(b, off, b.length - off)) > 0) off += n; }
            o.put("b64", Base64.encodeToString(b, Base64.NO_WRAP));
        } catch (Exception e) {
            try { o.put("error", "Awaaz file nahi bani"); } catch (Exception ignored) { }
        }
        f.delete();
        cb(id, o);
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
                pickVoice(lang);
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

        /** Indian-first list of voices on this phone: [{name, locale, net}] */
        @JavascriptInterface
        public void voices(String id) {
            runOnUiThread(() -> withTts(() -> {
                org.json.JSONArray arr = new org.json.JSONArray();
                try {
                    if (ttsReady) for (android.speech.tts.Voice v : tts.getVoices()) {
                        if (v.getFeatures() != null && v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
                        String l = v.getLocale().toLanguageTag();
                        if (!(l.startsWith("hi") || l.equals("en-IN") || l.endsWith("-IN"))) continue;
                        arr.put(new JSONObject().put("name", v.getName()).put("locale", l).put("net", v.isNetworkConnectionRequired()));
                    }
                } catch (Exception ignored) { }
                cb(id, obj("voices", arr, "chosen", prefs.getString("voice", "")));
            }));
        }

        @JavascriptInterface
        public void setVoice(String name) {
            prefs.edit().putString("voice", name == null ? "" : name).apply();
        }

        @JavascriptInterface
        public void setRate(double r) {
            final float rate = (float) Math.max(0.5, Math.min(2.0, r));
            runOnUiThread(() -> withTts(() -> { if (ttsReady) tts.setSpeechRate(rate); }));
        }

        @JavascriptInterface
        public void speakToFile(String id, String text, String lang, double rate) {
            runOnUiThread(() -> withTts(() -> {
                if (!ttsReady) { cb(id, obj("error", "Phone mein bolne wala engine nahi mila")); return; }
                pickVoice(lang);
                tts.setSpeechRate((float) Math.max(0.6, Math.min(1.6, rate)));
                File f = new File(getCacheDir(), "tts_" + id.replaceAll("[^A-Za-z0-9]", "") + ".wav");
                int r = tts.synthesizeToFile(text.length() > 3900 ? text.substring(0, 3900) : text, null, f, "file:" + id);
                if (r != TextToSpeech.SUCCESS) cb(id, obj("error", "Awaaz file nahi bani"));
            }));
        }

        /** Big files (videos) arrive in pieces: append to a temp file, then move to Downloads/Sahayak. */
        @JavascriptInterface
        public void saveChunk(String id, String name, String mime, String b64, boolean first, boolean last) {
            new Thread(() -> {
                JSONObject o = new JSONObject();
                try {
                    String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
                    File tmp = new File(getCacheDir(), "out_" + safe);
                    try (OutputStream os = new FileOutputStream(tmp, !first)) { os.write(Base64.decode(b64, Base64.DEFAULT)); }
                    if (last) {
                        String uri = publish(tmp, safe, mime);
                        tmp.delete();
                        o.put("ok", uri != null);
                        if (uri != null) o.put("uri", uri);
                    } else o.put("ok", true);
                } catch (Exception e) {
                    try { o.put("ok", false); } catch (Exception ignored) { }
                }
                cb(id, o);
            }).start();
        }

        /** Play a saved video/photo in the phone's own player. */
        @JavascriptInterface
        public void openMedia(String uri, String mime) {
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse(uri), mime)
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(i);
                } catch (Exception e) { Toast.makeText(MainActivity.this, "Kholne wala app nahi mila", Toast.LENGTH_SHORT).show(); }
            });
        }

        /** Send a saved video to YouTube / WhatsApp / Drive (phone's share sheet). */
        @JavascriptInterface
        public void shareMedia(String uri, String mime) {
            runOnUiThread(() -> {
                try {
                    Uri u = Uri.parse(uri);
                    Intent i = new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, u)
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    i.setClipData(ClipData.newRawUri("", u));
                    startActivity(Intent.createChooser(i, "YouTube / WhatsApp par bhejo"));
                } catch (Exception e) { Toast.makeText(MainActivity.this, "Bhej nahi paya", Toast.LENGTH_SHORT).show(); }
            });
        }

        /** Videos this app made (new: Movies/Sahayak, old: Download/Sahayak), newest first. */
        @JavascriptInterface
        public void listMedia(String id) {
            new Thread(() -> {
                JSONObject o = new JSONObject();
                JSONArray arr = new JSONArray();
                try {
                    if (Build.VERSION.SDK_INT >= 29) {
                        addRows(arr, MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), Environment.DIRECTORY_MOVIES + "/Sahayak%");
                        addRows(arr, MediaStore.Downloads.EXTERNAL_CONTENT_URI, Environment.DIRECTORY_DOWNLOADS + "/Sahayak%");
                    } else {
                        for (String d : new String[]{Environment.DIRECTORY_MOVIES, Environment.DIRECTORY_DOWNLOADS}) {
                            File[] fs = new File(getExternalFilesDir(d), "Sahayak").listFiles();
                            if (fs == null) continue;
                            for (File f : fs) {
                                String n = f.getName();
                                if (!n.endsWith(".mp4") && !n.endsWith(".webm")) continue;
                                JSONObject r = new JSONObject();
                                r.put("uri", androidx.core.content.FileProvider.getUriForFile(MainActivity.this, "in.sahayak.ai.files", f).toString());
                                r.put("name", n); r.put("size", f.length()); r.put("date", f.lastModified() / 1000);
                                r.put("mime", n.endsWith(".mp4") ? "video/mp4" : "video/webm");
                                arr.put(r);
                            }
                        }
                    }
                    o.put("items", arr);
                } catch (Exception e) {
                    try { o.put("error", "List nahi mili"); } catch (Exception ignored) { }
                }
                cb(id, o);
            }).start();
        }

        @JavascriptInterface
        public void keepScreenOn(boolean on) {
            runOnUiThread(() -> {
                web.setKeepScreenOn(on);
                if (on) getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        /** While a video is being made: keep the app and its page alive if the owner switches apps. */
        @JavascriptInterface
        public void videoWork(boolean on) {
            videoBusy = on;
            runOnUiThread(() -> {
                Intent i = new Intent(MainActivity.this, VideoService.class);
                try {
                    if (on) {
                        if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
                        if (Build.VERSION.SDK_INT >= 26) web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
                    } else {
                        stopService(i);
                        if (Build.VERSION.SDK_INT >= 26) web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
                    }
                } catch (Exception ignored) { }
            });
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
                            || url.startsWith("http://localhost:8787/sahayak/")
                            || (method.equals("GET") && url.startsWith("https://www.googleapis.com/youtube/v3/"))
                            || (method.equals("GET") && url.startsWith("https://suggestqueries.google.com/complete/search"))
                            || (method.equals("GET") && (url.startsWith("https://news.google.com/rss")
                                || url.startsWith("https://html.duckduckgo.com/html/")))))
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
