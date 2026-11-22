# Sahayak AI

Hindi / English AI assistant — phone app (APK) and laptop (browser), same app.

- 💬 Chat (Hindi, Hinglish, English) · 🌐 web search with sources · 📷 photo / 📄 PDF questions
- 🎤 bol ke poochho · 🔊 sun ke jawab · 🗣️ baat-cheet mode
- 📁 case diary with date reminders · 🧰 EMI / byaaj / percent / din gino
- 🔒 fingerprint lock (phone) · 💾 backup · 🔄 update check
- Coming: 📞 CDR analysis (on device), 🎥 CCTV face extraction (laptop, on device)

**AI brain:** Google Gemini API, free tier, with the user's **own** key (made at
https://aistudio.google.com/apikey and pasted into the app). The key stays on that device.
Note: Google may use free-tier prompts to improve its products — do not type passwords,
OTPs, bank or trading details.

## Install
- Phone: https://github.com/sunny1991-co/ai--assistant-/releases/download/app-latest/Sahayak.apk
- Laptop: https://sunny1991-co.github.io/ai--assistant-/

## Layout
- `web/` — the app (HTML/CSS/JS, no build step). Used by the laptop site and copied into the APK.
- `android/` — small WebView wrapper (voice, file picker, fingerprint, reminders, downloads).
- `.github/workflows/` — APK build → release `app-latest`; web → GitHub Pages.

Separate from the trading and court-judgments projects.
