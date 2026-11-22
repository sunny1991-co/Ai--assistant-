// Speak to the app and hear answers. Phone app: Android's own voice services.
// Laptop: Chrome/Edge speech in the browser.
"use strict";
const Voice = (() => {
  const lang = () => S.get("voiceLang", "hi-IN");
  const langFor = text => (/[ऀ-ॿ]/.test(text) ? "hi-IN" : lang());

  function canListen() { return IS_APP || "webkitSpeechRecognition" in window || "SpeechRecognition" in window; }
  function canSpeak() { return IS_APP || "speechSynthesis" in window; }

  async function listen() {
    if (IS_APP) {
      const r = await nativeCall("listen", lang());
      if (r.error) throw new Error(r.error);
      return r.text || "";
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) throw new Error("Is browser mein bolne ki suvidha nahi — Chrome use karo");
    return new Promise((resolve, reject) => {
      const r = new SR();
      r.lang = lang(); r.interimResults = false; r.maxAlternatives = 1;
      r.onresult = e => resolve(e.results[0][0].transcript);
      r.onerror = e => reject(new Error(e.error === "no-speech" ? "Kuch sunai nahi diya" : "Mic nahi chala (" + e.error + ")"));
      r.onend = () => resolve("");
      r.start();
    });
  }

  // Laptop: prefer an Indian voice (Google हिन्दी / English India / Microsoft Hindi)
  function webVoices() { return "speechSynthesis" in window ? speechSynthesis.getVoices().filter(v => /-IN$|^hi/i.test(v.lang)) : []; }
  function pickWebVoice(lang) {
    const all = "speechSynthesis" in window ? speechSynthesis.getVoices() : [];
    const want = S.get("webVoice", "");
    return all.find(v => v.name === want) || all.find(v => v.lang === lang && /google/i.test(v.name)) || all.find(v => v.lang === lang) || all.find(v => /-IN$/.test(v.lang)) || null;
  }
  async function list() {
    if (IS_APP) { const r = await nativeCall("voices"); return { voices: (r.voices || []).map(v => ({ name: v.name, label: (v.locale.startsWith("hi") ? "हिंदी" : "English-India") + " · " + v.name.replace(/^[a-z]{2}-[a-z]{2}-x-/i, "").replace(/-(local|network)$/, "") + (v.net ? " (net)" : "") })), chosen: r.chosen || "" }; }
    if ("speechSynthesis" in window && !speechSynthesis.getVoices().length) await new Promise(r => { speechSynthesis.onvoiceschanged = r; setTimeout(r, 1500); });
    return { voices: webVoices().map(v => ({ name: v.name, label: v.lang + " · " + v.name })), chosen: S.get("webVoice", "") };
  }
  function choose(name) { if (IS_APP) window.Native.setVoice(name); else S.set("webVoice", name); }

  let speaking = false;
  async function speak(md) {
    const text = MD.plain(md).slice(0, 6000);
    if (!text) return;
    speaking = true;
    try {
      if (IS_APP) { if (window.Native.setRate) window.Native.setRate(S.get("voiceRate", 1)); await nativeCall("speak", text, langFor(text)); return; }
      if (!("speechSynthesis" in window)) return;
      await new Promise(resolve => {
        speechSynthesis.cancel();
        const parts = text.match(/[^.!?।\n]{1,220}[.!?।\n]?/g) || [text];
        let left = parts.length;
        parts.forEach(p => {
          const u = new SpeechSynthesisUtterance(p);
          u.lang = langFor(text); u.rate = S.get("voiceRate", 1);
          const vv = pickWebVoice(u.lang); if (vv) u.voice = vv;
          u.onend = u.onerror = () => { if (--left === 0) resolve(); };
          speechSynthesis.speak(u);
        });
      });
    } finally { speaking = false; }
  }
  function stop() {
    speaking = false;
    if (IS_APP) window.Native.stopSpeak();
    else if ("speechSynthesis" in window) speechSynthesis.cancel();
  }
  return { listen, speak, stop, canListen, canSpeak, list, choose, isSpeaking: () => speaking };
})();
