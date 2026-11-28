// 🎬 Video banao: topic → Hindi script + slides (AI) → Indian voice (phone TTS) → video file
// (slides + voice) + thumbnail + title/description/tags. Original content only.
"use strict";
const Video = (() => {
  let plan = null, busy = false, mode = "in"; // "in" = Hindi channel, "g" = global English channel
  const plans = {};
  const GL = () => (plan && plan.mode ? plan.mode : mode) === "g";
  const EN = GL;
  const K = k => (mode === "g" ? k + "_g" : k); // separate settings per channel
  const vA = () => S.get(K("vVoiceA"), "Puck"), vB = () => S.get(K("vVoiceB"), mode === "g" ? "Aoede" : "Charon");
  const vN = () => S.get(K("vVoiceN"), mode === "g" ? "Kore" : "Orus");
  // 📱 phone voices for characters: free, no daily limit (owner's choice in the editor)
  const PHONE_OK = () => IS_APP && !!(window.Native && window.Native.speakToFileV);
  const engine = () => PHONE_OK() ? S.get(K("vEngine"), "ai") : "ai";
  const PITCH = [["1.25", "Patli / bachche jaisi"], ["1.12", "Thodi patli"], ["1.0", "Normal"], ["0.9", "Thodi bhaari"], ["0.8", "Bhaari / buzurg"]];
  const DEF_PITCH = { A: mode === "g" ? "1.0" : "1.12", B: mode === "g" ? "1.12" : "0.8", N: "0.9" };
  const pvName = w => S.get(K("pv" + w), ""), pvPitch = w => S.get(K("pp" + w), DEF_PITCH[w]);
  let phoneList = null;
  async function phoneVoices() {
    if (phoneList) return phoneList;
    try { const r = await nativeCall("voices"); phoneList = (r.voices || []).filter(v => EN() ? /^en/.test(v.locale) : /^hi/.test(v.locale)); } catch (e) { phoneList = []; }
    return phoneList;
  }
  async function phoneLine(ac, text, who) {
    const w = who === "B" || who === "N" ? who : "A";
    const r = await nativeCall("speakToFileV", text || " ", EN() ? "en-US" : "hi-IN", S.get("voiceRate", 1), pvName(w), +pvPitch(w));
    if (r.error) throw new Error(r.error);
    const bin = atob(r.b64), arr = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
    return ac.decodeAudioData(arr.buffer);
  }
  const voiceOf = who => (who === "N" ? vN() : who === "B" ? vB() : vA());
  const CAT = () => (plan && plan.cat) || "";
  const voices = {}; // slide index -> {blob, dur} (owner's own recorded voice)
  const photos = {}; // slide index -> HTMLImageElement (owner's own photo)
  const AI_VOICES = [["Charon", "👨 Aadmi — gambhir"], ["Puck", "👨 Aadmi — josh wala"], ["Orus", "👨 Aadmi — shaant"], ["Kore", "👩 Aurat — saaf"], ["Aoede", "👩 Aurat — garm"], ["Leda", "👩 Aurat — halki"]];
  const FEMALE = new Set(["Kore", "Aoede", "Leda", "Zephyr", "Callirrhoe", "Autonoe", "Despina", "Erinome", "Laomedeia", "Achernar", "Gacrux", "Pulcherrima", "Vindemiatrix", "Sulafat"]);
  const TTS_MODELS = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];

  function pcmToWav(b64, rate) {
    const bin = atob(b64), n = bin.length, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n, true);
    const u = new Uint8Array(buf, 44); for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return buf;
  }

  // 🤖 Human-like AI voice (Gemini TTS, free tier). Returns an ArrayBuffer (WAV) or throws.
  const ttsCache = new Map();
  const idb = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((ok, no) => { try { const r = indexedDB.open("sahayak-tts", 1); r.onupgradeneeded = () => r.result.createObjectStore("a"); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); } catch (e) { no(e); } }));
    const tx = (mode, fn) => open().then(db => new Promise((ok, no) => { const t = db.transaction("a", mode), st = t.objectStore("a"), r = fn(st); t.oncomplete = () => ok(r && r.result); t.onerror = () => no(t.error); }));
    return {
      get: k => tx("readonly", st => st.get(k)).catch(() => null),
      put: (k, v) => tx("readwrite", st => st.put({ v, t: Date.now() }, k)).catch(() => {}),
      prune: () => tx("readwrite", st => { const r = st.openCursor(), old = Date.now() - 20 * 864e5; r.onsuccess = () => { const c = r.result; if (!c) return; if (!c.value || c.value.t < old) c.delete(); c.continue(); }; }).catch(() => {}),
    };
  })();
  setTimeout(() => idb.prune(), 8000);
  const MOOD_TTS = {
    hi: { funny: "Is line ko mazaakiya andaaz mein, muskurate hue aur halki hansi ke saath, comedy timing se bolo. ", serious: "Is line ko gambhir, dheemi aur thehri hui awaaz mein bolo, jaise bahut zaroori baat ho. ",
      daant: "Is line ko pyaar bhari daant ke andaaz mein bolo — thoda tez aur sakht, jaise ghar ke bade galti pe daant-te hain, par gussa asli nahi. ", shayari: "Is line ko shayarana andaaz mein bolo — thehar-thehar kar, dil se, jaise mushaire mein sher padh rahe ho. " },
    en: { funny: "Deliver this line playfully, smiling, with comic timing and a little laugh in the voice. ", serious: "Deliver this line seriously, slower and calm, like an important point. ",
      daant: "Deliver this line as a playful scolding — firm and a bit louder, like a big sister telling off a friend, not really angry. ", shayari: "Deliver this line like a short poem — rhythmic and warm, with gentle pauses. " },
  };
  async function aiVoice(text, voice, who, mood, onWait) {
    const ck = voiceCk(text, voice, who, mood);
    if (ttsCache.has(ck)) return ttsCache.get(ck).slice(0);
    const saved = await idb.get(ck);
    if (saved && saved.v) { ttsCache.set(ck, saved.v.slice(0)); return saved.v.slice(0); }
    const buf = await aiVoiceRaw(text, voice, who, mood, onWait);
    ttsCache.set(ck, buf.slice(0)); idb.put(ck, buf.slice(0));
    return buf;
  }
  async function aiVoiceRaw(text, voice, who, mood, onWait) {
    const body = { contents: [{ role: "user", parts: [{ text: ((MOOD_TTS[EN() ? "en" : "hi"] || {})[mood] || "") + (who === "N" ? (EN() ? "Narrate like a warm, gripping storyteller of an animated short film — rich, calm voice, clear diction, small dramatic pauses, not robotic. Say this:\n" : "Ek kahani sunane wale (daastango) ki tarah bolo — garm, rochak awaaz, thehar-thehar kar, jahan zaroori ho wahan halka sa raaz bhara andaaz; robot ya news reader jaisa nahi. Ye Hindi bolo:\n") :
      EN() && who === "A" ? "Speak as a friendly, curious young American traveler — natural, expressive and conversational, with real reactions (surprise, laughter in the voice), not like a robot or news reader. Pronounce any Hindi words as best you can. Say this:\n" :
      EN() && who === "B" ? "Speak as a warm, cheerful young Indian woman in a natural Indian English accent — friendly, expressive storytelling, natural pauses; pronounce Hindi words authentically. Not robotic. Say this:\n" :
      EN() ? "Speak like a warm, friendly storyteller explaining to a friend — natural and conversational, clear neutral English, with natural pauses at commas and full stops, curious tone on questions. Not like a robot or a news reader. Say this:\n" : "Aise bolo jaise ek samajhdaar Bharatiya bada bhai apne dost ko chai pe samjha raha ho — aaram se, garmjoshi se, sawaal pe awaaz upar, zaroori baat pe zor, comma aur full stop pe halka ruk kar. News reader ya robot jaisa nahi. Ye Hindi bolo:\n") + text }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } };
    // keep the same person's voice the whole video: say clearly man/woman, one speaker, no acting other characters
    const fem = FEMALE.has(voice);
    body.contents[0].parts[0].text = (EN() ? `[Single speaker, ${fem ? "female" : "male"} voice throughout. Do not change voice or imitate other characters.]\n` : `[Sirf ek bolne wala, poori line ${fem ? "aurat" : "aadmi"} ki isi awaaz mein. Awaaz mat badlo, kisi aur kirdaar ki nakal mat karo.]\n`) + body.contents[0].parts[0].text;
    return ttsCall(body, onWait);
  }

  async function ttsCall(body, onWait) {
    const ok = S.get("ttsModel", "");
    const order = ok ? [ok, ...TTS_MODELS.filter(m => m !== ok)] : TTS_MODELS;
    let last = "";
    for (const m of order) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const url = "https://generativelanguage.googleapis.com/v1beta/models/" + m + ":generateContent";
        let status, txt;
        try {
          const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": S.get("key", "") }, body: JSON.stringify(body) });
          status = res.status; txt = await res.text();
        } catch (e) {
          if (!IS_APP) throw e;
          const r = await nativeCall("http", "POST", url, JSON.stringify({ "Content-Type": "application/json", "x-goog-api-key": S.get("key", "") }), JSON.stringify(body));
          status = r.status; txt = r.text;
        }
        if (status === 200) {
          const part = ((((JSON.parse(txt).candidates || [])[0] || {}).content || {}).parts || []).find(p => p.inlineData || p.inline_data);
          const d = part && (part.inlineData || part.inline_data);
          if (!d) { last = "khaali awaaz"; break; }
          S.set("ttsModel", m);
          const mt = d.mimeType || d.mime_type || "";
          if (/wav/i.test(mt)) { const bin = atob(d.data), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a.buffer; }
          return pcmToWav(d.data, +((mt.match(/rate=(\d+)/) || [0, 24000])[1]));
        }
        last = "AI awaaz: " + status;
        if ((status === 429 || status >= 500) && attempt < 2 && !/PerDay|per day|limit: ?0\b/i.test(txt || "")) { if (onWait) onWait(status === 429 ? 30 : 3); await new Promise(r => setTimeout(r, status === 429 ? 30000 : 3000)); continue; }
        break;
      }
    }
    throw new Error(last || "AI awaaz nahi bani");
  }

  // ⚡ Batch voices: up to ~10 lines (max 2 speakers) in ONE Google request, then cut the audio at the pauses.
  // Free TTS has a small daily request limit — 30 one-line requests used to finish it in one video.
  const voiceCk = (text, voice, who, mood) => "v2|" + (EN() ? "en|" + (who || "") + "|" : "hi|") + (mood || "") + "|" + voice + "|" + text;
  function wavPcm(buf) {
    const v = new DataView(buf); let rate = 24000, off = 12;
    while (off + 8 <= buf.byteLength) {
      const id = String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3)), len = v.getUint32(off + 4, true);
      if (id === "fmt ") rate = v.getUint32(off + 12, true);
      if (id === "data") return { pcm: new Int16Array(buf.slice(off + 8, off + 8 + Math.min(len, buf.byteLength - off - 8) & ~1)), rate };
      off += 8 + len + (len & 1);
    }
    return { pcm: new Int16Array(buf.slice(44, 44 + ((buf.byteLength - 44) & ~1))), rate };
  }
  function pcmWav(pcm, rate) {
    const n = pcm.length * 2, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    const w = (o, s2) => { for (let i = 0; i < s2.length; i++) v.setUint8(o + i, s2.charCodeAt(i)); };
    w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n, true);
    new Int16Array(buf, 44).set(pcm); return buf;
  }
  // cut one long take into n parts: prefer the n-1 longest pauses; check they fit the text lengths, else nearest pause to the expected spot
  function splitTake(pcm, rate, weights) {
    const n = weights.length; if (n === 1) return [pcm];
    const F = Math.round(rate * 0.02), nf = Math.floor(pcm.length / F), rms = new Float32Array(nf);
    for (let f = 0; f < nf; f++) { let sum = 0; for (let i = f * F; i < (f + 1) * F; i++) sum += pcm[i] * pcm[i]; rms[f] = Math.sqrt(sum / F); }
    const sorted = Array.from(rms).sort((x, y) => x - y), thr = Math.max(200, sorted[Math.floor(nf * 0.95)] * 0.1);
    let first = 0, lastF = nf - 1; while (first < nf && rms[first] < thr) first++; while (lastF > first && rms[lastF] < thr) lastF--;
    const runs = []; let st = -1;
    for (let f = first; f <= lastF + 1; f++) { const sil = f <= lastF && rms[f] < thr; if (sil && st < 0) st = f; if (!sil && st >= 0) { if (f - st >= 6) runs.push({ c: Math.round((st + f) / 2), len: f - st }); st = -1; } }
    const tot = weights.reduce((x, y) => x + y, 0), span = lastF - first, expect = []; let acc = 0;
    for (let k = 0; k < n - 1; k++) { acc += weights[k]; expect.push(first + span * acc / tot); }
    let cuts = null;
    if (runs.length >= n - 1) {
      const pick = runs.slice().sort((x, y) => y.len - x.len).slice(0, n - 1).map(r => r.c).sort((x, y) => x - y);
      const okFit = pick.every((c, k) => Math.abs(c - expect[k]) < span / n * 0.9);
      if (okFit) cuts = pick;
    }
    if (!cuts) { cuts = []; let prev = first; for (let k = 0; k < n - 1; k++) { const lo = prev + 10, cand = runs.filter(r => r.c > lo); let best = cand.sort((x, y) => Math.abs(x.c - expect[k]) - Math.abs(y.c - expect[k]))[0]; const c = best && Math.abs(best.c - expect[k]) < span / n * 0.6 ? best.c : Math.max(lo, Math.round(expect[k])); cuts.push(c); prev = c; } }
    const edges = [0].concat(cuts.map(c => c * F), [pcm.length]);
    return weights.map((_, k) => pcm.slice(edges[k], edges[k + 1]));
  }
  async function batchVoices(from, to, onWait, onStep) {
    if (plan.style !== "cartoon" || engine() !== "ai") return;
    const items = [];
    for (let i = from; i < to; i++) {
      if (voices[i]) continue;
      const sl = plan.slides[i], text = sl.narration || sl.heading || " ", who = sl.who === "B" || sl.who === "N" ? sl.who : "A", voice = voiceOf(sl.who), ck = voiceCk(text, voice, sl.who, sl.mood);
      if (ttsCache.has(ck) || (await idb.get(ck))) continue;
      items.push({ i, text, who, voice, ck });
    }
    const chunks = []; let cur = [];
    for (const it of items) {
      const spk = new Set(cur.map(x => x.who).concat(it.who)), chars = cur.reduce((x, y) => x + y.text.length, 0) + it.text.length;
      if (cur.length && (spk.size > 2 || cur.length >= 10 || chars > 900 || it.i !== cur[cur.length - 1].i + 1)) { chunks.push(cur); cur = []; }
      cur.push(it);
    }
    if (cur.length) chunks.push(cur);
    let done = 0;
    for (const ch of chunks) {
      if (onStep) onStep(done, items.length);
      if (ch.length === 1) { await aiVoice(ch[0].text, ch[0].voice, plan.slides[ch[0].i].who, plan.slides[ch[0].i].mood, onWait); done++; continue; }
      const label = w => w === "N" ? (EN() ? "Narrator" : "Kathavachak") : String(plan.names[w] || w).replace(/[^\p{L}\p{N} ]/gu, "").trim() || w;
      const whos = [...new Set(ch.map(x => x.who))];
      const tone = EN() ? `Read this animated-video conversation aloud. Natural, expressive, real emotions and reactions (laugh, surprise, scolding, seriousness as the words suggest) — not robotic. Leave a clear short pause between lines. Keep each person's voice the same throughout. ${whos.includes("N") ? "The Narrator is a warm, gripping storyteller. " : ""}\n\n`
        : `Ye cartoon video ki baatcheet Hindi mein zor se padho. Bilkul asli, bhavna ke saath — jahan mazaak ho wahan hansi, daant ho to daant, gambhir baat pe gambhir; robot ya news reader jaisa nahi. Har line ke baad saaf chhota sa thehrav do. Har kirdaar ki awaaz shuru se aakhir tak wahi rahe. ${whos.includes("N") ? "Kathavachak garm, rochak kahani sunane wala hai. " : ""}\n\n`;
      const body = { contents: [{ role: "user", parts: [{ text: tone + ch.map(x => label(x.who) + ": " + x.text).join("\n") }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: whos.length === 2
          ? { multiSpeakerVoiceConfig: { speakerVoiceConfigs: whos.map(w => ({ speaker: label(w), voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceOf(w) } } })) } }
          : { voiceConfig: { prebuiltVoiceConfig: { voiceName: ch[0].voice } } } } };
      const wav = await ttsCall(body, onWait);
      const { pcm, rate } = wavPcm(wav), parts = splitTake(pcm, rate, ch.map(x => Math.max(4, x.text.length)));
      ch.forEach((x, k) => { const b2 = pcmWav(parts[k], rate); ttsCache.set(x.ck, b2.slice(0)); idb.put(x.ck, b2.slice(0)); });
      done += ch.length;
    }
  }

  // 🎙️ teleprompter: big script on screen, record, stop
  async function recordSlide(i) {
    readEdits();
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { toast("Mic ki ijazat nahi mili"); return; }
    const mt = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(m => MediaRecorder.isTypeSupported(m)) || "";
    const rec = new MediaRecorder(stream, mt ? { mimeType: mt } : {});
    const parts = []; rec.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
    openSheet(`<h3>🎙️ Slide ${i + 1} — padho</h3>
      <div style="font-size:1.45em;line-height:1.6;padding:12px;background:var(--bg);border-radius:12px;max-height:45vh;overflow:auto">${esc(plan.slides[i].narration || plan.slides[i].heading)}</div>
      <p class="small muted" id="rt">⏺️ Recording… araam se, bol-chaal ki tarah padho</p>
      <div class="row"><button class="btn primary" id="rstop">⏹ Ho gaya</button><button class="btn" id="rcancel">✕ Radd</button></div>`, root => {
      const t0 = Date.now(); const iv = setInterval(() => { const el = $("#rt", root); if (el) el.textContent = "⏺️ Recording… " + Math.floor((Date.now() - t0) / 1000) + " sec"; }, 500);
      const end = keep => { clearInterval(iv); rec.onstop = async () => {
          stream.getTracks().forEach(t => t.stop()); closeSheet();
          if (!keep || !parts.length) return;
          const blob = new Blob(parts, { type: mt || "audio/webm" });
          try {
            const ac = new (window.AudioContext || window.webkitAudioContext)();
            const buf = await ac.decodeAudioData(await blob.arrayBuffer()); ac.close();
            voices[i] = { blob, dur: buf.duration };
          } catch (e) { toast("Recording padh nahi paya — dobara karo"); }
          drawEditor();
        }; rec.stop(); };
      $("#rstop", root).onclick = () => end(true);
      $("#rcancel", root).onclick = () => end(false);
    });
    rec.start();
  }
  const W = 1280, H = 720;

  const LENGTHS = { short: ["📱 Short (~35 sec, khadi) — subscriber badhane ko", 3], mid: ["▶️ 3 minute (aadi) — watch time / kamaai", 6], long: ["▶️ 6 minute (aadi) — watch time / kamaai", 10] };
  const IDEAS = [
    "Kya police bina warrant giraftar kar sakti hai?", "FIR na likhe to kya karein?", "Zero FIR kya hoti hai?",
    "Bail kaise milti hai aur kitne din lagte hain?", "Anticipatory bail kab leni chahiye?",
    "Talaaq ke baad patni ko gujara kitna milta hai?", "Beti ka pita ki property mein kitna hissa?",
    "Will (vasiyat) na ho to property kaise bantegi?", "Kirayedar ghar khaali na kare to kya karein?",
    "Cheque bounce ho gaya — kya karein?", "Online fraud ho gaya — paisa wapas kaise milega?",
    "Consumer court mein shikayat kaise karein?", "RTI kaise lagayein?", "Police thane mein mahila ke adhikar",
    "Giraftari ke baad 24 ghante ka niyam kya hai?", "Domestic violence mein mahila kya kar sakti hai?",
    "Zameen pe kabza ho gaya — kya karein?", "Salary nahi mili — kahan shikayat karein?",
    "Accident claim (MACT) kaise milta hai?", "Kya police phone check kar sakti hai?",
  ];

  const GCATS = {
    india: ["🇮🇳 India explained", ["Why do Indians celebrate Diwali?", "Holi: the festival of colors, explained", "Kumbh Mela: the biggest gathering on Earth", "What is an Indian thali?", "Why does Indian food use so many spices?", "Why are cows sacred in India?", "Indian weddings: why are they so big?", "Ramayana in 5 minutes", "Mahabharata: the epic of epics", "Why do Indians eat with their hands?", "Indian trains: a country on wheels", "Namaste: what it really means"]],
    hindi: ["🗣️ Learn Hindi", ["Say hello in Hindi: Namaste and more", "10 Hindi words every traveler needs", "Count 1 to 10 in Hindi", "How to order food in Hindi", "English words that came from Hindi", "Hindi for shopping in an Indian market", "Family words in Hindi", "Polite Hindi: please, thank you, sorry"]],
    how: ["🔬 How it works", ["How does GPS know where you are?", "How does the internet reach your phone?", "How does AI chat actually work?", "Why is the sky blue?", "Why do we need sleep?", "How do noise-cancelling headphones work?", "How does a microwave heat food?", "Why do we get hiccups?"]],
    history: ["📜 History stories", ["The Taj Mahal: a love story in marble", "Chanakya: India's ancient strategist", "Emperor Ashoka: from war to peace", "How did money begin?", "The Indus Valley: a city before its time", "Zero: India's gift to the world"]],
    mind: ["💡 Habits & mind", ["Why we procrastinate (and how to stop)", "How to build a habit that sticks", "What your phone does to your attention", "Why we remember embarrassing moments", "How to fall asleep faster"]],
    money: ["💰 Money basics", ["Compound interest, explained simply", "Budgeting in 3 easy steps", "Needs vs wants", "What is inflation?", "Why emergency funds matter"]],
    scam: ["🛡️ Scam safety", ["5 signs a message is a scam", "How to spot a fake job offer", "Investment scam red flags", "What to do first if you've been scammed", "Romance scams: the warning signs"]],
  };
  const GCAT_NOTE = {
    india: "Explain the meaning and story behind it, and how people actually experience it today; mention that customs vary across India's regions. Respectful and curious, never exotic or mocking.",
    hindi: "This is a mini Hindi lesson. B teaches 4-6 Hindi words/phrases. For each: B says it in Latin letters with a pronunciation hint and the meaning; A tries it (sometimes a little wrong, B kindly corrects, both laugh). For lesson lines the 'key' MUST be: Devanagari · romanization · meaning, e.g. 'नमस्ते · Namaste · Hello'. End with a quick recap of all words.",
    how: "Explain step by step with one simple everyday analogy; no jargon without a plain explanation.",
    history: "Tell it like a story with a surprising twist; clearly separate legend from fact ('legend says…'); no invented dates or quotes.",
    mind: "Practical, commonly accepted tips stated generally; no medical claims or diagnoses; suggest seeing a professional for serious problems.",
    money: "General financial literacy only. No specific stock, fund, crypto or product recommendations, no promised returns; B says once 'this isn't financial advice'.",
    scam: "Practical red flags and first steps: stop contact, call your bank, report to local authorities. Never promise money will be recovered; rules differ by country.",
  };
  const GFMT = {
    qa: "Friendly Q&A: A asks what a viewer would ask, B answers with vivid examples.",
    myth: "Myth vs Fact: A brings 3-4 common myths, B reveals the fact behind each.",
    top: "Top 5 countdown: B counts down 5 surprising points from #5 to #1, A reacts.",
    story: "Mini story: B tells it as a story with a twist; A interrupts with funny questions.",
  };
  const IDEAS_EN = [
    "5 signs a message is a scam", "How online scammers trick smart people", "What to do in the first hour after a cyber fraud",
    "How to spot a fake job offer", "Investment scam red flags everyone should know", "Strange laws in India you won't believe",
    "How India's court system works in 5 minutes", "Why court cases in India take so long", "Famous Indian Supreme Court cases, simply explained",
    "What happens after an arrest in India?", "Is your phone listening to you? Privacy basics", "Identity theft: first steps to protect yourself",
  ];
  // keep the script safe across app restarts (own photos/recordings can't be kept)
  function savePlan() {
    if (!plan) return;
    try { S.set(K("vPlan"), JSON.parse(JSON.stringify(plan, (k, v) => (k === "photo" && v && v.own ? null : v)))); } catch (e) { /* ignore */ }
  }
  function restorePlan() {
    if (plan) return;
    const p = S.get(K("vPlan"), null);
    if (p && Array.isArray(p.slides) && p.slides.length) { plan = p; plan.slides.forEach(x => { if (x.photo) loadImg(x.photo.url); }); }
  }
  // 🎭 tone: plain and useful (default) or fun (jokes, rhyme, playful scolding)
  const toneSel = () => `<select id="vtone"><option value="seedha" ${S.get(K("vTone"), "seedha") === "seedha" ? "selected" : ""}>🎯 Seedha aur kaam ka (bina zabardasti mazaak)</option><option value="mazedaar" ${S.get(K("vTone"), "seedha") === "mazedaar" ? "selected" : ""}>😄 Mazedaar (chutkule, shayari, nok-jhonk)</option></select>`;
  // 🔎 before writing: a short fact sheet from Google Search, so the script is specific and correct
  async function research(topic, g) {
    const q = g ? `List 6-8 specific, verified facts about this topic that most people don't know — exact numbers, dates, real examples, common myths and the truth, practical tips. One short line each, as a bullet list. Only what reliable sources confirm; skip anything uncertain. No intro, no conclusion.
Topic: ${topic}`
      : `Is vishay par 6-8 khaas, pakke tathya do jo aam log nahi jaante — sahi numbers, tareekh, asli udaharan, aam galtiyan aur sach, kaam ki tips. Har tathya ek chhoti line, bullet list, Hinglish mein. Sirf wahi jo bharosemand sources se pakka ho; shaq ho to chhod do. Koi intro ya ant nahi.
Vishay: ${topic}`;
    try {
      const r = await G.ask([{ role: "user", parts: [{ text: q }] }], { system: g ? "You are a careful fact researcher." : "Tum ek savdhan tathya-khoji (researcher) ho.", web: true, onPart: () => {}, onStatus: t => { $("#vmsg").textContent = "🔎 " + t; } });
      return String(r.text || "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 2500);
    } catch (e) { return ""; }
  }
  function render(m) {
    if (m && m !== mode) {
      plans[mode] = plan; mode = m; plan = plans[mode] || null;
      Object.keys(voices).forEach(k => delete voices[k]); Object.keys(photos).forEach(k => delete photos[k]);
    }
    restorePlan(); look3d = !!S.get("vLook3d", true);
    if (mode === "g") return renderGlobal();
    $("#view").innerHTML = `<div class="wrap"><div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:6px 0">🎬 Video banao</h2>${IS_APP ? '<button class="btn" id="vmine">📁 Meri videos</button>' : ""}</div>
      ${(() => { const mk = S.get("vMaking", null); if (!mk) return ""; S.del("vMaking"); S.set("vLow", true);
        return `<div class="banner" style="border-color:#e66">⚠️ Pichhli video beech mein ruk gayi thi (ruki: <b>${esc(mk.stage || "?")}</b>). Aksar phone ki memory kam padne se hota hai. Maine <b>📉 Halki quality</b> chalu kar di hai — dobara banao, aur banate waqt app mat chhodna.</div>`; })()}
      <div class="banner">✅ Sirf apna original content (doosron ki video/gaana mat daalna). ⚖️ Peedit ka naam kabhi nahi, judge pe ilzaam nahi, parties "A aur B". Upload se pehle script ek baar khud padh lena.</div>
      <div class="card">
        <div class="row" style="align-items:flex-end"><label class="field" style="flex:1">✨ Kuch bhi likho — ek shabd bhi chalega<input id="vq" placeholder="Jaise: Taj Mahal · helmet · cheque bounce · online fraud"></label>${Voice.canListen() ? '<button class="btn" id="vmic" title="Bolkar likho">🎤</button>' : ""}</div>
        <p class="muted small" style="margin-top:-4px">AI khud usse achha sawaal/kahani chunkar poori script likh dega.</p>
        <div class="toggles" style="flex-wrap:wrap">${IDEAS.map(q => `<button class="tg" data-idea="${esc(q)}">${esc(q)}</button>`).join("")}</div>
        <label class="field">⚖️ Judgment / tathya (optional — Court app ka saar yahan paste karo)<textarea id="vtopic" rows="4" placeholder="Jaise: Arnesh Kumar vs State of Bihar (2014) — 7 saal se kam saza wale case mein turant giraftari nahi…"></textarea></label>
        <div class="row"><label class="field" style="flex:1">Lambai<select id="vlen">${Object.entries(LENGTHS).map(([k, v]) => `<option value="${k}" ${k === "mid" ? "selected" : ""}>${v[0]}</option>`).join("")}</select></label>
        <label class="field" style="flex:1">Channel ka naam<input id="vch" value="${esc(S.get(K("vChannel"), ""))}" placeholder="Jaise: Kanoon Aasaan"></label></div>
        <div class="row"><label class="field" style="flex:1">Andaaz<select id="vstyle">
          <option value="cartoon" ${S.get(K("vStyle"), "slides") === "cartoon" ? "selected" : ""}>🧑‍🤝‍🧑 Do cartoon aapas mein baat karein</option>
          <option value="kahani" ${S.get(K("vStyle"), "slides") === "kahani" ? "selected" : ""}>🎬 Kahani / short film (narrator + kai jagah)</option>
          <option value="slides" ${S.get(K("vStyle"), "slides") === "slides" ? "selected" : ""}>📸 Asli photos + ek awaaz (documentary — sabse saaf look)</option></select></label>
          <label class="field" style="flex:1">🎭 Lehja${toneSel()}</label></div>
        <label class="field">🗣️ Bolchaal<select id="vbol"><option value="saaf" ${S.get("vBol2", "saaf") === "saaf" ? "selected" : ""}>Saaf aam bhasha (koi gaali nahi) — YouTube kamaai ke liye behtar</option><option value="desi" ${S.get("vBol2", "saaf") === "desi" ? "selected" : ""}>Desi tapori bhasha (kabhi-kabhi halki gaali)</option></select></label>
        <div class="row" id="vacts"><label class="field" style="flex:1">🎭 Kirdaar A<select id="vaa">${Object.entries(ROSTER).map(([k, r]) => `<option value="${k}" ${S.get(K("vActA"), "pappu") === k ? "selected" : ""}>${r[0]}</option>`).join("")}</select></label><label class="field" style="flex:1">🎭 Kirdaar B<select id="vab">${Object.entries(ROSTER).map(([k, r]) => `<option value="${k}" ${S.get(K("vActB"), "chacha") === k ? "selected" : ""}>${r[0]}</option>`).join("")}</select></label></div>
        <div class="row" id="vnames"><label class="field" style="flex:1">🙋 Sawaal puchne wala<input id="vna" value="${esc(S.get("vNameA", "Pappu"))}"></label>
          <label class="field" style="flex:1">👴 Samjhane wale<input id="vnb" value="${esc(S.get("vNameB", "Chacha"))}"></label></div>
        <button class="btn primary wide" id="vplan">✍️ Script banao</button>
        <div id="vmsg" class="small" style="margin-top:6px"></div>
      </div>
      <div id="vedit"></div></div>`;
    $("#vplan").onclick = makePlan; bindActors(); bindMic();
    if ($("#vmine")) $("#vmine").onclick = myVideos;
    const sn = () => { $("#vnames").hidden = $("#vacts").hidden = $("#vstyle").value === "slides"; };
    $("#vstyle").onchange = () => { S.set(K("vStyle"), $("#vstyle").value); sn(); }; sn();
    $$("[data-idea]").forEach(b => b.onclick = () => { $("#vq").value = b.dataset.idea; });
    if (plan) drawEditor();
  }

  // 📁 list of videos this app made, with play / share
  async function myVideos() {
    openSheet(`<h3>📁 Meri videos</h3><div id="mvl"><span class="dots"><i></i><i></i><i></i></span></div>
      <p class="small muted">Gallery mein bhi milengi: <b>Movies → Sahayak</b> (purani: Download → Sahayak)</p>
      <button class="btn" id="mvx">Band karo</button>`, root => { $("#mvx", root).onclick = closeSheet; });
    const r = await nativeCall("listMedia");
    const box = $("#mvl"); if (!box) return;
    const items = (r && r.items) || [];
    if (!items.length) { box.innerHTML = '<p class="muted">Abhi koi video nahi mili.</p>'; return; }
    box.innerHTML = items.slice(0, 40).map((v, i) => `<div class="row" style="justify-content:space-between;align-items:center;border-bottom:1px solid var(--line,#ddd);padding:6px 0">
      <div class="small"><b>${esc(v.name)}</b><br>${new Date(v.date * 1000).toLocaleString("hi-IN", { dateStyle: "medium", timeStyle: "short" })} · ${(v.size / 1048576).toFixed(1)} MB</div>
      <div class="row"><button class="btn" data-mvp="${i}">▶️</button><button class="btn" data-mvs="${i}">📤</button></div></div>`).join("");
    $$("[data-mvp]").forEach(b => b.onclick = () => { const v = items[+b.dataset.mvp]; window.Native.openMedia(v.uri, v.mime); });
    $$("[data-mvs]").forEach(b => b.onclick = () => { const v = items[+b.dataset.mvs]; window.Native.shareMedia(v.uri, v.mime); });
  }
  function crashBanner() {
    const mk = S.get("vMaking", null); if (!mk) return ""; S.del("vMaking"); S.set("vLow", true);
    return `<div class="banner" style="border-color:#e66">⚠️ Pichhli video beech mein ruk gayi thi (ruki: <b>${esc(mk.stage || "?")}</b>). Aksar phone ki memory kam padne se hota hai. Maine <b>📉 Halki quality</b> chalu kar di hai — dobara banao, aur banate waqt app mat chhodna.</div>`;
  }
  // 🌍 global English channel: Leo (curious traveler) + Priya (Indian friend)
  function renderGlobal() {
    const cat = S.get("vCat_g", "india");
    $("#view").innerHTML = `<div class="wrap"><div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:6px 0">🌍 Global channel <small class="muted">(English)</small></h2>${IS_APP ? '<button class="btn" id="vmine">📁 Meri videos</button>' : ""}</div>
      ${crashBanner()}
      <div class="banner">✅ Sirf original content. Tathya sahi hon, kisi desh/dharm/samuday ka mazaak nahi. ⚠️ YouTube ek jaisi template wali videos ki kamaai rok deta hai — isliye har baar topic, format aur 2-3 line apni taraf se badlo.</div>
      <div class="card">
        <label class="field">📂 Vishay<select id="vcat">${Object.entries(GCATS).map(([k, v]) => `<option value="${k}" ${k === cat ? "selected" : ""}>${v[0]}</option>`).join("")}</select></label>
        <div class="toggles" style="flex-wrap:wrap" id="vchips"></div>
        <div class="row" style="align-items:flex-end"><label class="field" style="flex:1">✨ Kuch bhi likho — ek shabd bhi chalega<input id="vq" placeholder="e.g. Taj Mahal · Holi · chai · GPS"></label>${Voice.canListen() ? '<button class="btn" id="vmic" title="Bolkar likho">🎤</button>' : ""}</div>
        <p class="muted small" style="margin-top:-4px">Hindi ya English, kuch bhi likho — AI khud achha angle chunkar English script likhega.</p>
        <label class="field">📝 Apne notes / pakke tathya (optional)<textarea id="vtopic" rows="3" placeholder="Jo baat zaroor aani chahiye, ya kisi bharosemand source ki line…"></textarea></label>
        <div class="row"><label class="field" style="flex:1">Lambai<select id="vlen">${Object.entries(LENGTHS).map(([k, v]) => `<option value="${k}" ${k === "short" ? "selected" : ""}>${v[0]}</option>`).join("")}</select></label>
          <label class="field" style="flex:1">Format<select id="vfmt"><option value="auto">🎲 Har baar alag (behtar)</option><option value="qa">💬 Sawaal-jawaab</option><option value="myth">❌✅ Myth vs Fact</option><option value="top">🔢 Top 5</option><option value="story">📖 Kahani</option></select></label></div>
        <div class="row" id="vacts"><label class="field" style="flex:1">🎭 Kirdaar A<select id="vaa">${Object.entries(ROSTER).map(([k, r]) => `<option value="${k}" ${S.get(K("vActA"), "leo") === k ? "selected" : ""}>${r[0]}</option>`).join("")}</select></label><label class="field" style="flex:1">🎭 Kirdaar B<select id="vab">${Object.entries(ROSTER).map(([k, r]) => `<option value="${k}" ${S.get(K("vActB"), "priya") === k ? "selected" : ""}>${r[0]}</option>`).join("")}</select></label></div>
        <div class="row"><label class="field" style="flex:1">🧳 Sawaal puchne wala<input id="vna" value="${esc(S.get("vNameA_g", "Leo"))}"></label>
          <label class="field" style="flex:1">🙋‍♀️ Samjhane wali<input id="vnb" value="${esc(S.get("vNameB_g", "Priya"))}"></label></div>
        <div class="row"><label class="field" style="flex:1">Andaaz<select id="vstyle"><option value="cartoon" ${S.get("vStyle_g", "cartoon") === "cartoon" ? "selected" : ""}>🧑‍🤝‍🧑 Baatcheet (Short ke liye best)</option><option value="kahani" ${S.get("vStyle_g", "cartoon") === "kahani" ? "selected" : ""}>🎬 Kahani / short film (narrator + scenes)</option><option value="slides" ${S.get("vStyle_g", "cartoon") === "slides" ? "selected" : ""}>📸 Real photos + one voice (documentary)</option></select></label>
          <label class="field" style="flex:1">🎭 Lehja${toneSel()}</label></div>
        <label class="field">Channel ka naam<input id="vch" value="${esc(S.get("vChannel_g", ""))}" placeholder="e.g. Hello India"></label>
        <button class="btn primary wide" id="vplan">✍️ Script banao</button>
        <div id="vmsg" class="small" style="margin-top:6px"></div>
      </div>
      <div class="card" id="vauto"></div>
      <div class="card" id="vabroad"></div>
      <div id="vedit"></div></div>`;
    drawAuto(); autoSchedule();
    if (typeof Trends !== "undefined") Trends.abroadPanel($("#vabroad"), t => { $("#vq").value = t; $("#vq").scrollIntoView({ behavior: "smooth", block: "center" }); toast("Vishay bhar diya — ab ✍️ Script banao"); });
    const chips = () => {
      const c = $("#vcat").value; S.set("vCat_g", c);
      $("#vchips").innerHTML = GCATS[c][1].map(q => `<button class="tg" data-idea="${esc(q)}">${esc(q)}</button>`).join("");
      $$("[data-idea]").forEach(b => b.onclick = () => { $("#vq").value = b.dataset.idea; });
      $("#vfmt").disabled = c === "hindi";
    };
    $("#vcat").onchange = chips; chips(); bindActors(); bindMic();
    if ($("#vmine")) $("#vmine").onclick = myVideos;
    $("#vplan").onclick = makePlan;
    if (plan) drawEditor();
  }

  function globalPrompt(topic, nA, nB, cat, fmt, nl, entOverride, extra) {
    return `Write a script for an animated YouTube video for an international audience (US, UK, worldwide). Two ORIGINAL cartoon characters talk:\n` +
      `A = "${nA}": a curious, friendly traveler from abroad who asks what viewers would ask, reacts honestly, sometimes gets things funny-wrong.\n` +
      `B = "${nB}": a warm, witty young Indian woman who explains simply with vivid everyday examples.\n\n` +
      `Topic area: ${GCATS[cat][0]}. ${GCAT_NOTE[cat]}\nTopic: ${topic}\n` + (cat === "hindi" ? "" : `Format: ${GFMT[fmt]}\n`) +
      `\nStyle: natural spoken English, short sentences, contractions, light clean humor, real reactions ("wait, what?", "no way!"). The very first line must hook in 3 seconds with a surprising fact or question. Vary rhythm. Never say "in this video we will". No filler, no repeated catchphrases. End: B gives a one-line recap, A asks viewers a question for the comments, then a quick "subscribe for more".\n` +
      `Accuracy and respect (strict): only well-established facts; never invent numbers, dates, names or quotes — if unsure, say it more generally. Respect every culture and religion: explain, never mock; no stereotypes; humor is never at a group's expense. No song lyrics or movie dialogue. No guarantees or personal advice.\n` +
      `Return ONLY valid JSON: {"title":"(max 60 chars, curiosity-driven but honest)","description":"(3-5 lines; end with: 'Made for learning and fun. We check facts carefully, but tell us in the comments if we missed something!')","tags":["..."],"thumbnail_text":"(3-5 punchy words)","lines":[{"who":"A or B","text":"(1-2 short spoken sentences)","key":"(2-5 words for the board)","emoji":"(1 emoji)","mood":"(normal | funny | serious | daant | shayari)","scene":"(${SCN_LIST()})","photo":"(1-4 word English search for a REAL photo of the place/thing being discussed, e.g. 'Taj Mahal', 'Diwali diya', 'GPS satellite'; reuse the same words while the subject stays the same; empty if nothing visual; never a person's name)"}]}\n` +
      `About ${nl} lines, mostly alternating (sometimes one speaker says two lines).\n` +
      `STAGE: add top-level "cast":{"A":"(${DRS_LIST})","B":"(same list)"} — costumes for this story (e.g. one plays a shopkeeper, the other a police officer); "none" = their usual clothes. For each line pick "scene" where it happens; keep the same scene for several lines and change only when the story moves. Costumed characters still only share general information, never personal legal/medical/financial advice.\n` +
      (entOverride || `ENTERTAINMENT (very important — it must be fun to watch, not a dry answer): include 2-3 clean jokes or puns that fit the moment (mood "funny"), ` +
      `one short ORIGINAL two-line rhyme or poetic line, e.g. B sums up a point in verse (mood "shayari"; never quote famous poems or lyrics), ` +
      `one moment where ${nB} playfully scolds ${nA} for a silly idea or mistake (mood "daant"; affectionate, never mean), ` +
      `and 1-3 serious beats where the topic needs respect or care (mood "serious"). Everything else "normal". Mix the moods so the energy goes up and down. Humor never targets a religion, culture, country, gender or any group.`) + (extra || "");
  }

  function bindMic() {
    const b = $("#vmic"); if (!b) return;
    b.onclick = async () => { b.disabled = true; b.textContent = "👂"; try { const t = await Voice.listen(); if (t) $("#vq").value = t; } catch (e) { toast(e.message || "Suna nahi"); } b.disabled = false; b.textContent = "🎤"; };
  }
  // picking a different actor also fills in their name and a matching voice
  function bindActors() {
    ["A", "B"].forEach(k => { const el = $("#va" + k.toLowerCase()); if (!el) return;
      el.onchange = () => { const r = ROSTER[el.value]; S.set(K("vAct" + k), el.value); $("#vn" + k.toLowerCase()).value = r[0];
        S.set(K("vVoice" + k), r[2] ? (k === "A" ? "Kore" : "Aoede") : (k === "A" ? "Puck" : "Charon")); };
    });
  }
  // Parse the AI's JSON; if it got cut off, keep every complete line it did send.
  // Reads the AI's script even when it is nested ({scenes:[{lines:[…]}]}), a bare array, uses other key
  // names (speaker/dialogue/narration) or was cut off midway (keeps every finished line).
  function readScript(txt) {
    const raw = String(txt || "").replace(/```(?:json)?/gi, "");
    const TXT = o => o && typeof o === "object" && !Array.isArray(o) ? ["text", "narration", "line", "dialogue", "says", "speech"].find(k => typeof o[k] === "string" && o[k].trim()) : null;
    const isLine = o => !!TXT(o) && ["who", "speaker", "character", "by", "name"].some(k => typeof o[k] === "string");
    const fix = (o, sc) => { const k = TXT(o), l = { ...o, text: String(o[k]) }; l.who = String(o.who || o.speaker || o.character || o.by || o.name || "A"); if (!l.scene && sc) l.scene = sc; return l; };
    const headOf = j => ({ title: j.title || "", description: j.description || "", thumbnail_text: j.thumbnail_text || "", tags: Array.isArray(j.tags) ? j.tags : [], cast: j.cast, legal: j.legal });
    const walk = (node, sc, out) => {
      if (Array.isArray(node)) { node.forEach(x => walk(x, sc, out)); return; }
      if (!node || typeof node !== "object") return;
      if (isLine(node)) { out.push(fix(node, sc)); return; }
      const s2 = typeof node.scene === "string" ? node.scene : typeof node.location === "string" ? node.location : sc;
      Object.keys(node).forEach(k => { if (node[k] && typeof node[k] === "object") walk(node[k], s2, out); });
    };
    let j = null;
    for (const c of [raw.trim(), raw.replace(/^[\s\S]*?([{[])/, "$1").replace(/[}\]][^}\]]*$/, m => m[0])]) { try { j = JSON.parse(c); break; } catch (e) { /* next */ } }
    if (j) {
      if (!Array.isArray(j) && Array.isArray(j.slides) && j.slides.length && !j.lines) return j;
      const lines = []; walk(j, "", lines);
      if (lines.length >= 3) return { ...(Array.isArray(j) ? { title: "", description: "", thumbnail_text: "", tags: [] } : headOf(j)), lines };
    }
    // Salvage: every complete {…} that is a line (any depth), in order
    const lines = [], slides = [], stack = []; let inStr = false, esc = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === "{") stack.push(i);
      else if (ch === "}" && stack.length) {
        const st = stack.pop(); let o = null;
        try { o = JSON.parse(raw.slice(st, i + 1)); } catch (e) { o = null; }
        if (isLine(o)) lines.push({ at: st, l: fix(o, "") });
        else if (o && typeof o.narration === "string" && !Object.values(o).some(v => v && typeof v === "object" && !Array.isArray(v))) slides.push({ at: st, l: o });
      }
    }
    const head = k => { const m = new RegExp('"' + k + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"').exec(raw); try { return m ? JSON.parse('"' + m[1] + '"') : ""; } catch (e) { return ""; } };
    const out = { title: head("title"), description: head("description"), thumbnail_text: head("thumbnail_text"), tags: [], cut: true };
    const castM = /"cast"\s*:\s*(\{[^}]*\})/.exec(raw); if (castM) try { out.cast = JSON.parse(castM[1]); } catch (e) { /* ignore */ }
    if (lines.length >= 3) { out.lines = lines.sort((a, b) => a.at - b.at).map(x => x.l); return out; }
    if (slides.length >= 3) { out.slides = slides.sort((a, b) => a.at - b.at).map(x => x.l); return out; }
    return null;
  }
  let photosP = Promise.resolve();
  async function makePlan() {
    const q = $("#vq").value.trim(), facts = $("#vtopic").value.trim();
    if (q.length < 2 && facts.length < 15) { toast("Kuch to likho — jaise: Taj Mahal"); return false; }
    const shortIdea = q && q.split(/\s+/).length <= 4 && !/[?？]/.test(q);
    const g = mode === "g";
    const IDEA_HI = shortIdea ? `\n(Owner ne sirf ek chhota vishay/shabd likha hai: "${q}". Tum khud is par sabse rochak aur kaam ka angle chuno — log is baare mein kya jaanna chahte hain, koi chaunkane wala sach ya aam galti — aur usi par poori script likho. Agar ye vishay kanoon/police/court/haq se juda NAHI hai (jaise koi jagah, tyohaar, itihaas, khana), to kanoon wali baatein (vakil se milo, kanooni salah nahi) mat thoonso — sirf pakki, sahi aam jaankari do; baaki sab niyam wahi rahenge.)` : "";
    const IDEA_EN = shortIdea ? `\n(The creator only typed a short idea: "${q}" (it may be in Hindi). Pick the most interesting, accurate angle on it yourself — a surprising fact, a common myth, or a little story — and write the full script in English. If it doesn't fit the chosen topic area, follow the idea anyway.)` : "";
    const topic = g ? q + IDEA_EN + (facts ? "\nMust-include notes from the creator:\n" + facts : "") : (shortIdea ? "Vishay: " + q : "Sawaal: " + (q || "(tathya se banao)")) + IDEA_HI + (facts ? "\nJudgment / tathya:\n" + facts : "");
    S.set(K("vChannel"), $("#vch").value.trim());
    const len = $("#vlen").value, n = LENGTHS[len][1], style = $("#vstyle") ? $("#vstyle").value : "cartoon", isK = style === "kahani";
    S.set(K("vStyle"), style);
    const bol = !g && $("#vbol") ? $("#vbol").value : "saaf"; if (!g && $("#vbol")) S.set("vBol2", bol);
    const tone = $("#vtone") ? $("#vtone").value : "seedha"; S.set(K("vTone"), tone); const fun = tone === "mazedaar";
    const BOL = bol === "desi"
      ? `BHASHA: bilkul aam Bharatiya bolchaal — jaise gali-mohalle, chai ki dukaan pe log baat karte hain: chhote vakya, "arre yaar", "abe", "bhai", "chal hat", "kya bakwaas hai", aadhe-adhoore vakya, Hindi-English mix (jaise "tension mat le", "full confusion"). Kitaabi Hindi bilkul nahi. Gaali sirf HALKI aur kabhi-kabhi: poori video mein zyada se zyada 2-3 baar, sirf "saala", "kutta", "kamina", "gadha", "ullu" jaise shabd, sirf gusse ya mazaak ke pal mein, aur pehli 15 second mein bilkul nahi. Isse zyada gandi gaali, maa-behen ki gaali, jaati/dharm/aurat/viklang ke liye apmaanjanak shabd, ya peedit ko gaali KABHI nahi. `
      : `BHASHA: bilkul aam Bharatiya bolchaal — chhote vakya, "arre yaar", "bhai", Hindi-English mix; kitaabi Hindi nahi; koi gaali nahi. `;
    const nA = ($("#vna").value.trim() || (g ? "Leo" : "Pappu")).slice(0, 20), nB = ($("#vnb").value.trim() || (g ? "Priya" : "Chacha")).slice(0, 20);
    const en = false;
    S.set(K("vNameA"), nA); S.set(K("vNameB"), nB);
    const actors = { A: $("#vaa") ? $("#vaa").value : DEF_ACT[mode].A, B: $("#vab") ? $("#vab").value : DEF_ACT[mode].B };
    const fem = k => !!(ROSTER[actors[k]] || [])[2];
    const GEN = g ? `\n(${nA} is ${fem("A") ? "a woman" : "a man"}; ${nB} is ${fem("B") ? "a woman" : "a man"} — ${ROSTER[actors.B] ? ROSTER[actors.B][1] : ""}.)`
      : `\n(${nA} ${fem("A") ? "ek aurat/ladki hai — uske liye stri-ling kriya likho (karti hai, gayi)" : "ek aadmi/ladka hai"}; ${nB} ${fem("B") ? "ek aurat hai — stri-ling kriya (kehti hai, samjhaati hai)" : "ek aadmi hai"}, ${ROSTER[actors.B] ? ROSTER[actors.B][1] : ""}.)`;
    const cat = g ? $("#vcat").value : "law";
    let fmt = g ? $("#vfmt").value : "";
    if (fmt === "auto") { const all = Object.keys(GFMT).filter(f => f !== S.get("vFmtLast_g", "")); fmt = all[Math.floor(Math.random() * all.length)]; }
    if (g) S.set("vFmtLast_g", fmt);
    const LANG = en ? `\n\nBHASHA (sabse zaroori): title, description, tags, thumbnail_text aur har line/narration/key/heading/points — SAB saral, natural English mein likho, videshi (US/UK/duniya ke) darshakon ke liye. Devanagari ya Hindi bilkul nahi. Indian shabd (FIR, thana, lakh) aaye to ek line mein samjhao. Disclaimer bhi English mein: "this is for education only, not legal advice — rules differ by country, talk to a qualified lawyer". Description ke aakhir mein: "⚠️ For education only. Not legal advice. No outcome is guaranteed." Kisi aur desh ka kanoon pakka pata na ho to uska daawa mat karo — kaho "rules differ by country". Comment wali line: "Has this happened to you? Tell us in the comments."` : "";
    const RULES = `KADE NIYAM: rape/yaun shoshan/POCSO/juvenile case mein peedit ya bachche ka naam ya pehchaan KABHI nahi; judge ya court ki niyat pe ilzaam nahi; chalte case mein kisi ko doshi mat kaho; aam logon (parties) ke naam ki jagah 'A aur B' ya 'pati/patni'; ` +
      `sirf wahi tathya jo diye gaye hain ya pakke aam kanooni gyaan ke hain — case naam, dhara ya saal apni taraf se mat banao (pakka na ho to dhara ka zikr mat karo); vakil ka prachaar/phone number nahi; "pakka milega"/"case jeet jaoge" jaisi koi guarantee nahi.`;
    const HEAD = `"legal":(true agar vishay kanoon/police/court/sarkari haq se juda hai, warna false),"title":"(60 akshar tak, Hindi+English mix chalega)","description":"(3-5 line + aakhir mein: '⚠️ Ye video sirf jaankari ke liye hai, kanooni salah nahi. Kisi nateeje ki guarantee nahi — apne case ke liye vakil se salah lein.')","tags":["..."],"thumbnail_text":"(4-6 shabd, bada asar)"`;
    const nl = (isK ? { short: 7, mid: 34, long: 64 } : { short: 6, mid: 30, long: 56 })[len], mins = { short: "35 second", mid: "3 minute", long: "6 minute" }[len];
    // spoken words needed for the length (English ~140/min, Hindi ~130/min incl. pauses)
    const WORDS = { short: 85, mid: mode === "g" ? 440 : 400, long: mode === "g" ? 880 : 800 }[len];
    // What keeps people watching (retention). Shorts: under 40 s, hook first. Long: no intro, promise + open loops.
    const KEEP_EN = len === "short"
      ? `\nSHORT VIDEO RULES (override anything above): this is a vertical YouTube Short — total spoken length UNDER 40 SECONDS (about 80-90 words in all), exactly ${nl} lines, max 12 words per line. Line 1 = the hook in under 8 words: a surprising fact, bold claim or question that creates curiosity (never a greeting, name or intro). Get to the payoff fast, one idea only. No "subscribe" outro — end on a punchline or a question that makes people comment or rewatch. Narrator lines only if really needed.`
      : `\nRETENTION RULES (very important): no intro or greeting — line 1 jumps straight into the most interesting moment or question. Within the first 15 seconds, promise what the viewer will get ("and the third one shocked me"). Keep 2-3 open loops (tease something, pay it off later). Something new every 15-20 seconds: a twist, a fact, a joke, a scene change. Keep the best surprise for the second half so people stay. Lines stay short (max 2 sentences).\nLENGTH (must): the video must run ${mins} — about ${nl} lines and about ${WORDS} spoken words in total. Do NOT stop early; if you run out of points, add a real example, a mini-story or a "did you know" fact.`;
    const KEEP_HI = len === "short"
      ? `\nSHORT KE NIYAM (upar ki har baat se zyada zaroori): ye khadi YouTube Short hai — poori bolne ki lambai 40 SECOND SE KAM (kul lagbhag 80-90 shabd), theek ${nl} lines, har line max 12 shabd. Line 1 = jhatka, 8 shabd se kam: chaunkane wala sach, bada daava ya sawaal (namaste/intro/naam bilkul nahi). Ek hi baat, jaldi jawab. Aakhir mein "subscribe" wali lambi line nahi — ek punchline ya sawaal jis par log comment karein. Narrator sirf zaroorat ho to.`
      : `\nLOG RUKE RAHEIN (bahut zaroori): koi intro/namaste nahi — pehli line seedha sabse dilchasp pal ya sawaal. Pehle 15 second mein vaada karo ki aage kya milega ("aur teesri baat sunke chaunk jaoge"). 2-3 jagah utsukta chhodo jo baad mein poori ho. Har 15-20 second mein kuch naya: mod, tathya, mazaak ya jagah badle. Sabse bada surprise doosre aadhe mein rakho. Lines chhoti (max 2 vakya).\nLAMBAI (zaroori): video ${mins} ki honi chahiye — lagbhag ${nl} lines aur kul lagbhag ${WORDS} bole jaane wale shabd. Jaldi khatam mat karo; baatein kam padein to ek asli udaharan, chhoti kahani ya "kya aap jaante ho" wala tathya jodo.`;
    // Writing standard (owner: scripts felt generic / AI-like) — every line must earn its place
    const STD_HI = `\nLIKHNE KA STANDARD (sabse zaroori): har line ek NAYI, khaas aur kaam ki baat de ya kahani aage badhaye — koi baat dohrao mat. Aam gol-mol baaton ki jagah khaas cheez: sahi number, asli zindagi ka udaharan, saaf step, aam galti aur sach. Aise likho jaise log asli mein bolte hain — chhote vakya, "aap" se seedhi baat, Hindi-English mix. Ye shabd/vakya BILKUL nahi: "aaiye jaante hain", "dosto", "is video mein", "bahut zaroori hai", "jaisa ki hum sab jaante hain", "aakhir mein" — aur koi bhi bharti ki line jo kuch naya na bataye. Tathya pakke na hon to number/naam mat banao, baat aam rakho.`;
    const STD_EN = `\nWRITING STANDARD (most important): every line must add a NEW, specific, useful point or move the story — never repeat a point. Replace vague statements with specifics: exact numbers, real-life examples, clear steps, a common mistake and the truth. Sound like a real person talking — short sentences, "you", contractions. Never use filler like "in this video", "let's dive in", "it's important to note", "as we all know", "in conclusion". If a fact is uncertain, don't invent numbers or names — say it more generally.`;
    const FUN_HI = fun ? null : `MANORANJAN: video seedhi, dilchasp aur kaam ki ho — zabardasti ke chutkule, shayari ya daant mat daalo. Ek-aadh halki muskaan wali baat tabhi jab apne aap fit ho (mood "funny"). Jahan kanoon, khatra ya kisi ki takleef ki baat ho wahan mood "serious". Baaki "normal". `;
    const FUN_EN = fun ? null : `ENTERTAINMENT: keep it engaging through curiosity, surprise and real examples — no forced jokes, rhymes or scolding. At most one light, natural funny moment if it truly fits (mood "funny"). Serious beats where respect is needed (mood "serious"); everything else "normal". Humor never targets a religion, culture, country, gender or any group.`;
    const legalEnd = (g ? "" : " Agar vishay kanoon/police/court se juda hai tabhi aakhir mein ek chhoti line: \"ye kanooni salah nahi, apne case ke liye vakil se milein\" — warna kanoon wali line mat daalo.");
    // What foreign viewers enjoy about India (owner asked: make what they like)
    const G_LIKE = `\nWHAT FOREIGN VIEWERS LOVE about India content — use the angle that fits the topic: (1) "first time" experiences seen through ${nA}'s eyes (street food, trains, a wedding, a festival, bargaining, a crowded market) with honest, funny reactions; (2) culture shock explained with respect — why Indians do X (head wobble, eating with hands, "adjust", joint families) — ending in "oh, that actually makes sense"; (3) myth vs fact — gently correcting common stereotypes with real facts; (4) mind-blowing scale and clever systems (Indian Railways, UPI payments, Mumbai dabbawalas, Kumbh Mela, festivals) — only well-established facts; (5) history, architecture and mysteries told as a story; (6) food explained — taste, how it's made, regional differences. Tone: warm, curious, positive, never poverty-tourism or mocking. ${nA} voices the viewer's doubts ("wait, isn't that…?"). Concrete sensory details (sounds, smells, colours). One clear takeaway viewers can repeat to a friend. Titles: specific and curiosity-driven but true (e.g. "Why Indians Eat With Their Hands (It's Not What You Think)").`;
    const CARTOON = `YouTube cartoon video ki script banani hai — do original cartoon kirdaar aapas mein baat karte hain (Hindi, aam logon ke liye). Vishay:\n${topic}${GEN}\n\n` +
      `Kirdaar: A = "${nA}" — aam aadmi, darshak ki tarah sawaal puchta hai, kabhi confuse hota hai, halka mazaak karta hai. B = "${nB}" — samajhdaar bade, dheeraj se aasaan misaal dekar samjhate hain. B vakil NAHI hai — jaankari deta hai, salah nahi; zaroorat pe kehta hai "apne case ke liye vakil se milna".\n` +
      `Sirf JSON do:\n{${HEAD},"lines":[{"who":"A ya B","text":"(Devanagari Hindi, 1-2 chhote vakya, asli bol-chaal)","key":"(board pe dikhane ko 2-5 shabd)","emoji":"(1 emoji)","mood":"(normal | funny | serious | daant | shayari)","scene":"(${SCN_LIST()})","photo":"(1-4 English shabd: us cheez/jagah ki asli photo ki khoj, jaise 'Supreme Court of India', 'police station India', 'Indian rupee notes'; vishay na badle to wahi shabd dohraao; zaroorat na ho to khaali; kisi vyakti ka naam KABHI nahi)"}]}\n` +
      `Lagbhag ${nl} lines, A aur B baari-baari (kabhi ek hi kirdaar 2 line bhi). Shuru: A ek aam zindagi ki pareshani/sawaal se (pehli line 3 second mein dhyaan khinche) — disclaimer ya intro se shuru mat karo. Beech mein: seedha jawab, asli baat kya hai (kanoon ka vishay ho to court/kanoon kya kehta hai; judgment diya ho to naam-saal), kya karein — saaf steps. A beech-beech mein wahi sawaal/shaq kare jo darshak ke man mein ho. Aakhir: B ek line mein saar.${legalEnd} A darshakon se ek sawaal jis par log comment karein. ` +
      `Mazaak halka aur saaf ho — peedit, jaati, dharm, aurat/aadmi ya kisi samuday pe mazaak nahi. Kitaabi ya ratti hui bhasha nahi. ` + BOL +
      `MANCH: top-level "cast":{"A":"(${DRS_LIST})","B":"(wahi list)"} do — is kahani mein kaun kya bana hai (jaise ek garib dukaandaar, doosra police wala; "none" = roz ke kapde). Har line ka "scene" chuno ki baat kahan ho rahi hai; kai line ek hi jagah rakho, kahani aage badhe tabhi badlo. Vakil/police ki dress mein bhi kirdaar sirf aam jaankari dete hain, kanooni salah nahi. ` +
      (FUN_HI || `MANORANJAN (bahut zaroori — seedha-saadha jawab nahi, sunne wale ko maza aaye): 2-3 jagah halka saaf chutkula ya mazedaar baat jo vishay se judi ho (mood "funny"); ` +
      `ek chhoti APNI banayi 2 line ki shayari, jaise ${nB} kisi baat ko sher mein samjhaye (mood "shayari"; kisi mashhoor shayar/gaane ki line nahi); ` +
      `ek jagah ${nB} ${nA} ko pyaar se daant lagaye jab wo koi galat/bewakoofi wali baat kare (mood "daant", jaise "arre buddhu!" — apmaan nahi); ` +
      `jahan kanoon, khatra ya kisi ki takleef ki baat ho wahan 1-3 line gambhir (mood "serious") — wahan mazaak bilkul nahi. Baaki "normal". Mood ooper-neeche hota rahe. `) + `Apradh ya peedit ki takleef pe kabhi mazaak nahi. ` + STD_HI + "\n" + RULES;
    const LINE_JSON = `{"who":"A | B | N","text":"(1-2 chhote bolchaal ke vakya)","key":"(board/label ke liye 2-5 shabd)","emoji":"(1 emoji)","mood":"(normal | funny | serious | daant | shayari)","scene":"(${SCN_LIST()})","dressA":"(SIRF jab is line se A ki dress badle: ${DRS_LIST}; warna ye field mat do)","dressB":"(waise hi B ke liye)","photo":"(khaali chhodo)"}`;
    const KAHANI = () => `YouTube ke liye ek CARTOON KAHANI (short film) likho — lagbhag ${mins}, Hindi, aam logon ke liye. Vishay / kahani ka idea:\n${topic}${GEN}\n\n` +
      `Kirdaar: A = "${nA}" (aam aadmi — bhola, jaldi bharosa kar leta hai, galti karta hai, mazaakiya), B = "${nB}" (samajhdaar, kanoon ki AAM jaankari rakhta hai, vakil NAHI), N = narrator (kahani sunane wala — scene badalne aur kahani aage badhane ke liye chhote vakya; har 3-6 line mein ek se zyada nahi). Kahani ke baaki log (thag, dukaandaar, police wala, padosi, afsar) A ya B hi dress badal kar nibhate hain ("dressA"/"dressB"), ya narrator unki baat bata deta hai.\n` +
      `KAHANI KA FORMULA (pakka pakdo): 1) HOOK — pehli 5 second mein musibat ya chaunkane wala pal. 2) Shuruaat — kaun, kahan, kya chahta hai. 3) Musibat — koi thag/dabang fayda uthata hai ya A galti karta hai (mazaak bhi). 4) Kahani ke 25%, 50% aur 75% par ek naya mod/twist. 5) Insaaf sirf KANOONI raaste se (thana, FIR, helpline, consumer forum, court) — B sahi aam jaankari deta hai. 6) Ant — ${fun ? nB + " ki chhoti APNI 2-line shayari + " : ""}seekh + darshak se sawaal ("aapke saath aisa hua hai? comment mein batao") + agli kahani ka chhota ishara. ` +
      `Kahani 30-60 second ke hisson mein aage badhe; har hisse mein jagah (scene) ya mood badle; safar ho to car/bike/walk/cycle scene bhi use karo (agar list mein hon). ${fun ? nB + ' ki ek pehchaan wali line 2-3 baar aaye (jaise "Arre buddhu!"). ' : ""}Kahani kaalpanik ho — kisi asli vyakti/ghatna/company ka naam nahi. Apradh, thagi ya police se bachne ki tareef KABHI nahi; galat kaam ka nateeja dikhao. Disclaimer se shuru mat karo.${legalEnd}\n` +
      (FUN_HI || `Mazaak (2-3 jagah, mood "funny"), ek jagah pyaar bhari daant (mood "daant"), takleef/kanoon ki baat par gambhir (mood "serious"), ant mein shayari (mood "shayari"). Mood ooper-neeche hota rahe. `) + BOL + STD_HI + "\n" +
      `Sirf JSON do:\n{${HEAD},"cast":{"A":"(${DRS_LIST})","B":"(wahi list)"},"lines":[${LINE_JSON}]}\nLagbhag ${nl} lines. ` + RULES;
    const KAHANI_G = () => `Write an animated SHORT FILM script (about ${mins}) for an international audience. Characters: A = "${nA}" (curious traveler from abroad, makes funny mistakes), B = "${nB}" (warm, witty Indian friend who knows things), N = narrator (short storyteller lines that move the story or change scene; at most one every 3-6 lines). Other roles (shopkeeper, auto driver, police officer, aunty) are played by A or B via a costume change ("dressA"/"dressB") or described by the narrator.\n` +
      `Topic area: ${GCATS[cat][0]}. ${GCAT_NOTE[cat]}\nStory idea: ${topic}${GEN}\n` +
      `FORMULA: hook within 5 seconds; setup (who/where/what they want); a problem (culture shock or a mistake, with humor); a new twist at 25%, 50% and 75%; resolution where B explains with accurate, well-established facts; ending: ${fun ? "B's short ORIGINAL two-line rhyme + " : ""}the lesson + a question to viewers + a tease of the next episode of the "${nA} in India" series. Move in 30-60 second mini-arcs; change scene or mood each arc; use travel scenes (car/bike/walk/cycle) when they travel, if available. ` +
      `Natural spoken English, contractions, real reactions; ${fun ? '2-3 clean jokes ("funny"), one playful scolding ("daant"), serious beats where respect is needed ("serious"), the closing rhyme ("shayari")' : FUN_EN}${STD_EN} Respect every culture and religion — explain, never mock; no stereotypes; never invent numbers, dates, names or quotes; fictional story, no real private people or companies.\n` +
      `Return ONLY valid JSON: {"title":"(max 60 chars, curiosity-driven but honest)","description":"(3-5 lines; end with: 'Made for learning and fun. We check facts carefully, but tell us in the comments if we missed something!')","tags":["..."],"thumbnail_text":"(3-5 punchy words)","cast":{"A":"(${DRS_LIST})","B":"(same list)"},"lines":[${LINE_JSON.replace("1-2 chhote bolchaal ke vakya", "1-2 short spoken sentences").replace("board/label ke liye 2-5 shabd", "2-5 words for the label").replace("SIRF jab is line se A ki dress badle", "ONLY when A changes costume from this line").replace("warna ye field mat do", "otherwise omit").replace("waise hi B ke liye", "same for B").replace("khaali chhodo", "leave empty")}]}\nAbout ${nl} lines.`;
    const nDoc = { short: 6, mid: 14, long: 26 }[len];
    const DOC_SLIDE_HI = `{"heading":"(screen ke upar chhota tag, 2-5 shabd)","points":["(1-2 keyword, har ek 2-4 shabd)"],"narration":"(is hisse mein bolne ki line, Devanagari Hindi, ${len === "short" ? "1-2" : "2-3"} chhote vakya)","photo":"(1-4 English shabd: is hisse ke liye ASLI photo ki khoj, jaise 'Taj Mahal sunrise', 'Indian police station', 'Indian rupee notes', 'Delhi metro train'; jab tak cheez na badle wahi shabd; kisi vyakti ka naam KABHI nahi)"}`;
    const DOC_HI = `YouTube ke liye ek documentary-style video ki script banani hai — ek hi awaaz bolti hai aur peeche us baat ki asli photos chalti hain (Hindi, aam logon ke liye). Vishay:\n${topic}\n\n` +
      `Sirf JSON do, aur kuch nahi:\n{${HEAD},"slides":[${DOC_SLIDE_HI}]}\n` +
      `Theek ${nDoc} slides, kul lagbhag ${WORDS} bole jaane wale shabd${len === "short" ? " (40 second se kam)" : ""}. Har slide ek alag photo/drishya hai — isliye har slide mein ek nayi cheez dikhe aur bole.\n` +
      `DHAANCHA: 1) pehli slide = jhatka — chaunkane wala sach, bada sawaal ya aam zindagi ki situation (namaste, intro ya disclaimer BILKUL nahi). 2) pehle 15 second mein vaada ki aage kya milega. 3) beech mein asli baat: tathya, udaharan, kya karein — steps; har 3-4 slide par ek naya mod ya "kya aap jaante ho". 4) aakhri slide: ek line mein saar + darshak se sawaal ("aapke saath aisa hua hai? comment mein batao").${legalEnd}\n` +
      `LEHJA: narration aise jaise ek insaan camera ke saamne dost se baat kar raha ho — "dekhiye", "ab socho" jaise shabd, chhote vakya, aap se baat. Screen ke points narration ko dohraayein nahi — sirf 2-4 shabd ke keyword. Koi guarantee ("pakka milega", "case jeet jaoge") nahi. ` + STD_HI + "\n" + RULES + LANG;
    const DOC_EN = () => `Write a script for a documentary-style YouTube video for an international audience: one narrator voice over REAL photos of what is being said. Topic area: ${GCATS[cat][0]}. ${GCAT_NOTE[cat]}\nTopic: ${topic}\n\n` +
      `Return ONLY valid JSON: {"title":"(max 60 chars, curiosity-driven but honest)","description":"(3-5 lines; end with: 'Made for learning and fun. We check facts carefully, but tell us in the comments if we missed something!')","tags":["..."],"thumbnail_text":"(3-5 punchy words)","slides":[{"heading":"(2-5 word on-screen tag)","points":["(1-2 keywords, 2-4 words each)"],"narration":"(${len === "short" ? "1-2" : "2-3"} short spoken sentences)","photo":"(1-4 word English search for a REAL photo of this part, e.g. 'Taj Mahal sunrise', 'Mumbai dabbawala', 'Indian railway station'; reuse the words while the subject stays the same; never a person's name)"}]}\n` +
      `Exactly ${nDoc} slides, about ${WORDS} spoken words in total${len === "short" ? " (under 40 seconds)" : ""}. Each slide is a new picture, so each one shows and says something new.\n` +
      `STRUCTURE: slide 1 = the hook in under 8 words (surprising fact or question; never a greeting or intro). Promise the payoff in the first 15 seconds. Middle: facts, a real example or mini-story, myth vs truth; a twist or "did you know" every 3-4 slides. Last slide: one-line recap + a question viewers will answer in the comments.\n` +
      `Accuracy and respect (strict): only well-established facts; never invent numbers, dates, names or quotes. Respect every culture and religion; no stereotypes. No guarantees or personal advice.` + STD_EN + G_LIKE;
    $("#vmsg").innerHTML = '<span class="dots"><i></i><i></i><i></i></span> 🔎 Pehle Google se pakke tathya dhundh raha hoon…';
    const found = await research((q || "") + (facts ? "\n" + facts.slice(0, 600) : ""), g);
    const FACTS = found ? (g ? `\n\nVERIFIED FACTS from Google Search (build the script on these; don't invent other numbers, names or dates):\n${found}` : `\n\nPAKKE TATHYA (Google search se — script inhi par bane; inke bahar naye number, naam, saal ya dhara mat banao):\n${found}`) : "";
    $("#vmsg").innerHTML = '<span class="dots"><i></i><i></i><i></i></span> Script ban rahi hai…';
    try {
      const reqContents = [{ role: "user", parts: [{ text: isK ? (g ? KAHANI_G() : KAHANI()) : g && style === "slides" ? DOC_EN() : g ? globalPrompt(topic + GEN, nA, nB, cat, fmt, nl, FUN_EN, STD_EN) : (style === "cartoon" ? CARTOON : DOC_HI) + LANG }] }];
      if (style === "cartoon" || isK) reqContents[0].parts[0].text += g ? G_LIKE + KEEP_EN : KEEP_HI;
      reqContents[0].parts[0].text += FACTS;
      if (autoHint) reqContents[0].parts[0].text += autoHint;
      const SYS = g ? "You are a top YouTube script writer for animated explainer videos. You return only valid JSON." : "Tum ek YouTube script writer ho. Sirf valid JSON lautate ho.";
      const r = await G.ask(reqContents, { system: SYS, web: false, json: true, onPart: () => {}, onStatus: t => { $("#vmsg").textContent = t; } });
      plan = readScript(r.text);
      let why = `${r.finish || "?"}, ${String(r.text || "").length} akshar`;
      if (!plan) { // cut off or broken: try once more, shorter and flat
        $("#vmsg").innerHTML = '<span class="dots"><i></i><i></i><i></i></span> Script adhoori aayi, chhoti karke dobara likhwa raha hoon…';
        const fewer = len === "short" ? nl : Math.max(10, Math.round(nl * 0.6));
        const again = [{ role: "user", parts: reqContents[0].parts.concat([{ text: g
          ? `\n\nIMPORTANT: keep it to about ${fewer} lines. Put ALL lines in ONE flat top-level "lines" array (no "scenes" nesting), each line an object with "who" ("A","B" or "N") and "text". Keep every text short. Close the JSON properly.`
          : `\n\nZAROORI: sirf lagbhag ${fewer} lines. Saari lines EK seedhi top-level "lines" array mein (scenes ke andar nahi), har line mein "who" ("A","B" ya "N") aur "text". Har text chhota. JSON poora band karo.` }]) }];
        const r2 = await G.ask(again, { system: SYS, web: false, json: true, onPart: () => {}, onStatus: t => { $("#vmsg").textContent = t; } });
        plan = readScript(r2.text);
        why += ` / ${r2.finish || "?"}, ${String(r2.text || "").length} akshar`;
      }
      if (!plan) throw new Error(`AI ki script do baar adhoori aayi (${why}) — thodi der baad dobara dabao, ya Lambai chhoti karo`);
      const wordsOf = p => (p.lines || p.slides || []).map(l => String(l.text || l.narration || "")).join(" ").split(/\s+/).filter(Boolean).length;
      if (len !== "short" && wordsOf(plan) < WORDS * 0.75) { // too short for the chosen length: ask once for a fuller version
        $("#vmsg").innerHTML = `<span class="dots"><i></i><i></i><i></i></span> Script ${mins} se chhoti aayi (${wordsOf(plan)} shabd) — lambi karwa raha hoon…`;
        try {
          const more = [{ role: "user", parts: reqContents[0].parts.concat([{ text: g
            ? `\n\nYour last version had only ${wordsOf(plan)} spoken words — far too short for ${mins}. Write the COMPLETE script again with about ${nl} lines and about ${WORDS} spoken words in total (same JSON format, one flat "lines" array). Keep it lively: add real examples, a mini-story, a surprising fact.`
            : `\n\nPichhli script mein sirf ${wordsOf(plan)} shabd the — ${mins} ke liye bahut kam. POORI script dobara likho: lagbhag ${nl} lines aur kul lagbhag ${WORDS} bole jaane wale shabd (wahi JSON, ek seedhi "lines" array). Asli udaharan, chhoti kahani, chaunkane wala tathya jodo.` }]) }];
          const r3 = await G.ask(more, { system: SYS, web: false, json: true, onPart: () => {}, onStatus: t => { $("#vmsg").textContent = t; } });
          const p3 = readScript(r3.text);
          if (p3 && wordsOf(p3) > wordsOf(plan)) plan = p3;
        } catch (e) { /* keep the shorter one */ }
      }
      if (style === "cartoon" || isK) {
        const okD0 = d => (DRESS[String(d || "").toLowerCase()] ? String(d).toLowerCase() : "");
        const lc = x => String(x || "").trim().toLowerCase(), WHO = w => { const v = lc(w); return v === lc(nB) || v === "b" ? "B" : v === lc(nA) || v === "a" ? "A" : /^(n$|narrat|kahani|sutra)/.test(v) ? "N" : /^b\b/.test(v) ? "B" : "A"; };
        plan.slides = (plan.lines || []).filter(l => l && l.text).map(l => ({ who: WHO(l.who),
          dA: l.dressA != null && l.dressA !== "" ? okD0(l.dressA) : null, dB: l.dressB != null && l.dressB !== "" ? okD0(l.dressB) : null, narration: String(l.text), heading: String(l.key || ""), emoji: l.emoji || "", points: [], photoQ: String(l.photo || "").trim().slice(0, 60), mood: ["funny", "serious", "daant", "shayari"].includes(String(l.mood || "").toLowerCase()) ? String(l.mood).toLowerCase() : "",
          scene: SCENES[String(l.scene || "").toLowerCase()] ? String(l.scene).toLowerCase() : "" }));
        if (len === "short" && plan.slides.length > nl + 1) plan.slides = plan.slides.slice(0, nl).concat(plan.slides.slice(-1)); // keep Shorts under ~40 s (keep the closing line)
        const okD = d => (DRESS[String(d || "").toLowerCase()] ? String(d).toLowerCase() : "");
        plan.cast = { A: okD((plan.cast || {}).A), B: okD((plan.cast || {}).B) };
        plan.style = "cartoon"; plan.kahani = isK; plan.actors = actors; plan.names = { A: nA, B: nB, N: g ? "Narrator" : "Kahanikaar" };
      }
      if (style === "slides" && plan.style !== "cartoon" && (!Array.isArray(plan.slides) || !plan.slides.length) && Array.isArray(plan.lines)) // AI wrote dialogue lines: use them as narration
        plan.slides = plan.lines.filter(l => l && l.text).map(l => ({ heading: l.key || "", points: [], narration: l.text, photo: l.photo || "" }));
      if (!Array.isArray(plan.slides) || !plan.slides.length) throw new Error("script nahi mili — dobara dabao");
      if (plan.style !== "cartoon") { plan.style = "slides"; plan.slides = plan.slides.map(x => ({ heading: String(x.heading || ""), emoji: "", points: (Array.isArray(x.points) ? x.points : []).map(String).slice(0, 3), narration: String(x.narration || x.text || ""), photoQ: String(typeof x.photo === "string" ? x.photo : x.photoQ || "").trim().slice(0, 60), photo: null })).filter(x => x.narration); }
      plan.legal = g ? false : plan.legal !== false;
      plan.short = len === "short"; plan.lang = g ? "en" : "hi"; plan.mode = mode; plan.cat = cat; plan.fmt = fmt;
      Object.keys(voices).forEach(k => delete voices[k]);
      Object.keys(photos).forEach(k => delete photos[k]);
      $("#vmsg").textContent = (plan.cut ? "⚠️ Script thodi chhoti aayi (AI ne beech mein rok di) — " : "✅ ") + "Script taiyaar" + (g ? ` (format: ${{ qa: "sawaal-jawaab", myth: "myth vs fact", top: "top 5", story: "kahani" }[fmt] || "Hindi lesson"})` : "") + " — neeche padh ke sudhaar sakte ho";
      savePlan();
      drawEditor();
      photosP = Promise.resolve(findPhotos()).catch(() => {});
      return true;
    } catch (e) { $("#vmsg").innerHTML = "❌ " + esc(e.message || "Script nahi bani — dobara try karo") + (e.tries && e.tries.length ? `<br><span class="muted" style="font-size:11px">${esc(e.tries.join(" · "))}</span>` : ""); return false; }
  }

  function drawEditor() {
    const p = plan;
    $("#vedit").innerHTML = `<div class="card"><h3>📝 Title, description, tags</h3>
        <label class="field">Title<input id="vt" value="${esc(p.title || "")}"></label>
        <label class="field">Description<textarea id="vd" rows="4">${esc(p.description || "")}</textarea></label>
        <label class="field">Tags<input id="vg" value="${esc((p.tags || []).join(", "))}"></label>
        <label class="field">Thumbnail ka text<input id="vth" value="${esc(p.thumbnail_text || "")}"></label>
        <div class="row"><button class="btn" data-copy="vt">📋 Title</button><button class="btn" data-copy="vd">📋 Description</button><button class="btn" data-copy="vg">📋 Tags</button><button class="btn" id="vthumb">🖼️ Thumbnail save</button></div></div>
      ${p.style === "cartoon" ? p.slides.map((s, i) => `<div class="card"><div class="row"><b>${i + 1}.</b>
        <select data-mood="${i}">${[["", "🙂 Normal"], ["funny", "😂 Mazaak"], ["serious", "😐 Gambhir"], ["daant", "😤 Daant"], ["shayari", "✍️ Shayari"]].map(([k, t]) => `<option value="${k}" ${(s.mood || "") === k ? "selected" : ""}>${t}</option>`).join("")}</select>
        <select data-scene="${i}">${Object.entries(SCENES).map(([k, t]) => `<option value="${k}" ${(s.scene || "") === k ? "selected" : ""}>${t}</option>`).join("")}</select>
        <select data-who="${i}"><option value="A" ${s.who === "A" ? "selected" : ""}>${GL() ? "🧳" : "🙋"} ${esc(p.names.A)}</option><option value="B" ${s.who === "B" ? "selected" : ""}>${GL() ? "🙋‍♀️" : "👴"} ${esc(p.names.B)}</option>${p.kahani || s.who === "N" ? `<option value="N" ${s.who === "N" ? "selected" : ""}>📖 ${esc(p.names.N || "Narrator")}</option>` : ""}</select></div>
        <label class="field">🔊 Bolna hai<textarea data-n="${i}" rows="2">${esc(s.narration || "")}</textarea></label>
        <label class="field">🟩 Board pe<input data-h="${i}" value="${esc(s.heading || "")}"></label>
        <div class="row small" data-phrow="${i}">${photoRow(s, i)}</div>
        <div class="row"><button class="btn" data-rec="${i}">🎙️ Apni awaaz</button><span class="small" data-rs="${i}">${voices[i] ? "✅ Aapki awaaz (" + voices[i].dur.toFixed(0) + " sec) <button class='btn' data-play='" + i + "'>▶️</button>" : ""}</span></div></div>`).join("") :
      p.slides.map((s, i) => `<div class="card"><h3>Slide ${i + 1}</h3>
        <label class="field">Heading<input data-h="${i}" value="${esc(s.heading || "")}"></label>
        <label class="field">Points (har line ek point)<textarea data-p="${i}" rows="3">${esc((s.points || []).join("\n"))}</textarea></label>
        <label class="field">🔊 Bolna hai<textarea data-n="${i}" rows="3">${esc(s.narration || "")}</textarea></label>
        <div class="row small" data-phrow="${i}">${photoRow(s, i)}</div>
        <div class="row"><button class="btn" data-rec="${i}">🎙️ Apni awaaz record karo</button><span class="small" data-rs="${i}">${voices[i] ? "✅ Aapki awaaz (" + voices[i].dur.toFixed(0) + " sec) <button class='btn' data-play='" + i + "'>▶️</button>" : "Record nahi kiya to phone ki Indian awaaz"}</span></div></div>`).join("")}
      <div class="card">${p.style === "cartoon" ? `
        ${PHONE_OK() ? `<label class="field">🔊 Awaaz kahan se<select id="veng"><option value="ai" ${engine() === "ai" ? "selected" : ""}>🤖 Google AI — insaan jaisi, par roz ki free limit</option><option value="phone" ${engine() === "phone" ? "selected" : ""}>📱 Phone ki awaaz — free, koi limit nahi</option></select></label>
        <div id="vphv" ${engine() === "phone" ? "" : "hidden"}>${["A", "B"].concat(p.kahani ? ["N"] : []).map(w => `<div class="row"><label class="field" style="flex:2">${w === "N" ? "📖 Narrator" : esc(p.names[w])} — phone awaaz<select data-pv="${w}"><option value="">Apne aap</option></select></label><label class="field" style="flex:2">Bhaaripan<select data-pp="${w}">${PITCH.map(([k, t]) => `<option value="${k}" ${pvPitch(w) === k ? "selected" : ""}>${t}</option>`).join("")}</select></label><button class="btn" data-pvt="${w}" style="align-self:flex-end">▶️</button></div>`).join("")}
          <div class="small muted">Dono kirdaar ki awaaz alag rakho (alag awaaz ya alag bhaaripan). Aur awaazein chahiye to: phone Settings → "Text-to-speech" → Google → Hindi ki awaaz download.</div></div>
        <div id="vaiv" ${engine() === "phone" ? "hidden" : ""}>` : "<div>"}
        <label class="field">🙋 ${esc(p.names.A)} ki awaaz<select id="vva">${AI_VOICES.map(([k, t]) => `<option value="${k}" ${vA() === k ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label class="field">👴 ${esc(p.names.B)} ki awaaz<select id="vvb">${AI_VOICES.map(([k, t]) => `<option value="${k}" ${vB() === k ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        ${p.kahani ? `<label class="field">📖 Narrator ki awaaz<select id="vvn">${AI_VOICES.map(([k, t]) => `<option value="${k}" ${vN() === k ? "selected" : ""}>${t}</option>`).join("")}</select></label>` : ""}</div>
        <div class="row"><label class="field" style="flex:1">👕 ${esc(p.names.A)} ki dress<select id="vda">${Object.entries(DRESSES).map(([k, t]) => `<option value="${k}" ${((p.cast || {}).A || "") === k ? "selected" : ""}>${t}</option>`).join("")}</select></label>
          <label class="field" style="flex:1">👕 ${esc(p.names.B)} ki dress<select id="vdb">${Object.entries(DRESSES).map(([k, t]) => `<option value="${k}" ${((p.cast || {}).B || "") === k ? "selected" : ""}>${t}</option>`).join("")}</select></label></div>
        <select id="vvoice" hidden><option value="ai:${vA()}"></option></select>` : `
        <label class="field">Awaaz (jo slide aapne record nahi ki)<select id="vvoice">
          ${AI_VOICES.map(([k, t]) => `<option value="ai:${k}" ${S.get("vVoice", "ai:Charon") === "ai:" + k ? "selected" : ""}>🤖 AI insaan jaisi — ${t}</option>`).join("")}
          <option value="phone" ${S.get("vVoice", "") === "phone" ? "selected" : ""}>📱 Phone ki Indian awaaz</option></select></label>`}
        <div class="row"><button class="btn" id="vphotos">🖼️ Topic ki photos dhundho</button><label class="row small"><input type="checkbox" id="vphon" ${p.noPhotos ? "" : "checked"}> Peeche photo dikhao</label></div><div class="small muted">Photos Wikimedia Commons se (free license) — credit description mein apne aap judta hai. Pasand na aaye to har line pe 🔄 Doosri ya 📷 Apni.</div>
        <button class="btn${p.style === "cartoon" ? " primary" : ""}" id="vtest">${p.style === "cartoon" ? "▶️ Pehle namoona dekho-suno (shuru ki 3 line)" : "▶️ Awaaz suno"}</button>
        ${p.style === "cartoon" ? `<label class="row small"><input type="checkbox" id="v3d" ${S.get("vLook3d", true) ? "checked" : ""}> ✨ 3D jaisa look (roshni-chhaaya, chamakti aankhein)</label>` : ""}
        <label class="row small"><input type="checkbox" id="vlow" ${S.get("vLow", (navigator.deviceMemory || 8) <= 4) ? "checked" : ""}> 📉 Halki quality (purana/kam RAM phone, ya app blank ho jaye to)</label>
        <label class="field">🎵 Peeche music (app khud banata hai, copyright-free)<select id="vmusic">${Object.entries(MUSIC).map(([k, v]) => `<option value="${k}" ${musicStyle() === k ? "selected" : ""}>${v[0]}</option>`).join("")}</select></label>
        ${p.style === "cartoon" ? "" : `<div class="banner small">💡 Aur behtar banane ke liye: 1) har slide pe <b>apni awaaz</b> record karo (sabse bada fark), 2) jo photo theek na lage use 🔄 Doosri ya <b>📷 Apni</b> se badlo (kisi ka chehra nahi), 3) script ko apne shabdon mein thoda badlo.</div>`}
        <button class="btn" id="vcheck" style="margin-top:8px">🔍 AI se script jaanchwao</button>
        <div id="vcres" class="small"></div>
        <div class="small" style="margin-top:8px">
          <label class="row"><input type="checkbox" class="vok"> Maine poori script khud padh li hai</label>
          ${GL() ? `<label class="row"><input type="checkbox" class="vok"> Numbers, tareekh aur tathya Google/Wikipedia se khud check kiye</label>
          <label class="row"><input type="checkbox" class="vok"> Kisi desh, dharm ya samuday ka mazaak nahi; koi guarantee ya salah nahi</label>` : `<label class="row"><input type="checkbox" class="vok"> Judgment / kanoon ki baat ka link ya source khud check kiya</label>
          <label class="row"><input type="checkbox" class="vok"> Kisi peedit, bachche ya aam vyakti ka naam/pehchaan nahi hai, aur koi guarantee nahi di</label>`}
        </div>
        <button class="btn primary wide" id="vmake" style="margin-top:8px" disabled>🎬 Video banao</button>
        <div id="vprog" class="small" style="margin-top:6px"></div>
        <p class="muted small">Video banne mein utna hi time lagta hai jitni lambi video hai (3 min video ≈ 3-4 min). Tab tak screen chalu rakho. App chhodoge to video <b>ruk jaayegi</b> aur wapas aate hi wahin se chalegi. Awaaz: ⚙️ Settings mein chuni Indian awaaz.</p></div>`;
    $$("[data-copy]").forEach(b => b.onclick = () => copyText($("#" + b.dataset.copy).value));
    $("#vedit").onchange = () => { try { readEdits(); } catch (e) { /* ignore */ } };
    $("#vthumb").onclick = saveThumb;
    $$("[data-rec]").forEach(b => b.onclick = () => recordSlide(+b.dataset.rec));
    $$("[data-pic]").forEach(b => b.onclick = () => pickPhoto(+b.dataset.pic));
    $$("[data-unpic]").forEach(b => b.onclick = () => { readEdits(); delete photos[+b.dataset.unpic]; drawEditor(); });
    $("#vmusic").onchange = e => S.set("vMusicStyle", e.target.value);
    $("#vlow").onchange = e => S.set("vLow", e.target.checked);
    if ($("#v3d")) $("#v3d").onchange = e => { S.set("vLook3d", e.target.checked); look3d = e.target.checked; sceneMap.clear(); };
    $$("[data-play]").forEach(b => b.onclick = () => { const a = new Audio(URL.createObjectURL(voices[+b.dataset.play].blob)); a.play(); });
    $("#vmake").onclick = make;
    const gate = () => { $("#vmake").disabled = $$(".vok").some(c => !c.checked); };
    $$(".vok").forEach(c => c.onchange = gate);
    $("#vcheck").onclick = checkScript;
    $("#vvoice").onchange = e => S.set("vVoice", e.target.value);
    if (p.style === "cartoon") {
      $("#vva").onchange = e => { S.set(K("vVoiceA"), e.target.value); $("#vvoice").innerHTML = `<option value="ai:${e.target.value}"></option>`; };
      $("#vvb").onchange = e => S.set(K("vVoiceB"), e.target.value);
      if ($("#vvn")) $("#vvn").onchange = e => S.set(K("vVoiceN"), e.target.value);
      if ($("#veng")) {
        $("#veng").onchange = e => { S.set(K("vEngine"), e.target.value); $("#vphv").hidden = e.target.value !== "phone"; $("#vaiv").hidden = e.target.value === "phone"; };
        phoneVoices().then(list => $$("[data-pv]").forEach(sel => {
          const w = sel.dataset.pv;
          sel.innerHTML = `<option value="">Apne aap</option>` + list.map((v, i) => `<option value="${esc(v.name)}" ${pvName(w) === v.name ? "selected" : ""}>Awaaz ${i + 1} · ${esc(v.locale)}${v.net ? " (internet)" : ""}</option>`).join("");
        }));
        $$("[data-pv]").forEach(sel => sel.onchange = () => S.set(K("pv" + sel.dataset.pv), sel.value));
        $$("[data-pp]").forEach(sel => sel.onchange = () => S.set(K("pp" + sel.dataset.pp), sel.value));
        $$("[data-pvt]").forEach(b => b.onclick = async () => {
          const w = b.dataset.pvt, nm = w === "N" ? "" : plan.names[w];
          try { const ac = new (window.AudioContext || window.webkitAudioContext)(); const buf = await phoneLine(ac, EN() ? `Hi, I am ${nm || "the narrator"}. This is how I sound.` : `नमस्ते, मैं ${nm || "कहानी सुनाने वाला"} हूँ। मेरी आवाज़ ऐसी है।`, w);
            const src = ac.createBufferSource(); src.buffer = buf; src.connect(ac.destination); src.onended = () => ac.close(); src.start(); }
          catch (e) { toast("❌ " + (e.message || "Awaaz nahi bani")); }
        });
      }
    }
    $("#vphotos").onclick = () => findPhotos(true);
    $("#vphon").onchange = e => { plan.noPhotos = !e.target.checked; };
    bindPhotoRows();
    if (p.style === "cartoon") $("#vtest").onclick = preview;
    else $("#vtest").onclick = async () => {
      const v = $("#vvoice").value, t = (plan.slides[0] && plan.slides[0].narration) || "नमस्ते! आज हम एक ज़रूरी कानूनी सवाल समझेंगे।";
      try {
        if (v === "phone") { Voice.speak(t); return; }
        toast("⏳ AI awaaz ban rahi hai…");
        const buf = await aiVoice(t.slice(0, 300), v.slice(3));
        const a = new Audio(URL.createObjectURL(new Blob([buf], { type: "audio/wav" }))); a.play();
      } catch (e) { toast("❌ " + e.message + " — phone ki awaaz chalegi", 4000); }
    };
  }

  function pickPhoto(i) {
    readEdits();
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      const img = new Image();
      img.onload = () => { photos[i] = img; drawEditor(); };
      img.onerror = () => toast("Photo khul nahi payi");
      img.src = URL.createObjectURL(f);
    };
    inp.click();
  }

  // ---------- music & sound effects (all made here → copyright-free) ----------
  let noiseBuf = null;
  function noise(ac) {
    if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
    const b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return (noiseBuf = b);
  }
  function tone(ac, out, type, f, t, dur, vol, f2) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type;
    o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  function hit(ac, out, t, dur, vol, ftype, freq) {
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noise(ac); f.type = ftype; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(out); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }
  const MUSIC = { fun: ["🎸 Mazedaar (masti wala)", 104], desi: ["🪕 Desi (tabla-sitar jaisa)", 92], calm: ["🎹 Shaant", 76], off: ["🔇 Koi music nahi", 0] };
  function musicStyle() { const m = S.get("vMusicStyle", ""); return MUSIC[m] ? m : (S.get("vMusic", true) ? "fun" : "off"); }
  // schedules a little ahead every time tick() is called; music dips while someone speaks
  function musicPlayer(ac, dest, t0, total, style, speech) {
    if (!MUSIC[style] || style === "off") return { tick() {} };
    const bus = ac.createGain(), lp = ac.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = style === "calm" ? 1500 : 6000; bus.connect(lp); lp.connect(dest);
    const LOUD = style === "calm" ? 0.13 : 0.2, DUCK = LOUD * 0.32;
    bus.gain.setValueAtTime(LOUD, t0);
    speech.forEach(([a, b]) => { bus.gain.setTargetAtTime(DUCK, Math.max(0, t0 + a - 0.15), 0.06); bus.gain.setTargetAtTime(LOUD, t0 + b + 0.05, 0.3); });
    bus.gain.setTargetAtTime(0.0001, t0 + Math.max(0, total - 1.6), 0.5);
    const beat = 60 / MUSIC[style][1];
    const PROG = style === "desi" ? [[146.8, 220, 293.7], [146.8, 220, 293.7], [130.8, 196, 261.6], [146.8, 220, 293.7]]
      : [[261.6, 329.6, 392], [196, 246.9, 293.7], [220, 261.6, 329.6], [174.6, 220, 261.6]];
    const SCALE = [293.7, 311.1, 370, 392, 440, 466.2, 554.4, 587.3];
    let next = 0, n = 0, mel = 3;
    const at = (k, t) => {
      const ch = PROG[Math.floor(k / 4) % 4], b = k % 4;
      if (style === "fun") {
        if (b === 0 || b === 2) { tone(ac, bus, "sine", 130, t, 0.2, 0.9, 45); tone(ac, bus, "triangle", ch[0] / 2, t, beat * 1.7, 0.45); }
        if (b === 1 || b === 3) hit(ac, bus, t, 0.15, 0.4, "bandpass", 1800);
        hit(ac, bus, t, 0.04, 0.16, "highpass", 7000); hit(ac, bus, t + beat / 2, 0.04, 0.1, "highpass", 7000);
        tone(ac, bus, "triangle", ch[(b * 2) % 3] * 2, t, 0.25, 0.2); tone(ac, bus, "triangle", ch[(b * 2 + 1) % 3] * 2, t + beat / 2, 0.25, 0.16);
      } else if (style === "desi") {
        if (b === 0) { tone(ac, bus, "sawtooth", 73.4, t, beat * 4.3, 0.08); tone(ac, bus, "sawtooth", 110, t + beat, beat * 3.3, 0.05); }
        const low = b === 0 || b === 2;
        tone(ac, bus, "sine", low ? 95 : 320, t, low ? 0.35 : 0.12, low ? 0.7 : 0.3, low ? 68 : 290);
        hit(ac, bus, t + beat / 2, 0.06, 0.1, "bandpass", 3500);
        if (k % 2 === 0) { mel = Math.max(0, Math.min(SCALE.length - 1, mel + [-1, 1, 1, -2, 2, 0][Math.floor(Math.random() * 6)])); tone(ac, bus, "triangle", SCALE[mel], t, beat * 1.4, 0.16); }
      } else {
        if (b === 0) ch.forEach(f => tone(ac, bus, "sine", f, t, beat * 4, 0.1));
        tone(ac, bus, "triangle", ch[b % 3] * 2, t + beat / 2, 0.7, 0.07);
      }
    };
    return { tick() { const until = ac.currentTime + 1.2; while (t0 + next < until && next < total) { at(n, t0 + next); next += beat; n++; } } };
  }
  // little sound effects after a joke / a shayari, and before a scolding
  function sfx(ac, out, kind, t) {
    const g = ac.createGain(); g.gain.value = 0.45; g.connect(out);
    if (kind === "funny") { tone(ac, g, "sine", 200, t, 0.14, 0.8, 150); tone(ac, g, "sine", 150, t + 0.16, 0.16, 0.8, 115); hit(ac, g, t + 0.33, 0.6, 0.45, "highpass", 6000); }
    else if (kind === "shayari") [880, 1318.5, 1760].forEach((f, i) => tone(ac, g, "sine", f, t + i * 0.09, 1.2, 0.22));
    else if (kind === "daant") [110, 130.8, 155.6].forEach(f => tone(ac, g, "sawtooth", f, t, 0.6, 0.14));
  }
  const GAP = { funny: 0.95, shayari: 0.8, daant: 0.35, serious: 0.45 };
  const lineGap = (sl, cartoon) => (cartoon ? (GAP[sl && sl.mood] || 0.3) : 0.6);
  function scheduleFx(ac, out, t0, segs) {
    segs.forEach(sg => {
      const sl = sg.buf && plan.slides[sg.i]; if (!sl || !sl.mood) return;
      if (sl.mood === "daant") sfx(ac, out, "daant", t0 + sg.start - 0.05);
      if (sl.mood === "funny" || sl.mood === "shayari") sfx(ac, out, sl.mood, t0 + sg.start + sg.buf.duration + 0.05);
    });
  }

  // ▶️ live preview of the first lines: real voices + moving cartoon, nothing saved
  async function lineAudio(ac, i) {
    if (voices[i]) return ac.decodeAudioData(await voices[i].blob.arrayBuffer());
    const sl = plan.slides[i], text = sl.narration || sl.heading || " ";
    if (plan.style === "cartoon" && engine() === "phone") return phoneLine(ac, text, sl.who);
    const vv = plan.style === "cartoon" ? "ai:" + voiceOf(sl.who) : S.get("vVoice", "ai:Charon");
    if (vv.startsWith("ai:")) {
      try { return await ac.decodeAudioData(await aiVoice(text, vv.slice(3), plan.style === "cartoon" ? sl.who : "", plan.style === "cartoon" ? sl.mood : "")); }
      catch (e) { if (!IS_APP) throw e; }
    }
    const r = await nativeCall("speakToFile", text, EN() ? "en-US" : "hi-IN", S.get("voiceRate", 1));
    if (r.error) throw new Error(r.error);
    const bin = atob(r.b64), arr = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
    return ac.decodeAudioData(arr.buffer);
  }
  async function preview() {
    readEdits();
    const v = plan.short, cw = v ? 360 : 640, chh = v ? 640 : 360;
    openSheet(`<h3>▶️ Namoona</h3><canvas id="pvc" width="${cw}" height="${chh}" style="width:100%;max-height:60vh;object-fit:contain;border-radius:10px;background:#000"></canvas>
      <p class="small" id="pvs"><span class="dots"><i></i><i></i><i></i></span> Awaaz ban rahi hai…</p>
      <div class="row"><button class="btn" id="pvx">⏹ Band karo</button></div>`, root => {
      const cv = $("#pvc", root), ctx = cv.getContext("2d"), st = $("#pvs", root);
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      let stop = false; const end = () => { if (stop) return; stop = true; try { ac.close().catch(() => {}); } catch (e) {} };
      $("#pvx", root).onclick = () => { end(); closeSheet(); };
      cartoonFrame(ctx, cw, chh, "title", plan.title, 0, 0, 1, S.get(K("vChannel"), ""), 0, 0);
      (async () => {
        const n = Math.min(3, plan.slides.length), segs = [];
        try {
          try { await batchVoices(0, n); } catch (e) { /* per-line below */ }
          for (let i = 0; i < n && !stop; i++) {
            st.innerHTML = `<span class="dots"><i></i><i></i><i></i></span> Awaaz ban rahi hai… ${i + 1}/${n}`;
            const b = await lineAudio(ac, i); segs.push({ i, buf: b, env: envelope(b) });
          }
        } catch (e) { st.textContent = "❌ " + (e.message || "Awaaz nahi bani") + " — ⚙️ Settings mein Gemini key dekho"; return; }
        if (stop) return;
        let t = 0; segs.forEach(s => { s.start = t; s.d = s.buf.duration + lineGap(plan.slides[s.i], true); t += s.d; }); const total = t;
        const t0 = ac.currentTime + 0.2;
        const mp = musicPlayer(ac, ac.destination, t0, total, musicStyle(), segs.map(x => [x.start, x.start + x.buf.duration])); mp.tick();
        scheduleFx(ac, ac.destination, t0, segs);
        segs.forEach(s => { const src = ac.createBufferSource(); src.buffer = s.buf; src.connect(ac.destination); src.start(t0 + s.start); });
        st.textContent = "🔊 Awaaz chalu hai — pasand na aaye to upar awaaz badal ke dobara dekho";
        const tick = () => {
          if (stop || !document.contains(cv)) { end(); return; }
          const el = ac.currentTime - t0;
          mp.tick();
          if (el >= total) { st.textContent = "✅ Namoona khatam. Theek laga to neeche tick lagao aur 🎬 Video banao (ye awaaz dobara use hogi)."; return; }
          const s = segs.find(x => el >= x.start && el < x.start + x.d) || segs[0];
          const m = el >= s.start ? (s.env[Math.floor((el - s.start) * 30)] || 0) : 0;
          cartoonFrame(ctx, cw, chh, "slide", plan.slides[s.i], Math.max(0, Math.min(1, (el - s.start) / s.buf.duration)), s.i, plan.slides.length, S.get(K("vChannel"), ""), Math.max(0, el), m);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      })();
    });
  }

  // second AI pass: look for risky claims before making the video
  async function checkScript() {
    readEdits();
    const out = $("#vcres");
    out.innerHTML = '<span class="dots"><i></i><i></i><i></i></span> Jaanch ho rahi hai…';
    const script = plan.style === "cartoon" ? plan.slides.map((s, i) => `${i + 1}. ${plan.names[s.who] || "Narrator"}: ${s.narration}  [board: ${s.heading}]`).join("\n") :
      plan.slides.map((s, i) => `Slide ${i + 1}: ${s.heading}\n- ${(s.points || []).join("\n- ")}\nBolna: ${s.narration}`).join("\n\n");
    try {
      const r = await G.ask([{ role: "user", parts: [{ text: GL() ?
        "Ye ek English YouTube learning/entertainment video ki script hai (videshi darshakon ke liye). Ek savdhan editor ki tarah jaancho aur Hinglish mein sirf problems ki list do (har ek: line no. · kya galat/jokhim · kaise sudhaarein):\n" +
        "1) galat ya shaky tathya — numbers, tareekh, naam, quotes jo pakke nahi, 2) kisi desh/dharm/samuday/aurat-aadmi ka mazaak ya stereotype, 3) guarantee ya personal paise/health salah, 4) gaane ke bol ya film ke dialogue (copyright), 5) title jo jhooth bole (clickbait), 6) Hindi shabd ka galat matlab/spelling.\n" +
        "Web se pakka karo jahan zaroori ho. Koi problem na ho to sirf likho: '✅ Koi bada jokhim nahi mila'. Andaaza mat lagao.\n\nTitle: " + plan.title + "\n\n" + script :
        "Ye ek shiksha (learning) wali YouTube video ki script hai. Ek savdhan kanooni editor ki tarah jaancho aur Hinglish mein sirf problems ki list do (har ek: slide no. · kya galat/jokhim · kaise sudhaarein):\n" +
        "1) galat ya shaky kanooni tathya (dhara, saal, case naam jo pakka nahi), 2) koi guarantee ('pakka milega', 'jeet jaoge'), 3) kisi peedit/bachche/aam vyakti ka naam ya pehchaan, 4) judge/court/police/vyakti pe ilzaam ya apmaanjanak baat (halki desi gaali jaise saala/kutta 2-3 baar chalegi; usse gandi gaali, 3 se zyada baar, pehli 15 second mein gaali, ya aurat/jaati/dharm/peedit ke liye apmaan — ye bataao), 5) seedhi kanooni salah ka lehja ('aap ye karo to case jeet jaoge') jahan 'vakil se milein' hona chahiye, 6) chalte case pe faisla.\n" +
        "Web se pakka karo jahan zaroori ho. Koi problem na ho to sirf likho: '✅ Koi bada jokhim nahi mila'. Andaaza mat lagao.\n\nTitle: " + plan.title + "\n\n" + script }] }],
        { system: "Tum ek savdhan kanooni editor ho. Sirf problems batate ho, nayi baatein nahi jodte.", web: true, onPart: p => { out.innerHTML = MD.render(p.text); } });
      out.innerHTML = MD.render(r.text) + ((r.sources || []).length ? "<div class='src'>🔗 " + r.sources.slice(0, 5).map(s => `<a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join("") + "</div>" : "");
    } catch (e) { out.textContent = "❌ " + (e.message || "Jaanch nahi hui"); }
  }

  function readEdits() { readEdits0(); savePlan(); }
  function readEdits0() {
    const p = plan;
    p.title = $("#vt").value; p.description = $("#vd").value; p.tags = $("#vg").value.split(",").map(x => x.trim()).filter(Boolean); p.thumbnail_text = $("#vth").value;
    if (p.style === "cartoon" && $("#vda")) p.cast = { A: $("#vda").value, B: $("#vdb").value };
    if (p.style === "cartoon") { p.slides.forEach((s, i) => { s.who = $(`[data-who="${i}"]`).value; s.mood = $(`[data-mood="${i}"]`).value; s.scene = $(`[data-scene="${i}"]`).value; s.heading = $(`[data-h="${i}"]`).value.trim(); s.narration = $(`[data-n="${i}"]`).value.trim(); }); return; }
    p.slides.forEach((s, i) => { s.heading = $(`[data-h="${i}"]`).value; s.points = $(`[data-p="${i}"]`).value.split("\n").map(x => x.trim()).filter(Boolean); s.narration = $(`[data-n="${i}"]`).value.trim(); });
  }

  // ---------- drawing ----------
  function wrap(ctx, text, x, y, maxW, lh, maxLines) {
    const words = String(text).split(/\s+/); let line = "", n = 0;
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y + n * lh); n++; line = w; if (n >= maxLines) return n; }
      else line = t;
    }
    if (line) { ctx.fillText(line, x, y + n * lh); n++; }
    return n;
  }
  function bg(ctx, w, h, hue, tsec) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, `hsl(${hue},55%,12%)`); g.addColorStop(1, `hsl(${(hue + 40) % 360},60%,22%)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // soft moving light circles ("achhi light")
    const t = tsec || 0;
    [[0.15, 0.2, 0.35, 45], [0.85, 0.75, 0.4, 200], [0.6, 0.1, 0.25, 320]].forEach(([x, y, r, hh], k) => {
      const cx = w * (x + 0.04 * Math.sin(t * 0.4 + k)), cy = h * (y + 0.04 * Math.cos(t * 0.3 + k)), rr = Math.min(w, h) * r;
      const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
      rg.addColorStop(0, `hsla(${(hue + hh) % 360},80%,60%,.22)`); rg.addColorStop(1, "hsla(0,0%,0%,0)");
      ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
    });
  }
  function subtitle(ctx, w, h, text, prog, sc, F, yAt, color) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    if (!words.length) return;
    // word-by-word highlight, like popular Shorts captions
    const per = w < h ? 4 : 6, cur = Math.min(words.length - 1, Math.floor(Math.min(1, prog * 1.12) * words.length));
    const k = Math.floor(cur / per), part = words.slice(k * per, k * per + per);
    const fs = (w < h ? 48 : 38) * sc;
    ctx.font = `bold ${fs}px ${F}`; ctx.textAlign = "left";
    const sp = ctx.measureText(" ").width, ws = part.map(x => ctx.measureText(x).width);
    const lw = ws.reduce((a, b) => a + b, 0) + sp * (part.length - 1);
    const y = yAt || (w < h ? h * 0.74 : h - 64 * sc), tw = Math.min(w - 30 * sc, lw + 48 * sc);
    ctx.fillStyle = "rgba(0,0,0,.62)"; rr(ctx, (w - tw) / 2, y - fs * 1.05, tw, fs * 1.45, 14 * sc); ctx.fill();
    let x = (w - lw) / 2;
    part.forEach((p, j) => { ctx.fillStyle = k * per + j === cur ? (color || "#ffd166") : "#fff"; ctx.fillText(p, x, y); x += ws[j] + sp; });
  }
  // documentary look: the slide's own photo (or the topic photo), slow pan, soft crossfade from the last one
  const docPhoto = i => { const o = photos[i]; if (o && o.naturalWidth) return o; const p = photoAt(i); return p && p.naturalWidth ? p : null; };
  function frame(ctx, w, h, kind, s, prog, idx, total, channel, tsec) {
    const sc = Math.min(w, h) / 720, F = "'Noto Sans Devanagari','Noto Sans',sans-serif";
    const ph = kind === "end" ? null : docPhoto(kind === "slide" ? idx : 0);
    if (ph) {
      const prev = kind === "slide" && idx > 0 ? docPhoto(idx - 1) : null, a = kind === "slide" ? Math.min(1, prog * 5) : 1;
      if (prev && prev !== ph && a < 1) { photoBg(ctx, w, h, prev, tsec || 0, idx - 1); ctx.globalAlpha = a; photoBg(ctx, w, h, ph, tsec || 0, idx); ctx.globalAlpha = 1; }
      else photoBg(ctx, w, h, ph, tsec || 0, idx);
      if (kind === "title") { ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(0, 0, w, h); }
    } else bg(ctx, w, h, 215 + idx * 17, tsec);
    if (kind === "slide" && (ph || !(s.points || []).length || s.emoji === "")) { docSlide(ctx, w, h, s, prog, idx, total, channel, sc, F, !!ph); return; }
    ctx.save(); ctx.globalAlpha = Math.min(1, prog * 6); // fade-in at slide start
    ctx.textAlign = "left"; ctx.fillStyle = "#fff";
    const pad = 60 * sc, maxW = w - pad * 2;
    if (kind === "title" || kind === "end") {
      ctx.textAlign = "center";
      const z = 1 + 0.04 * prog; ctx.translate(w / 2, h / 2); ctx.scale(z, z); ctx.translate(-w / 2, -h / 2);
      ctx.font = `bold ${58 * sc}px ${F}`; ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 12 * sc;
      wrap(ctx, kind === "title" ? s : (EN() ? "Thank you 🙏" : "धन्यवाद 🙏"), w / 2, h * 0.42, maxW, 72 * sc, 4);
      ctx.shadowBlur = 0; ctx.font = `${30 * sc}px ${F}`; ctx.fillStyle = "#ffd166";
      ctx.fillText(kind === "title" ? (channel || "") : "Like • Subscribe • Share — " + (channel || ""), w / 2, h * 0.78);
    } else {
      if (s.emoji) { ctx.font = `${70 * sc}px sans-serif`; ctx.fillText(s.emoji, pad, pad + 60 * sc); }
      const hx = pad + (s.emoji ? 100 * sc : 0);
      ctx.fillStyle = "#ffd166"; ctx.font = `bold ${44 * sc}px ${F}`; ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 8 * sc;
      const hl = wrap(ctx, s.heading || "", hx, pad + 45 * sc, maxW - (hx - pad), 54 * sc, 2);
      ctx.shadowBlur = 0; ctx.fillStyle = "#fff"; ctx.font = `${34 * sc}px ${F}`;
      let y = pad + 45 * sc + hl * 54 * sc + 45 * sc;
      const pts = s.points || [];
      pts.forEach((p, i) => {
        if (prog < i / Math.max(1, pts.length) * 0.8) return; // points appear one by one
        ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fillRect(pad - 12 * sc, y - 36 * sc, maxW + 24 * sc, 50 * sc);
        ctx.fillStyle = "#4fd1a5"; ctx.fillText("✔", pad, y);
        ctx.fillStyle = "#fff";
        y += wrap(ctx, p, pad + 46 * sc, y, maxW - 46 * sc, 46 * sc, 3) * 46 * sc + 26 * sc;
      });
      ctx.restore(); ctx.save();
      subtitle(ctx, w, h, s.narration, prog, sc, F);
      ctx.fillStyle = "rgba(255,255,255,.15)"; ctx.fillRect(0, h - 8 * sc, w, 8 * sc);
      ctx.fillStyle = "#ffd166"; ctx.fillRect(0, h - 8 * sc, w * ((idx + prog) / total), 8 * sc);
    }
    ctx.restore();
    overlay(ctx, w, h, channel, sc, F);
  }
  function docSlide(ctx, w, h, s, prog, idx, total, channel, sc, F, hasPhoto) {
    ctx.save(); ctx.globalAlpha = Math.min(1, prog * 6);
    label(ctx, w, h, s.heading || "", "", sc, F);
    const pts = (s.points || []).filter(Boolean);
    if (!hasPhoto && pts.length) { // no picture: one big keyword at a time in the middle
      const k = Math.min(pts.length - 1, Math.floor(prog * pts.length)), v = w < h;
      ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = `bold ${(v ? 64 : 58) * sc}px ${F}`; ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 14 * sc;
      wrap(ctx, pts[k], w / 2, h * (v ? 0.42 : 0.47), w - 120 * sc, (v ? 76 : 68) * sc, 3); ctx.shadowBlur = 0;
    }
    ctx.restore(); ctx.save();
    subtitle(ctx, w, h, s.narration, prog, sc, F);
    ctx.fillStyle = "rgba(255,255,255,.15)"; ctx.fillRect(0, h - 8 * sc, w, 8 * sc);
    ctx.fillStyle = "#ffd166"; ctx.fillRect(0, h - 8 * sc, w * ((idx + prog) / total), 8 * sc);
    ctx.restore();
    overlay(ctx, w, h, channel, sc, F);
  }
  function overlay(ctx, w, h, channel, sc, F, dark) {
    if (channel) { ctx.textAlign = "right"; ctx.font = `${22 * sc}px ${F}`; ctx.fillStyle = dark ? "rgba(60,40,20,.75)" : "rgba(255,255,255,.6)"; ctx.fillText(channel, w - 24 * sc, 40 * sc); }
    // always on screen: education only
    ctx.textAlign = "left"; ctx.font = `bold ${18 * sc}px ${F}`;
    const dl = !EN() ? (plan && plan.legal === false ? "📚 सिर्फ जानकारी के लिए" : "📚 सिर्फ शिक्षा/जानकारी के लिए — कानूनी सलाह नहीं") : CAT() === "money" ? "📚 Learning only — not financial advice" : CAT() === "scam" ? "📚 Learning only — not legal or financial advice" : CAT() === "mind" ? "📚 Learning only — not medical advice" : GL() ? "📚 For learning & fun" : "📚 For education only — not legal advice";
    const dw = ctx.measureText(dl).width + 20 * sc;
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(14 * sc, 14 * sc, dw, 32 * sc);
    ctx.fillStyle = "#ffd166"; ctx.fillText(dl, 24 * sc, 36 * sc);
  }

  // ---------- cartoon (two original characters) ----------
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  // cartoon hand: palm + 4 fingers + thumb, pointing along the arm
  function hand(ctx, x, y, dir, s, skin, line, side, wig, shape, n) {
    let F = [[-0.5, 13], [-0.17, 16], [0.17, 15], [0.5, 12]].map(([a, l]) => [dir + a + (wig || 0), l * s]);
    let th = [dir - side * 1.25, 11 * s];
    if (shape === "point") { F = [[dir, 22 * s]]; th = [dir - side * 1.1, 8 * s]; }
    else if (shape === "fist") { F = [[dir - 0.3, 3 * s], [dir + 0.3, 3 * s]]; th = [dir - side * 1.2, 5 * s]; }
    else if (shape === "count") { const k = Math.max(1, Math.min(4, n || 1)); F = F.slice(0, k).map((f, i) => [dir + (i - (k - 1) / 2) * 0.32, 16 * s]); th = [dir - side * 1.3, 5 * s]; }
    const seg = ([a, l], from) => { ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * from, y + Math.sin(a) * from); ctx.lineTo(x + Math.cos(a) * (10 * s + l), y + Math.sin(a) * (10 * s + l)); ctx.stroke(); };
    ctx.lineCap = "round";
    ctx.strokeStyle = line; ctx.lineWidth = 9.5 * s; [...F, th].forEach(f => seg(f, 4 * s));
    ctx.fillStyle = skin; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.arc(x, y, 13 * s, 0, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = skin; ctx.lineWidth = 5 * s; [...F, th].forEach(f => seg(f, 6 * s));
    ctx.strokeStyle = line;
  }
  // ---------- story places and costumes (all drawn here → free, no limits) ----------
  const SCENES = { "": "🏠 Kamra (board)", thana: "🚓 Thana", court: "⚖️ Court", bazaar: "🧺 Bazaar", ghar: "🛋️ Ghar", gaon: "🌾 Gaon", sadak: "🛣️ Sadak / check-post", office: "💼 Office / bank", hospital: "🏥 Hospital", school: "🏫 School", car: "🚗 Gaadi mein safar", bike: "🛵 Bike par", walk: "🚶 Paidal", cycle: "🚲 Cycle par" };
  const MOVING = new Set(["car", "bike", "walk", "cycle"]);
  const DRESSES = { "": "Apne kapde", police: "👮 Police", vakil: "⚖️ Vakil", judge: "👨‍⚖️ Judge", dukaandaar: "🧺 Garib dukaandaar", office: "👔 Office wala", doctor: "🩺 Doctor", kisaan: "🌾 Kisaan" };
  const DRESS = {
    police: { shirt: "#c9ad72", chest: "police", hat: "police", pants: "#b39558" },
    vakil: { shirt: "#22222a", chest: "vakil", pants: "#1a1a20" },
    judge: { shirt: "#141418", chest: "judge", pants: "#141418" },
    dukaandaar: { shirt: "#efe8d8", chest: "gamchha", pants: "#f4efe2" },
    office: { shirt: "#9cc3e6", chest: "tie", pants: "#2f3a4f" },
    doctor: { shirt: "#f7f7f7", chest: "doctor", pants: "#3b4a66" },
    kisaan: { shirt: "#f4f1e6", chest: "kurta2", hat: "safa", pants: "#f4f1e6" },
  };
  const SCN_LIST = () => Object.keys(SCENES).map(k => k || "room").join(" | ");
  const DRS_LIST = "none | " + Object.keys(DRESS).join(" | ");
  const LABEL_SCENES = new Set(["thana", "court", "bazaar", "ghar", "gaon", "sadak", "office", "hospital"]);

  // ---------- body language: different movements for different kinds of speech ----------
  // positions are relative to the feet; shoulders at y=-120, chin ≈ -170, head centre -232
  function poseOf(g, f, t, prog, m) {
    const o = Math.sin(t * 5), o2 = Math.sin(t * 3.3 + 1), e = (m || 0) * 18;
    const idle = sd => ({ x: sd * 80, y: -12, shape: "open" });
    const H = (sd, x, y, shape, n) => ({ x, y, shape: shape || "open", n });
    const P = { hands: [idle(-1), idle(1)], tilt: 0, dy: 0, lean: 0, shake: 0, eyesUp: 0, wig: 0 };
    const set = (sd, h) => { P.hands[sd > 0 ? 1 : 0] = h; };
    switch (g) {
      case "explain": set(f, H(f, f * 118, -150 + o * 18 - e)); set(-f, H(-f, -f * 96, -78 + o2 * 12)); P.lean = 0.03 * f; P.wig = o * 0.15; break;
      case "both_open": set(1, H(1, 128, -122 + o * 12 - e)); set(-1, H(-1, -128, -122 - o * 12 - e)); P.tilt = 0.05 * o2; break;
      case "point_other": set(f, H(f, f * 158, -158 + o * 6, "point")); P.lean = 0.05 * f; break;
      case "point_board": set(f, H(f, f * 58, -335 + o * 8, "point")); P.eyesUp = 1; P.tilt = -0.05 * f; break;
      case "count": set(f, H(f, f * 100, -205, "count", 1 + Math.floor(Math.min(0.99, prog) * 3))); set(-f, H(-f, -f * 90, -70)); break;
      case "shrug": set(1, H(1, 122, -96, "open")); set(-1, H(-1, -122, -96, "open")); P.dy = -6; P.tilt = 0.13 * f; break;
      case "wag": set(f, H(f, f * 112 + Math.sin(t * 14) * 12, -232, "point")); set(-f, H(-f, -f * 80, -70, "fist")); P.lean = 0.06 * f; break;
      case "heart": set(-f, H(-f, -f * 8, -112)); set(f, H(f, f * (110 + o * 20), -170 + o2 * 25)); P.tilt = 0.08 * Math.sin(t * 1.5); break;
      case "laugh": set(1, H(1, 34, -58, "fist")); set(-1, H(-1, -34, -58, "fist")); P.dy = Math.abs(Math.sin(t * 13)) * -6; P.tilt = 0.06 * Math.sin(t * 9); break;
      case "think": set(f, H(f, f * 18, -168, "fist")); set(-f, H(-f, f * 8, -74, "fist")); P.tilt = -0.09 * f; P.eyesUp = 1; break;
      case "scratch": set(-f, H(-f, -f * 62, -292 + Math.sin(t * 16) * 5)); P.tilt = 0.1 * f; break;
      case "facepalm": set(f, H(f, f * 6, -262)); P.tilt = 0.06; break;
      case "clap": { const c = 14 + Math.abs(Math.sin(t * 11)) * 22; set(1, H(1, c, -132)); set(-1, H(-1, -c, -132)); break; }
      case "wave": set(f, H(f, f * 128 + Math.sin(t * 10) * 26, -262)); P.wig = Math.sin(t * 10) * 0.2; break;
      case "hip": set(1, H(1, 82, -72, "fist")); set(-1, H(-1, -82, -72, "fist")); P.lean = -0.02 * f; break;
      case "nod": P.tilt = Math.sin(t * 4) * 0.05; break;
    }
    return P;
  }
  const NEG = /नहीं|नही|मत |\bnahi(n)?\b|\bmat\b|\bno\b|\bnot\b|\bnever\b|n't\b/i;
  const NUMW = /(^|\s)(1|2|3|ek|do|teen|pehl[aie]|doosr[aie]|teesr[aie]|first|second|third|one|two|three|step)(\s|,|\.|$)|पहल|दूसर|तीसर|(^|\s)(एक|दो|तीन)(\s|$)/i;
  // which movement fits this line: mood first, then what is being said, then a varied pick
  function gestureFor(sl, idx, speaking, prog) {
    const txt = (sl && sl.narration) || "", mood = (sl && sl.mood) || "", q = /\?\s*$|\?["'”]?\s*$/.test(txt.trim());
    if (speaking) {
      if (mood === "daant") return "wag";
      if (mood === "shayari") return "heart";
      if (mood === "funny") return prog > 0.82 ? "laugh" : "both_open";
      if (mood === "serious") return NUMW.test(txt) ? "count" : "point_board";
      if (q && sl.who === "A") return prog < 0.6 ? "shrug" : "think";
      if (NUMW.test(txt)) return "count";
      const pool = ["explain", "point_other", "both_open", "point_board", "explain", "hip", "count"];
      return pool[(idx * 5 + (prog > 0.55 ? 3 : 0)) % pool.length];
    }
    if (mood === "funny") return prog > 0.35 ? "laugh" : "nod";
    if (mood === "daant") return prog > 0.5 ? "facepalm" : "scratch";
    if (mood === "shayari") return prog > 0.8 ? "clap" : "nod";
    if (q) return "think";
    if (mood === "serious") return "nod";
    return (idx % 4 === 1) ? "hip" : "nod";
  }

  // ✨ soft 3D look: shading gradients, softer outlines, shiny eyes, rosy cheeks
  let look3d = true;
  const tint = (hex, amt) => { // amt -1..1 → darker..lighter
    const n = parseInt(String(hex).replace("#", ""), 16); if (isNaN(n)) return hex;
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = v => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
    return "rgb(" + f(r) + "," + f(g) + "," + f(b) + ")";
  };
  const radial = (ctx, x, y, r, base) => { const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.08, x, y, r * 1.15); g.addColorStop(0, tint(base, 0.35)); g.addColorStop(0.55, base); g.addColorStop(1, tint(base, -0.28)); return g; };
  const sideGrad = (ctx, x1, x2, base) => { const g = ctx.createLinearGradient(x1, 0, x2, 0); g.addColorStop(0, tint(base, 0.28)); g.addColorStop(0.4, base); g.addColorStop(1, tint(base, -0.3)); return g; };

  // Original characters. Hindi channel: Pappu + Chacha. Global channel: Leo + Priya.
  const LOOKS = {
    pappu: { eye: "#6b3e26", skin: "#e0ac7e", shirt: "#f4a72b", hair: "spiky", hc: "#1d1a18", brow: "#1d1a18", chest: "star" },
    chacha: { eye: "#5a3a22", skin: "#d39a6a", shirt: "#3d6fb6", hair: "bald", hc: "#e8e6e1", brow: "#cfcac2", chest: "buttons", glasses: 1, mustache: 1 },
    leo: { eye: "#3d8fd6", skin: "#f3cba8", shirt: "#2fa37a", hair: "cap", hc: "#d9a441", cap: "#e2533c", brow: "#b5832e", chest: "hood", freckles: 1 },
    priya: { eye: "#7a4a2a", skin: "#c98d62", shirt: "#b0306a", hair: "braid", hc: "#1a1414", brow: "#1a1414", chest: "kurti", bindi: 1, lashes: 1, earrings: 1 },
    dadi: { eye: "#5a3a22", skin: "#d9a383", shirt: "#f6efe1", hair: "greybun", hc: "#e2e0db", brow: "#d9d6cf", chest: "saree", border: "#c1121f", glasses: "#b8860b", bindi: 1, lashes: 1, earrings: 1, pants: "#f6efe1" },
    meera: { eye: "#7a4a2a", skin: "#c98d62", shirt: "#127c7c", hair: "long", hc: "#1f1416", brow: "#1a1414", chest: "saree", border: "#f2c14e", bindi: 1, lashes: 1, earrings: 1, pants: "#127c7c" },
    prof: { eye: "#5a3a22", skin: "#a8714a", shirt: "#7a5c3e", hair: "curly", hc: "#9e9b96", brow: "#8d8a85", chest: "vest", glasses: "#222", beard: "#9e9b96", pants: "#5c5c66" },
    gurpreet: { eye: "#6b3e26", skin: "#e6b48f", shirt: "#264653", hair: "turban", hc: "#24181a", turban: "#f77f00", brow: "#1d1a18", chest: "jacket", inner: "#e9c46a", beard: "#24181a", pants: "#3a3a42" },
    zoya: { eye: "#6b3e26", skin: "#f6cdb0", shirt: "#f6f3ee", hair: "bun", hc: "#2a1d1a", brow: "#2a1d1a", chest: "jacket", inner: "#f2c94c", glasses: "#ff4d6d", lashes: 1, earrings: 1, pants: "#f2c94c" },
    anna: { eye: "#3f9142", skin: "#f6cdb0", shirt: "#5b8bd9", hair: "long", hc: "#e9c46a", brow: "#c9a227", chest: "collar", lashes: 1, earrings: 1, pants: "#e8e1d3" },
  };
  // who can play A / B (name, Hindi description, female?)
  const ROSTER = {
    pappu: ["Pappu", "aam aadmi, bhola, mazaakiya", 0], chacha: ["Chacha", "samajhdaar bade", 0], leo: ["Leo", "curious traveler", 0], priya: ["Priya", "warm Indian friend", 1],
    dadi: ["Dadi", "pyaari, tez-tarraar dadi", 1], meera: ["Meera", "samajhdaar teacher", 1], prof: ["Professor Rao", "gyaani professor", 0],
    gurpreet: ["Gurpreet", "mast, mazaakiya dost", 0], zoya: ["Zoya", "smart, tech wali ladki", 1], anna: ["Anna", "foreign traveller", 1],
  };
  const DEF_ACT = { in: { A: "pappu", B: "chacha" }, g: { A: "leo", B: "priya" } };
  const actorOf = who => (plan && plan.actors && plan.actors[who]) || DEF_ACT[GL() ? "g" : "in"][who] || "pappu";
  const lookOf = who => LOOKS[actorOf(who)] || LOOKS.pappu;
  // mouth 0..1 (open), face: +1 looks right, -1 looks left
  function drawChar(ctx, x, y, s, who, mouth, blink, talking, tsec, face, emo, P) {
    const L = lookOf(who), ph = who === "A" ? 0 : 2;
    P = P || poseOf(talking ? "explain" : "nod", face, tsec, 0.5, mouth);
    const bob = emo === "happy" ? Math.abs(Math.sin(tsec * 13)) * -5 * s : emo === "serious" ? 0 : talking ? Math.sin(tsec * 9) * 2.5 * s : Math.sin(tsec * 1.6 + ph) * 1.5 * s;
    ctx.save(); ctx.translate(x + Math.sin(tsec * 0.7 + ph) * 3 * s, y + bob + (P.dy || 0) * s); ctx.rotate(P.lean || 0);
    const DR = DRESS[P.dress] || null, chest = DR ? DR.chest : L.chest;
    const shirt = DR ? DR.shirt : L.shirt, skin = L.skin, line = look3d ? "rgba(43,36,32,.6)" : "#2b2420";
    ctx.lineWidth = 4 * s; ctx.strokeStyle = line; ctx.lineJoin = "round"; ctx.lineCap = "round";
    if (L.hair === "braid" || L.hair === "bun" || L.hair === "greybun") { ctx.fillStyle = L.hc; ctx.beginPath(); ctx.ellipse(0, -215 * s, 76 * s, 92 * s, 0, 0, 7); ctx.fill(); }
    if (L.hair === "long") { ctx.fillStyle = look3d ? sideGrad(ctx, -90 * s, 90 * s, L.hc) : L.hc; ctx.beginPath(); ctx.moveTo(-78 * s, -240 * s); ctx.quadraticCurveTo(-96 * s, -120 * s, -70 * s, -95 * s); ctx.lineTo(70 * s, -95 * s); ctx.quadraticCurveTo(96 * s, -120 * s, 78 * s, -240 * s); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.ellipse(0, -225 * s, 80 * s, 92 * s, 0, 0, 7); ctx.fill(); }
    if (P.legs) { // walking or pedalling legs (hip → knee → foot), drawn behind the shirt
      const pants = (DRESS[P.dress] || {}).pants || L.pants || "#3b4a66"; // (dress first, then the actor's own)
      [-1, 1].forEach(side => {
        const hx = side * 32 * s, hy = -6 * s; let fx, fy2, kx, ky;
        if (P.legs.mode === "walk") {
          const a = Math.sin(P.legs.ph + (side > 0 ? Math.PI : 0)) * 0.42, b = Math.max(0, Math.sin(P.legs.ph + (side > 0 ? Math.PI : 0) + 1.2)) * 0.5;
          kx = hx + Math.sin(a) * 60 * s; ky = hy + Math.cos(a) * 60 * s; fx = kx + Math.sin(a - b) * 60 * s; fy2 = ky + Math.cos(a - b) * 60 * s;
        } else { // pedal: feet go round the crank, knees forward (IK)
          const f = P.legs.feet[side > 0 ? 1 : 0]; fx = f.x * s; fy2 = f.y * s;
          const dx = fx - hx, dy = fy2 - hy, d = Math.min(Math.hypot(dx, dy), 118 * s), base = Math.atan2(dy, dx), k = Math.acos(Math.max(-1, Math.min(1, d / (120 * s))));
          kx = hx + Math.cos(base - k * P.legs.dir) * 60 * s; ky = hy + Math.sin(base - k * P.legs.dir) * 60 * s;
        }
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.strokeStyle = line; ctx.lineWidth = 32 * s; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy2); ctx.stroke();
        ctx.strokeStyle = pants; ctx.lineWidth = 25 * s; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy2); ctx.stroke();
        ctx.fillStyle = "#3a2a20"; ctx.beginPath(); ctx.ellipse(fx + 8 * s, fy2 + 4 * s, 22 * s, 11 * s, 0, 0, 7); ctx.fill();
      });
      ctx.lineWidth = 4 * s;
    }
    // body
    if (look3d && P.legs && P.legs.mode === "walk") { const sh = ctx.createRadialGradient(0, 118 * s, 4 * s, 0, 118 * s, 90 * s); sh.addColorStop(0, "rgba(0,0,0,.28)"); sh.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = sh; ctx.beginPath(); ctx.ellipse(0, 118 * s, 95 * s, 16 * s, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = look3d ? sideGrad(ctx, -78 * s, 78 * s, shirt) : shirt; rr(ctx, -78 * s, -150 * s, 156 * s, 160 * s, 46 * s); ctx.fill(); ctx.stroke();
    if (look3d) { const tg = ctx.createLinearGradient(0, -150 * s, 0, 10 * s); tg.addColorStop(0, "rgba(255,255,255,.22)"); tg.addColorStop(0.35, "rgba(255,255,255,0)"); tg.addColorStop(1, "rgba(0,0,0,.14)"); ctx.fillStyle = tg; rr(ctx, -78 * s, -150 * s, 156 * s, 160 * s, 46 * s); ctx.fill(); }
    if (chest === "police") {
      ctx.fillStyle = "#5a3d1e"; ctx.fillRect(-76 * s, -46 * s, 152 * s, 14 * s); ctx.fillStyle = "#d9b44a"; ctx.fillRect(-10 * s, -48 * s, 20 * s, 18 * s);
      ctx.strokeStyle = "rgba(60,40,10,.45)"; ctx.lineWidth = 3 * s; [-1, 1].forEach(d => { ctx.strokeRect((d > 0 ? 14 : -50) * s, -118 * s, 36 * s, 30 * s); });
      ctx.fillStyle = "#3b2a14"; [-1, 1].forEach(d => ctx.fillRect((d > 0 ? 50 : -78) * s, -150 * s, 28 * s, 10 * s));
      ctx.fillStyle = "#e9c46a"; ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = (k % 2 ? 6 : 13) * s; ctx.lineTo(-32 * s + Math.cos(a) * r, -104 * s + Math.sin(a) * r); } ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#1d1d22"; ctx.fillRect(18 * s, -132 * s, 30 * s, 8 * s); ctx.strokeStyle = line; ctx.lineWidth = 4 * s;
    } else if (chest === "vakil" || chest === "judge") {
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(-26 * s, -150 * s); ctx.lineTo(0, -95 * s); ctx.lineTo(26 * s, -150 * s); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillRect(-11 * s, -146 * s, 9 * s, 34 * s); ctx.fillRect(2 * s, -146 * s, 9 * s, 34 * s);
      ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 3 * s; [-1, 1].forEach(d => { ctx.beginPath(); ctx.moveTo(d * 28 * s, -148 * s); ctx.lineTo(d * 12 * s, -60 * s); ctx.stroke(); });
      if (chest === "judge") { ctx.strokeStyle = "rgba(255,255,255,.08)"; for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(k * 20 * s, -80 * s); ctx.lineTo(k * 24 * s, 8 * s); ctx.stroke(); } }
      ctx.strokeStyle = line; ctx.lineWidth = 4 * s;
    } else if (chest === "gamchha") {
      ctx.fillStyle = "rgba(0,0,0,.08)"; ctx.beginPath(); ctx.ellipse(0, -148 * s, 34 * s, 14 * s, 0, 0, Math.PI); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.moveTo(-70 * s, -150 * s); ctx.lineTo(-40 * s, -150 * s); ctx.lineTo(70 * s, -20 * s); ctx.lineTo(40 * s, -10 * s); ctx.closePath(); ctx.fillStyle = "#c1121f"; ctx.fill(); ctx.clip();
      ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 3 * s; for (let k = -10; k < 14; k++) { ctx.beginPath(); ctx.moveTo(k * 14 * s, -160 * s); ctx.lineTo(k * 14 * s + 160 * s, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(k * 14 * s, 0); ctx.lineTo(k * 14 * s + 160 * s, -160 * s); ctx.stroke(); }
      ctx.restore(); ctx.strokeStyle = line; ctx.lineWidth = 4 * s;
    } else if (chest === "tie") {
      ctx.fillStyle = "#fff"; [-1, 1].forEach(d => { ctx.beginPath(); ctx.moveTo(0, -128 * s); ctx.lineTo(d * 34 * s, -152 * s); ctx.lineTo(d * 10 * s, -150 * s); ctx.fill(); });
      ctx.fillStyle = "#b5172f"; ctx.beginPath(); ctx.moveTo(-8 * s, -136 * s); ctx.lineTo(8 * s, -136 * s); ctx.lineTo(13 * s, -60 * s); ctx.lineTo(0, -46 * s); ctx.lineTo(-13 * s, -60 * s); ctx.closePath(); ctx.fill();
    } else if (chest === "doctor") {
      ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 3 * s; [-1, 1].forEach(d => { ctx.beginPath(); ctx.moveTo(d * 26 * s, -148 * s); ctx.lineTo(d * 6 * s, -40 * s); ctx.stroke(); });
      ctx.strokeRect(26 * s, -100 * s, 30 * s, 26 * s); ctx.fillStyle = "#1d6fd1"; ctx.fillRect(34 * s, -110 * s, 4 * s, 18 * s);
      ctx.strokeStyle = "#6b7280"; ctx.lineWidth = 5 * s; ctx.beginPath(); ctx.moveTo(-30 * s, -150 * s); ctx.quadraticCurveTo(-46 * s, -100 * s, -20 * s, -80 * s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(30 * s, -150 * s); ctx.quadraticCurveTo(20 * s, -110 * s, -20 * s, -80 * s); ctx.stroke();
      ctx.fillStyle = "#c0c4cc"; ctx.beginPath(); ctx.arc(-20 * s, -74 * s, 10 * s, 0, 7); ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = 4 * s;
    } else if (chest === "kurta2") { ctx.beginPath(); ctx.moveTo(0, -145 * s); ctx.lineTo(0, -90 * s); ctx.stroke(); }
    else if (chest === "buttons") { ctx.beginPath(); ctx.moveTo(0, -140 * s); ctx.lineTo(0, -40 * s); ctx.stroke(); [-110, -85, -60].forEach(by => { ctx.fillStyle = "#f3e6c8"; ctx.beginPath(); ctx.arc(8 * s, by * s, 4 * s, 0, 7); ctx.fill(); }); }
    else if (chest === "star") { ctx.fillStyle = "#fff"; ctx.font = `bold ${26 * s}px sans-serif`; ctx.textAlign = "center"; ctx.fillText("★", 0, -70 * s); }
    else if (chest === "hood") {
      ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(0, -146 * s, 46 * s, 16 * s, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = "#f4f1e8"; ctx.lineWidth = 3 * s; [-14, 14].forEach(dx => { ctx.beginPath(); ctx.moveTo(dx * s, -138 * s); ctx.lineTo(dx * s, -100 * s); ctx.stroke(); });
      ctx.strokeStyle = line; ctx.lineWidth = 3 * s; rr(ctx, -40 * s, -60 * s, 80 * s, 34 * s, 10 * s); ctx.stroke(); ctx.lineWidth = 4 * s;
    } else if (chest === "saree") {
      ctx.save(); ctx.beginPath(); ctx.moveTo(-70 * s, -150 * s); ctx.lineTo(-30 * s, -152 * s); ctx.lineTo(78 * s, -30 * s); ctx.lineTo(78 * s, 6 * s); ctx.closePath(); ctx.fillStyle = tint(shirt, -0.12); ctx.fill();
      ctx.strokeStyle = L.border || "#c1121f"; ctx.lineWidth = 8 * s; ctx.beginPath(); ctx.moveTo(-30 * s, -150 * s); ctx.lineTo(78 * s, -28 * s); ctx.stroke(); ctx.restore();
      ctx.fillStyle = L.border || "#c1121f"; ctx.fillRect(-76 * s, -4 * s, 152 * s, 10 * s); ctx.strokeStyle = line; ctx.lineWidth = 4 * s;
    } else if (chest === "vest") {
      ctx.fillStyle = "#eef3fb"; ctx.beginPath(); ctx.moveTo(-34 * s, -150 * s); ctx.lineTo(0, -70 * s); ctx.lineTo(34 * s, -150 * s); ctx.fill();
      ctx.fillStyle = "#a4161a"; ctx.beginPath(); ctx.moveTo(-6 * s, -140 * s); ctx.lineTo(6 * s, -140 * s); ctx.lineTo(8 * s, -90 * s); ctx.lineTo(0, -80 * s); ctx.lineTo(-8 * s, -90 * s); ctx.fill();
      [-110, -80, -50].forEach(by => { ctx.fillStyle = "#3b2a1a"; ctx.beginPath(); ctx.arc(10 * s, by * s, 4 * s, 0, 7); ctx.fill(); });
    } else if (chest === "jacket") {
      ctx.fillStyle = L.inner || "#e9c46a"; ctx.beginPath(); ctx.moveTo(-26 * s, -150 * s); ctx.lineTo(0, -40 * s); ctx.lineTo(26 * s, -150 * s); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 3 * s; for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(-76 * s, (-150 + k * 40) * s); ctx.quadraticCurveTo(0, (-140 + k * 40) * s, 76 * s, (-150 + k * 40) * s); ctx.stroke(); }
      ctx.strokeStyle = line; ctx.lineWidth = 4 * s;
    } else if (chest === "collar") {
      ctx.fillStyle = "#fff"; [-1, 1].forEach(d => { ctx.beginPath(); ctx.moveTo(0, -128 * s); ctx.lineTo(d * 34 * s, -152 * s); ctx.lineTo(d * 10 * s, -150 * s); ctx.fill(); });
      [-110, -80, -50].forEach(by => { ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.beginPath(); ctx.arc(0, by * s, 4 * s, 0, 7); ctx.fill(); });
    } else if (chest === "kurti") {
      ctx.strokeStyle = "#f2c14e"; ctx.lineWidth = 5 * s; ctx.beginPath(); ctx.moveTo(-24 * s, -148 * s); ctx.lineTo(0, -108 * s); ctx.lineTo(24 * s, -148 * s); ctx.stroke();
      ctx.fillStyle = "#f2c14e"; for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.arc(k * 20 * s, -24 * s, 3.5 * s, 0, 7); ctx.fill(); }
      ctx.strokeStyle = line; ctx.lineWidth = 4 * s;
    }
    // braid falls over one shoulder
    if (L.hair === "braid") { ctx.fillStyle = L.hc; const bs = -face; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.ellipse(bs * 58 * s, (-178 + k * 21) * s, (13 - k) * s, 13 * s, 0, 0, 7); ctx.fill(); } ctx.fillStyle = "#e2533c"; ctx.beginPath(); ctx.arc(bs * 58 * s, -78 * s, 6 * s, 0, 7); ctx.fill(); }
    // neck + head
    ctx.fillStyle = skin; ctx.fillRect(-18 * s, -172 * s, 36 * s, 30 * s);
    const hy = -232 * s, nod = (!talking ? Math.sin(tsec * 2.2 + ph) * 0.04 : (mouth || 0) * 0.05) + (P.tilt || 0);
    ctx.save(); ctx.translate(0, hy); ctx.rotate(nod);
    if (P.shake) ctx.translate(Math.sin(tsec * 18) * 6 * s * P.shake, 0);
    ctx.lineWidth = 4 * s; ctx.strokeStyle = line;
    if (look3d) ctx.fillStyle = radial(ctx, 0, 0, 70 * s, skin);
    ctx.beginPath(); ctx.ellipse(0, 0, 66 * s, 72 * s, 0, 0, 7); ctx.fill(); ctx.stroke();
    if (look3d) [-1, 1].forEach(d => { const cg = ctx.createRadialGradient(d * 38 * s, 24 * s, 1, d * 38 * s, 24 * s, 20 * s); cg.addColorStop(0, "rgba(255,105,120,.45)"); cg.addColorStop(1, "rgba(255,105,120,0)"); ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(d * 38 * s, 24 * s, 20 * s, 0, 7); ctx.fill(); });
    ctx.fillStyle = skin;
    [-1, 1].forEach(sd => { ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(sd * 66 * s, 6 * s, 12 * s, 17 * s, 0, 0, 7); ctx.fill(); ctx.stroke();
      if (L.earrings) { ctx.fillStyle = "#f2c14e"; ctx.beginPath(); ctx.arc(sd * 68 * s, 28 * s, 6 * s, 0, 7); ctx.fill(); } });
    // hair
    if (L.hair === "spiky") {
      ctx.fillStyle = L.hc; ctx.beginPath(); ctx.moveTo(-66 * s, -6 * s);
      ctx.quadraticCurveTo(-70 * s, -80 * s, 0, -78 * s); ctx.quadraticCurveTo(70 * s, -80 * s, 66 * s, -6 * s);
      for (let k = 4; k >= -4; k--) ctx.lineTo(k * 15 * s, (-38 + (k % 2 ? 10 : -6)) * s);
      ctx.closePath(); ctx.fill();
    } else if (L.hair === "bald") {
      ctx.fillStyle = L.hc; [-1, 1].forEach(sd => { ctx.beginPath(); ctx.ellipse(sd * 58 * s, -18 * s, 16 * s, 28 * s, sd * 0.3, 0, 7); ctx.fill(); });
      ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.ellipse(-18 * s, -50 * s, 16 * s, 8 * s, -0.4, 0, 7); ctx.fill();
    } else if (L.hair === "cap") {
      ctx.fillStyle = L.hc; [-1, 1].forEach(sd => { ctx.beginPath(); ctx.ellipse(sd * 56 * s, -22 * s, 16 * s, 22 * s, sd * 0.4, 0, 7); ctx.fill(); });
      ctx.fillStyle = L.cap; ctx.beginPath(); ctx.arc(0, -36 * s, 64 * s, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(face * 50 * s, -36 * s, 40 * s, 9 * s, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, -70 * s, 9 * s, 0, 7); ctx.fill();
    } else if (L.hair === "curly") {
      for (let k = 0; k < 11; k++) { const a = Math.PI * (1.0 + k * 0.1), cx2 = Math.cos(a) * 64 * s, cy2 = Math.sin(a) * 60 * s - 6 * s; ctx.fillStyle = look3d ? radial(ctx, cx2, cy2, 22 * s, L.hc) : L.hc; ctx.beginPath(); ctx.arc(cx2, cy2, 22 * s, 0, 7); ctx.fill(); }
    } else if (L.hair === "turban") {
      ctx.fillStyle = look3d ? radial(ctx, 0, -60 * s, 80 * s, L.turban) : L.turban; ctx.beginPath(); ctx.moveTo(-70 * s, -8 * s); ctx.quadraticCurveTo(-82 * s, -125 * s, 0, -120 * s); ctx.quadraticCurveTo(82 * s, -125 * s, 70 * s, -8 * s); ctx.quadraticCurveTo(0, -46 * s, -70 * s, -8 * s); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,.15)"; ctx.lineWidth = 4 * s; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(-66 * s, (-26 - k * 22) * s); ctx.quadraticCurveTo(0, (-66 - k * 16) * s, 66 * s, (-36 - k * 18) * s); ctx.stroke(); }
      ctx.strokeStyle = line; ctx.lineWidth = 4 * s;
    } else if (L.hair === "braid" || L.hair === "long" || L.hair === "bun" || L.hair === "greybun") {
      if (L.hair === "bun" || L.hair === "greybun") { ctx.fillStyle = look3d ? radial(ctx, 0, -92 * s, 26 * s, L.hc) : L.hc; ctx.beginPath(); ctx.arc(0, -92 * s, 26 * s, 0, 7); ctx.fill(); }
      ctx.fillStyle = L.hc; ctx.beginPath(); ctx.moveTo(-68 * s, 4 * s);
      ctx.quadraticCurveTo(-72 * s, -84 * s, 0, -80 * s); ctx.quadraticCurveTo(72 * s, -84 * s, 68 * s, 4 * s);
      ctx.quadraticCurveTo(56 * s, -40 * s, 4 * s, -50 * s); ctx.lineTo(-4 * s, -50 * s); ctx.quadraticCurveTo(-56 * s, -40 * s, -68 * s, 4 * s); ctx.fill();
    }
    if (look3d && L.hair !== "bald") { ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.lineWidth = 6 * s; ctx.beginPath(); ctx.arc(-10 * s, -10 * s, 62 * s, -2.45, -1.75); ctx.stroke(); ctx.strokeStyle = line; ctx.lineWidth = 4 * s; }
    if (DR && DR.hat === "police") {
      ctx.fillStyle = "#c9ad72"; ctx.beginPath(); ctx.moveTo(-70 * s, -40 * s); ctx.lineTo(-62 * s, -92 * s); ctx.quadraticCurveTo(0, -118 * s, 62 * s, -92 * s); ctx.lineTo(70 * s, -40 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#3b2a14"; ctx.fillRect(-70 * s, -54 * s, 140 * s, 16 * s);
      ctx.fillStyle = "#1d1d22"; ctx.beginPath(); ctx.ellipse(face * 30 * s, -38 * s, 62 * s, 12 * s, 0, 0, Math.PI); ctx.fill();
      ctx.fillStyle = "#e9c46a"; ctx.beginPath(); ctx.arc(0, -76 * s, 10 * s, 0, 7); ctx.fill();
    } else if (DR && DR.hat === "safa") {
      ctx.fillStyle = "#f77f00"; ctx.beginPath(); ctx.moveTo(-70 * s, -10 * s); ctx.quadraticCurveTo(-78 * s, -110 * s, 0, -104 * s); ctx.quadraticCurveTo(78 * s, -110 * s, 70 * s, -10 * s); ctx.quadraticCurveTo(0, -48 * s, -70 * s, -10 * s); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,.15)"; ctx.lineWidth = 4 * s; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(-66 * s, (-30 - k * 22) * s); ctx.quadraticCurveTo(0, (-70 - k * 18) * s, 66 * s, (-40 - k * 18) * s); ctx.stroke(); }
      ctx.strokeStyle = line; ctx.lineWidth = 4 * s;
    }
    // eyes (look at the other character)
    const ex = face * 5 * s - (P.eyesUp ? 0 : 0), eyY = P.eyesUp ? -5 * s : 0;
    ctx.strokeStyle = line;
    if (emo === "happy" && !talking) { // laughing: eyes squeezed shut
      ctx.lineWidth = 3.5 * s; [-24, 24].forEach(dx => { ctx.beginPath(); ctx.arc(dx * s, -2 * s, 10 * s, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); });
    } else [-24, 24].forEach(dx => {
      if (blink) { ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo((dx - 10) * s, -6 * s); ctx.lineTo((dx + 10) * s, -6 * s); ctx.stroke(); return; }
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(dx * s, -6 * s, 12 * s, 14 * s, 0, 0, 7); ctx.fill(); ctx.lineWidth = 2.5 * s; ctx.stroke();
      if (look3d) { // coloured iris + shine
        const ix = dx * s + ex, iy = -3 * s + eyY, ig = ctx.createRadialGradient(ix, iy + 3 * s, 1, ix, iy, 9 * s);
        ig.addColorStop(0, L.eye || "#7a4a2a"); ig.addColorStop(1, "#1a0e08"); ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(ix, iy, 9 * s, 0, 7); ctx.fill();
        ctx.fillStyle = "#0b0604"; ctx.beginPath(); ctx.arc(ix, iy + 1 * s, 4.2 * s, 0, 7); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ix - 3.2 * s, iy - 3.5 * s, 2.8 * s, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(ix + 3 * s, iy + 3 * s, 1.3 * s, 0, 7); ctx.fill();
      } else { ctx.fillStyle = line; ctx.beginPath(); ctx.arc(dx * s + ex, -4 * s + eyY, 6 * s, 0, 7); ctx.fill(); }
      if (L.lashes) { const o = Math.sign(dx); ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo((dx + o * 9) * s, -16 * s); ctx.lineTo((dx + o * 17) * s, -22 * s); ctx.stroke(); }
    });
    // eyebrows (raised while talking)
    ctx.lineWidth = 5 * s; ctx.strokeStyle = L.brow;
    const br = emo === "serious" ? 3 * s : talking ? -6 * s : 0;
    [-24, 24].forEach(dx => {
      const o = Math.sign(dx); // o>0 right brow; inner end is near the nose
      let yi = -28 * s + br, yo = -30 * s + br;
      if (emo === "angry") { yi = -20 * s; yo = -34 * s; } else if (emo === "sad") { yi = -36 * s; yo = -26 * s; }
      ctx.beginPath(); ctx.moveTo((dx - o * 12) * s, yi); ctx.lineTo((dx + o * 12) * s, yo); ctx.stroke();
    });
    if (emo === "angry") { ctx.fillStyle = "rgba(220,50,50,.28)"; [-40, 40].forEach(cx => { ctx.beginPath(); ctx.ellipse(cx * s, 20 * s, 13 * s, 8 * s, 0, 0, 7); ctx.fill(); }); }
    ctx.strokeStyle = line; ctx.lineWidth = 3 * s;
    if (L.glasses) { if (typeof L.glasses === "string") ctx.strokeStyle = L.glasses; [-24, 24].forEach(dx => { ctx.beginPath(); ctx.arc(dx * s, -6 * s, 19 * s, 0, 7); ctx.stroke(); }); ctx.beginPath(); ctx.moveTo(-5 * s, -6 * s); ctx.lineTo(5 * s, -6 * s); ctx.stroke(); ctx.strokeStyle = line; }
    if (L.bindi) { ctx.fillStyle = "#d62839"; ctx.beginPath(); ctx.arc(0, -30 * s, 4.5 * s, 0, 7); ctx.fill(); }
    if (L.freckles) { ctx.fillStyle = "rgba(160,90,50,.55)"; [[-38, 16], [-30, 22], [-44, 22], [38, 16], [30, 22], [44, 22]].forEach(([fx, fy]) => { ctx.beginPath(); ctx.arc(fx * s, fy * s, 2.2 * s, 0, 7); ctx.fill(); }); }
    // nose
    ctx.beginPath(); ctx.moveTo(face * 2 * s, 4 * s); ctx.quadraticCurveTo(face * 12 * s, 20 * s, 0, 22 * s); ctx.stroke();
    if (L.beard) { ctx.fillStyle = look3d ? radial(ctx, 0, 50 * s, 70 * s, L.beard) : L.beard; ctx.beginPath(); ctx.moveTo(-62 * s, 8 * s); ctx.quadraticCurveTo(-64 * s, 90 * s, 0, 96 * s); ctx.quadraticCurveTo(64 * s, 90 * s, 62 * s, 8 * s); ctx.quadraticCurveTo(40 * s, 50 * s, 0, 30 * s); ctx.quadraticCurveTo(-40 * s, 50 * s, -62 * s, 8 * s); ctx.fill(); }
    // mouth
    const my = 42 * s;
    if (mouth > 0.08) {
      ctx.fillStyle = "#6b2b2b"; ctx.beginPath(); ctx.ellipse(0, my, 18 * s, (4 + 15 * Math.min(1, mouth)) * s, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#e66"; ctx.beginPath(); ctx.ellipse(0, my + (3 + 8 * Math.min(1, mouth)) * s, 9 * s, 4 * s, 0, 0, 7); ctx.fill();
    } else if (emo === "happy") { // big laugh
      ctx.fillStyle = "#6b2b2b"; ctx.beginPath(); ctx.moveTo(-22 * s, my - 6 * s); ctx.quadraticCurveTo(0, my + 30 * s, 22 * s, my - 6 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.fillRect(-14 * s, my - 6 * s, 28 * s, 6 * s);
    } else if (emo === "sad" || emo === "serious") { ctx.beginPath(); ctx.arc(0, my + (emo === "sad" ? 14 : 4) * s, 14 * s, Math.PI + 0.5, -0.5); ctx.stroke(); }
    else { if (L.lashes) { ctx.strokeStyle = "#a63a46"; ctx.lineWidth = 4.5 * s; } ctx.beginPath(); ctx.arc(0, my - 12 * s, 18 * s, 0.35, Math.PI - 0.35); ctx.stroke(); ctx.strokeStyle = line; }
    if (L.mustache) { ctx.fillStyle = "#e8e6e1"; ctx.beginPath(); ctx.moveTo(-30 * s, 30 * s); ctx.quadraticCurveTo(0, 18 * s, 30 * s, 30 * s); ctx.quadraticCurveTo(0, 38 * s, -30 * s, 30 * s); ctx.fill(); }
    ctx.restore(); // head
    // arms: shoulder → elbow → hand, so hands can reach chin, head, belly, board…
    const A1 = 58 * s, A2 = 58 * s;
    [-1, 1].forEach(side => {
      const h = P.hands[side > 0 ? 1 : 0], sx = side * 66 * s, sy = -122 * s;
      let hx = h.x * s, hy2 = h.y * s;
      let dx = hx - sx, dy = hy2 - sy, d = Math.hypot(dx, dy);
      const maxD = A1 + A2 - 2 * s; if (d > maxD) { hx = sx + dx / d * maxD; hy2 = sy + dy / d * maxD; dx = hx - sx; dy = hy2 - sy; d = maxD; }
      d = Math.max(d, 8 * s);
      const base = Math.atan2(dy, dx), k = Math.acos(Math.max(-1, Math.min(1, (A1 * A1 + d * d - A2 * A2) / (2 * A1 * d))));
      const c1 = [sx + Math.cos(base + k) * A1, sy + Math.sin(base + k) * A1], c2 = [sx + Math.cos(base - k) * A1, sy + Math.sin(base - k) * A1];
      const el = (c1[0] * side + c1[1] * 0.3) > (c2[0] * side + c2[1] * 0.3) ? c1 : c2; // elbow out and down
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = line; ctx.lineWidth = 30 * s; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(el[0], el[1]); ctx.lineTo(hx, hy2); ctx.stroke();
      ctx.strokeStyle = look3d ? sideGrad(ctx, sx - 30 * s, sx + 30 * s, shirt) : shirt; ctx.lineWidth = 23 * s; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(el[0], el[1]); ctx.lineTo(hx, hy2); ctx.stroke();
      hand(ctx, hx, hy2, Math.atan2(hy2 - el[1], hx - el[0]), s, skin, line, side, P.wig || 0, h.shape, h.n);
    });
    ctx.restore();
  }
  // a different place for each kind of topic, so videos don't all look the same
  function cartoonScene(ctx, w, h, tsec, sid) {
    const sc = Math.min(w, h) / 720, v = w < h, fy = h * (v ? 0.86 : 0.8); let cat = sid || CAT();
    const grad = (a, b) => { const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, a); g.addColorStop(1, b); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); };
    const rnd = k => { const x = Math.sin(k * 127.1) * 43758.5453; return x - Math.floor(x); };
    const T = (hi, en) => (GL() ? en : hi);
    const sign = (x0, y0, ww, hh, bgc, fg, text) => { ctx.fillStyle = bgc; ctx.fillRect(x0, y0, ww, hh); ctx.fillStyle = fg; ctx.font = `bold ${hh * 0.5}px 'Noto Sans Devanagari',sans-serif`; ctx.textAlign = "center"; ctx.fillText(text, x0 + ww / 2, y0 + hh * 0.68, ww * 0.92); };
    const R = (x0, y0, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(x0, y0, ww, hh); };
    if (cat === "thana") {
      grad("#e8eef4", "#d6e0ea"); R(0, fy - h * 0.28, w, h * 0.28, "#4a6fa5"); R(0, fy - h * 0.285, w, 6 * sc, "#2e4a75");
      sign(w * 0.3, 140 * sc, w * 0.4, 70 * sc, "#1d3557", "#fff", T("पुलिस थाना", "POLICE STATION"));
      R(w * 0.07, h * 0.22, 170 * sc, 130 * sc, "#b08968"); [[0, 0, "#fff"], [60, 10, "#ffe8a3"], [20, 60, "#fff"], [100, 55, "#cde7ff"]].forEach(([dx, dy, c]) => R(w * 0.07 + (14 + dx) * sc, h * 0.22 + (12 + dy) * sc, 50 * sc, 56 * sc, c));
      if (!v) { R(w * 0.78, h * 0.2, 150 * sc, 110 * sc, "#9fd3f0"); ctx.strokeStyle = "#555"; ctx.lineWidth = 6 * sc; for (let k = 1; k < 6; k++) { ctx.beginPath(); ctx.moveTo(w * 0.78 + k * 25 * sc, h * 0.2); ctx.lineTo(w * 0.78 + k * 25 * sc, h * 0.2 + 110 * sc); ctx.stroke(); } }
      R(w * 0.32, fy - 60 * sc, w * 0.36, 18 * sc, "#8d6e4c"); R(w * 0.34, fy - 42 * sc, 12 * sc, 42 * sc, "#6b4f33"); R(w * 0.64, fy - 42 * sc, 12 * sc, 42 * sc, "#6b4f33");
      R(0, fy, w, h - fy, "#9aa3ad"); ctx.strokeStyle = "rgba(0,0,0,.08)"; for (let x0 = 0; x0 < w; x0 += 80 * sc) { ctx.beginPath(); ctx.moveTo(x0, fy); ctx.lineTo(x0 - 40 * sc, h); ctx.stroke(); }
      return fy;
    }
    if (cat === "court") {
      grad("#7a4b26", "#5c3618"); ctx.fillStyle = "rgba(0,0,0,.12)"; for (let x0 = 0; x0 < w; x0 += 60 * sc) ctx.fillRect(x0, 0, 4 * sc, fy);
      R(w * 0.25, fy - h * 0.3, w * 0.5, h * 0.3, "#3e2410"); R(w * 0.25, fy - h * 0.3, w * 0.5, 14 * sc, "#a0703c");
      ctx.font = `${70 * sc}px sans-serif`; ctx.textAlign = "center"; ctx.fillText("⚖️", w / 2, fy - h * 0.12);
      sign(w * 0.32, 140 * sc, w * 0.36, 64 * sc, "#2b1608", "#f2c14e", T("न्यायालय", "COURT"));
      [0.12, 0.88].forEach(f => { R(w * f - 30 * sc, 0, 60 * sc, fy, "#8e1b1b"); ctx.fillStyle = "rgba(0,0,0,.18)"; for (let k = 0; k < 4; k++) ctx.fillRect(w * f - 30 * sc + k * 15 * sc, 0, 4 * sc, fy); });
      R(0, fy, w, h - fy, "#6d1a1a"); return fy;
    }
    if (cat === "bazaar") {
      grad("#ffd9a0", "#fff1d6");
      const cols = [["#d62828", "#fff"], ["#2a9d8f", "#fff"], ["#f4a261", "#fff"], ["#6a4c93", "#fff"]];
      for (let i = 0, x0 = -20 * sc; x0 < w; i++, x0 += 230 * sc) {
        const [a, b] = cols[i % 4], top = fy - (v ? 330 : 300) * sc;
        R(x0 + 10 * sc, top + 50 * sc, 200 * sc, (v ? 280 : 250) * sc, "rgba(120,80,40,.25)");
        for (let k = 0; k < 8; k++) R(x0 + k * 27 * sc, top, 27 * sc, 50 * sc, k % 2 ? b : a);
        ctx.fillStyle = a; ctx.beginPath(); for (let k = 0; k <= 8; k++) ctx.arc(x0 + k * 27 * sc + 13 * sc, top + 50 * sc, 13 * sc, 0, Math.PI); ctx.fill();
        R(x0 + 10 * sc, fy - 90 * sc, 200 * sc, 20 * sc, "#8d6e4c");
        const prod = ["#e63946", "#80b918", "#7b2cbf", "#ffb703"];
        for (let k = 0; k < 12; k++) { ctx.fillStyle = prod[(i + k) % 4]; ctx.beginPath(); ctx.arc(x0 + (26 + (k % 6) * 30) * sc, fy - (100 + Math.floor(k / 6) * 18) * sc, 13 * sc, 0, 7); ctx.fill(); }
      }
      R(0, fy, w, h - fy, "#c9a27e"); return fy;
    }
    if (cat === "ghar") {
      grad("#ffe5d4", "#ffd3b8");
      if (!v) { R(w * 0.72, h * 0.14, 190 * sc, 150 * sc, "#bde0fe"); R(w * 0.72 - 20 * sc, h * 0.12, 50 * sc, 190 * sc, "#e76f51"); R(w * 0.72 + 160 * sc, h * 0.12, 50 * sc, 190 * sc, "#e76f51"); }
      R(w * 0.1, h * 0.16, 110 * sc, 80 * sc, "#8d6e4c"); R(w * 0.1 + 8 * sc, h * 0.16 + 8 * sc, 94 * sc, 64 * sc, "#a8dadc");
      ctx.fillStyle = "#6d597a"; ctx.beginPath(); ctx.roundRect(w * 0.3, fy - 120 * sc, w * 0.4, 100 * sc, 30 * sc); ctx.fill(); ctx.fillStyle = "#b56576"; ctx.beginPath(); ctx.roundRect(w * 0.32, fy - 150 * sc, w * 0.36, 60 * sc, 24 * sc); ctx.fill();
      R(0, fy, w, h - fy, "#b5835a"); ctx.fillStyle = "rgba(0,0,0,.08)"; for (let x0 = 0; x0 < w; x0 += 70 * sc) ctx.fillRect(x0, fy, 3 * sc, h - fy); return fy;
    }
    if (cat === "gaon") {
      grad("#8ecae6", "#e0f4ff"); ctx.fillStyle = "#ffd166"; ctx.beginPath(); ctx.arc(w * 0.82, h * (v ? 0.4 : 0.18), 50 * sc, 0, 7); ctx.fill();
      R(0, fy - h * 0.16, w, h * 0.16, "#90be6d"); ctx.fillStyle = "#6a994e"; for (let k = 0; k < 6; k++) ctx.fillRect(0, fy - h * 0.16 + k * h * 0.027, w, 4 * sc);
      [[0.12, 1], [0.7, 0.85]].forEach(([f, z]) => { const hx = w * f, hw = 170 * sc * z, hh = 110 * sc * z, by = fy - h * 0.1; R(hx, by - hh, hw, hh, "#c08552"); R(hx + hw * 0.4, by - hh * 0.6, hw * 0.2, hh * 0.6, "#5c3a1a"); ctx.fillStyle = "#d4a373"; ctx.beginPath(); ctx.moveTo(hx - 20 * sc * z, by - hh); ctx.lineTo(hx + hw / 2, by - hh - 80 * sc * z); ctx.lineTo(hx + hw + 20 * sc * z, by - hh); ctx.fill(); });
      R(w * 0.45, fy - h * 0.38, 26 * sc, h * 0.28, "#7f5539"); ctx.fillStyle = "#2d6a4f"; [[0, -60], [-50, -30], [50, -30], [0, -10]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(w * 0.45 + 13 * sc + dx * sc, fy - h * 0.38 + dy * sc, 60 * sc, 0, 7); ctx.fill(); });
      R(0, fy, w, h - fy, "#b08968"); return fy;
    }
    if (cat === "sadak") {
      grad("#a2d2ff", "#eaf4ff");
      for (let i = 0, x0 = 0; x0 < w; i++) { const bw = (90 + rnd(i) * 90) * sc, bh = (150 + rnd(i + 5) * 220) * sc; R(x0, fy - h * 0.12 - bh, bw - 8 * sc, bh, ["#cdb4db", "#ffc8dd", "#bde0fe", "#e9edc9"][i % 4]); ctx.fillStyle = "rgba(255,255,255,.6)"; for (let yy = fy - h * 0.12 - bh + 14 * sc; yy < fy - h * 0.12 - 20 * sc; yy += 34 * sc) for (let xx = x0 + 12 * sc; xx < x0 + bw - 24 * sc; xx += 26 * sc) ctx.fillRect(xx, yy, 14 * sc, 18 * sc); x0 += bw; }
      R(0, fy - h * 0.12, w, h * 0.12, "#6c757d"); ctx.fillStyle = "#fff"; for (let x0 = 0; x0 < w; x0 += 120 * sc) ctx.fillRect(x0, fy - h * 0.065, 60 * sc, 8 * sc);
      R(w * 0.78, fy - h * 0.2, 16 * sc, h * 0.2, "#444"); for (let k = 0; k < 7; k++) R(w * 0.78 - k * 40 * sc - 40 * sc, fy - h * 0.18, 40 * sc, 12 * sc, k % 2 ? "#fff" : "#d62828");
      R(0, fy, w, h - fy, "#adb5bd"); return fy;
    }
    if (cat === "office") {
      grad("#eef1f5", "#dde3ea"); if (!v) { R(w * 0.7, h * 0.12, 200 * sc, 150 * sc, "#cfe8ff"); ctx.fillStyle = "rgba(0,0,0,.12)"; for (let k = 0; k < 9; k++) ctx.fillRect(w * 0.7, h * 0.12 + k * 17 * sc, 200 * sc, 5 * sc); }
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(w * 0.16, h * 0.2, 40 * sc, 0, 7); ctx.fill(); ctx.strokeStyle = "#333"; ctx.lineWidth = 4 * sc; ctx.stroke(); ctx.beginPath(); ctx.moveTo(w * 0.16, h * 0.2); ctx.lineTo(w * 0.16, h * 0.2 - 26 * sc); ctx.moveTo(w * 0.16, h * 0.2); ctx.lineTo(w * 0.16 + 18 * sc, h * 0.2); ctx.stroke();
      R(w * 0.3, fy - 110 * sc, w * 0.4, 22 * sc, "#8d6e4c"); R(w * 0.45, fy - 200 * sc, 110 * sc, 80 * sc, "#222"); R(w * 0.45 + 6 * sc, fy - 194 * sc, 98 * sc, 64 * sc, "#4cc9f0");
      R(0, fy, w, h - fy, "#8d99ae"); return fy;
    }
    if (cat === "hospital") {
      grad("#e9f7f3", "#d3efe7"); sign(w * 0.33, 140 * sc, w * 0.34, 64 * sc, "#fff", "#2a9d8f", T("अस्पताल", "HOSPITAL"));
      ctx.fillStyle = "#2a9d8f"; ctx.fillRect(w * 0.1, h * 0.2, 24 * sc, 70 * sc); ctx.fillRect(w * 0.1 - 23 * sc, h * 0.2 + 23 * sc, 70 * sc, 24 * sc);
      R(w * 0.35, fy - 90 * sc, w * 0.3, 40 * sc, "#fff"); R(w * 0.35, fy - 50 * sc, 10 * sc, 50 * sc, "#adb5bd"); R(w * 0.65 - 10 * sc, fy - 50 * sc, 10 * sc, 50 * sc, "#adb5bd"); R(w * 0.35, fy - 110 * sc, 70 * sc, 26 * sc, "#cde7ff");
      R(0, fy, w, h - fy, "#b7c4c0"); return fy;
    }
    if (cat === "school") cat = "hindi";
    if (cat === "india") {
      grad("#ff9f68", "#ffe2b8");
      ctx.fillStyle = "#ffd166"; ctx.beginPath(); ctx.arc(w * (v ? 0.78 : 0.86), h * (v ? 0.48 : 0.2), 55 * sc, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(140,60,60,.28)";
      for (let i = 0, x = 0; x < w; i++) {
        const bw = (60 + rnd(i) * 90) * sc, bh = (90 + rnd(i + 9) * 170) * sc;
        ctx.fillRect(x, fy - bh, bw - 6 * sc, bh);
        if (rnd(i + 3) > 0.45) { ctx.beginPath(); ctx.arc(x + bw / 2 - 3 * sc, fy - bh, bw / 2 - 8 * sc, Math.PI, 0); ctx.fill(); ctx.fillRect(x + bw / 2 - 5 * sc, fy - bh - bw / 2 - 18 * sc, 4 * sc, 20 * sc); }
        x += bw;
      }
      ctx.fillStyle = "#c98b4f"; ctx.fillRect(0, fy, w, h - fy);
      // marigold string on top
      for (let x = 10 * sc; x < w; x += 34 * sc) { if (!v && x > w * 0.25 && x < w * 0.75) continue; ctx.fillStyle = (x / sc) % 68 < 34 ? "#ff9f1c" : "#ffd166"; ctx.beginPath(); ctx.arc(x, (12 + 10 * Math.sin(x / (60 * sc))) * sc + 60 * sc, 9 * sc, 0, 7); ctx.fill(); }
      return fy;
    }
    if (cat === "how") {
      grad("#0b1030", "#24306a");
      for (let i = 0; i < 70; i++) { ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.5 * Math.abs(Math.sin(tsec * 1.5 + i))})`; ctx.beginPath(); ctx.arc(rnd(i) * w, rnd(i + 50) * fy, (1 + rnd(i + 99) * 2) * sc, 0, 7); ctx.fill(); }
      const px = w * (v ? 0.8 : 0.88), py = h * (v ? 0.5 : 0.22);
      ctx.fillStyle = "#e07a5f"; ctx.beginPath(); ctx.arc(px, py, 42 * sc, 0, 7); ctx.fill();
      ctx.strokeStyle = "#f2cc8f"; ctx.lineWidth = 6 * sc; ctx.beginPath(); ctx.ellipse(px, py, 70 * sc, 16 * sc, -0.3, 0, 7); ctx.stroke();
      ctx.fillStyle = "#2a2350"; ctx.fillRect(0, fy, w, h - fy);
      ctx.strokeStyle = "rgba(120,200,255,.25)"; ctx.lineWidth = 2 * sc; for (let x = 0; x < w; x += 60 * sc) { ctx.beginPath(); ctx.moveTo(x, fy); ctx.lineTo(x + 40 * sc, h); ctx.stroke(); }
      return fy;
    }
    if (cat === "history") {
      grad("#f3e4c0", "#dcc08a");
      ctx.strokeStyle = "rgba(120,80,40,.18)"; ctx.lineWidth = 3 * sc;
      for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(0, (120 + k * 90) * sc); for (let x = 0; x <= w; x += 40 * sc) ctx.lineTo(x, (120 + k * 90) * sc + Math.sin(x / (90 * sc) + k) * 18 * sc); ctx.stroke(); }
      ctx.fillStyle = "rgba(120,80,40,.15)"; [0.05, 0.95].forEach(f => { if (!v) ctx.fillRect(w * f - 25 * sc, 40 * sc, 50 * sc, fy - 40 * sc); });
      ctx.fillStyle = "#8a6a43"; ctx.fillRect(0, fy, w, h - fy);
      return fy;
    }
    if (cat === "hindi") {
      grad("#e3f6ec", "#c3e6d3");
      const L = ["अ", "आ", "इ", "ई", "उ", "क", "ख", "ग", "घ", "च", "ज", "त", "द", "न", "प", "म"];
      ctx.font = `bold ${20 * sc}px 'Noto Sans Devanagari',sans-serif`; ctx.textAlign = "center";
      for (let i = 0, x = 20 * sc; x < w; i++, x += 46 * sc) {
        if (!v && x > w * 0.24 && x < w * 0.76) continue; // keep clear of the board
        const yy = 52 * sc + 8 * sc * Math.sin(x / (80 * sc));
        ctx.fillStyle = ["#ef476f", "#ffd166", "#06d6a0", "#118ab2"][i % 4]; ctx.beginPath(); ctx.moveTo(x - 18 * sc, yy); ctx.lineTo(x + 18 * sc, yy); ctx.lineTo(x, yy + 40 * sc); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.fillText(L[i % L.length], x, yy + 24 * sc);
      }
      ctx.fillStyle = "#b9824f"; ctx.fillRect(0, fy, w, h - fy);
      return fy;
    }
    grad("#fbe7c6", "#f6d29b");
    ctx.fillStyle = "#b9824f"; ctx.fillRect(0, fy, w, h - fy);
    ctx.fillStyle = "rgba(0,0,0,.08)"; for (let x = 0; x < w; x += 90) ctx.fillRect(x, fy, 3, h - fy);
    // window with moving cloud
    const wx = w - 210 * sc, wy = 60 * sc;
    if (!v) {
      ctx.fillStyle = "#9fd3f0"; ctx.fillRect(wx, wy, 150 * sc, 120 * sc);
      ctx.fillStyle = "#fff"; const cx = wx + ((tsec * 8) % 190) - 20 * sc; ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, 150 * sc, 120 * sc); ctx.clip();
      [0, 18, 36].forEach((d, k) => { ctx.beginPath(); ctx.arc(cx + d * sc, wy + 50 * sc - (k === 1 ? 8 : 0) * sc, 16 * sc, 0, 7); ctx.fill(); }); ctx.restore();
      ctx.strokeStyle = "#7a5230"; ctx.lineWidth = 8 * sc; ctx.strokeRect(wx, wy, 150 * sc, 120 * sc); ctx.beginPath(); ctx.moveTo(wx + 75 * sc, wy); ctx.lineTo(wx + 75 * sc, wy + 120 * sc); ctx.stroke();
    }
    return fy;
  }
  function boardBig(ctx, w, h, text, emoji, sc, F) {
    const v = w < h, bx = v ? 50 * sc : w * 0.27, by = v ? 120 * sc : 70 * sc, bw = v ? w - 100 * sc : w * 0.46, bh = v ? 380 * sc : 230 * sc;
    ctx.fillStyle = "#7a5230"; rr(ctx, bx - 12 * sc, by - 12 * sc, bw + 24 * sc, bh + 24 * sc, 14 * sc); ctx.fill();
    ctx.fillStyle = "#2f5d48"; ctx.fillRect(bx, by, bw, bh);
    ctx.textAlign = "center"; ctx.fillStyle = "#f6f3e8";
    let y = by + bh * 0.38;
    if (emoji) { ctx.font = `${(v ? 90 : 60) * sc}px sans-serif`; ctx.fillText(emoji, bx + bw / 2, y); y += (v ? 90 : 60) * sc; }
    else y = by + bh * 0.42;
    ctx.font = `bold ${(v ? 50 : 40) * sc}px ${F}`;
    wrap(ctx, text || "", bx + bw / 2, y, bw - 40 * sc, (v ? 60 : 48) * sc, 3);
  }
  // ---------- topic photos (Wikimedia Commons, free licenses only) ----------
  const imgs = {}; // url -> HTMLImageElement (loaded)
  const sets = {}; // search words -> { list, i }
  const stripTags = h => String(h || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  const OK_LIC = /^(cc0|public domain|pd\b|pd-|cc[ -]by(-sa)?[ -]?\d)/i;
  async function commons(q) {
    const u = "https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({ action: "query", format: "json", origin: "*", generator: "search", gsrnamespace: "6",
      gsrsearch: q + " filetype:bitmap", gsrlimit: "20", prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "1280",
      iiextmetadatafilter: "LicenseShortName|Artist" });
    const res = await fetch(u); if (!res.ok) throw new Error("Wikimedia: " + res.status);
    const j = await res.json();
    return Object.values((j.query || {}).pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0)).map(p => {
      const ii = (p.imageinfo || [])[0] || {}, m = ii.extmetadata || {};
      return { url: ii.thumburl || ii.url, w: ii.width || 0, h: ii.height || 0, mime: ii.mime || "", page: ii.descriptionurl || "",
        license: stripTags((m.LicenseShortName || {}).value), artist: stripTags((m.Artist || {}).value).slice(0, 80) || "unknown", title: String(p.title || "").replace(/^File:/, "") };
    }).filter(x => x.url && /jpe?g|png/i.test(x.mime) && x.w >= 800 && x.h >= 450 && OK_LIC.test(x.license));
  }
  function loadImg(url) {
    if (imgs[url]) return Promise.resolve(imgs[url]);
    const viaTag = () => new Promise(ok => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => { imgs[url] = im; ok(im); }; im.onerror = () => ok(null); im.src = url; });
    if (/^blob:/.test(url)) return viaTag();
    return fetch(url).then(r => { if (!r.ok) throw 0; return r.blob(); })
      .then(b => new Promise(ok => { const im = new Image(); im.onload = () => { imgs[url] = im; ok(im); }; im.onerror = () => ok(null); im.src = URL.createObjectURL(b); }))
      .catch(viaTag);
  }
  function photoRow(s, i) {
    if (!s.photo) return `<span class="muted">🖼️ ${s.photoQ ? "Photo: " + esc(s.photoQ) + " — dhundhna baaki" : "Photo nahi (pichhli line wali chalegi)"}</span> <button class="btn" data-phown="${i}">📷 Apni</button>`;
    return `<img src="${esc(s.photo.url)}" alt="" style="width:76px;height:44px;object-fit:cover;border-radius:6px"> <span class="muted">${esc(s.photo.own ? "Aapki photo" : s.photo.title.slice(0, 28))}</span>
      ${s.photo.own ? "" : `<button class="btn" data-phnext="${i}">🔄 Doosri</button>`}<button class="btn" data-phdel="${i}">✕</button><button class="btn" data-phown="${i}">📷 Apni</button>`;
  }
  function bindPhotoRows() {
    $$("[data-phnext]").forEach(b => b.onclick = async () => {
      const i = +b.dataset.phnext, s = plan.slides[i], set = sets[s.photoQ]; if (!set || !set.list.length) return;
      set.i = (set.i + 1) % set.list.length; const c = set.list[set.i];
      plan.slides.forEach(x => { if (x.photoQ === s.photoQ) x.photo = c; }); await loadImg(c.url); refreshPhotoRows();
    });
    $$("[data-phdel]").forEach(b => b.onclick = () => { const s = plan.slides[+b.dataset.phdel]; s.photo = null; s.photoQ = ""; refreshPhotoRows(); });
    $$("[data-phown]").forEach(b => b.onclick = () => {
      const i = +b.dataset.phown, inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
      inp.onchange = async () => { const f = inp.files && inp.files[0]; if (!f) return; const url = URL.createObjectURL(f);
        if (await loadImg(url)) { plan.slides[i].photo = { url, own: true, title: "", artist: "", license: "", page: "" }; refreshPhotoRows(); } else toast("Photo khul nahi payi"); };
      inp.click();
    });
  }
  function refreshPhotoRows() {
    plan.slides.forEach((s, i) => { const el = $(`[data-phrow="${i}"]`); if (el) el.innerHTML = photoRow(s, i); });
    bindPhotoRows(); credits();
  }
  // add/refresh "Photo credits" at the end of the description (CC licenses need attribution)
  function credits() {
    const seen = new Set(), list = [];
    plan.slides.forEach(s => { const p = s.photo; if (p && !p.own && !seen.has(p.page)) { seen.add(p.page); list.push(`• "${p.title}" — ${p.artist} (${p.license}), Wikimedia Commons: ${p.page}`); } });
    const d = $("#vd"); const base = (d ? d.value : plan.description || "").replace(/\n*📷 Photo credits:[\s\S]*$/, "");
    plan.description = base + (list.length ? "\n\n📷 Photo credits:\n" + list.join("\n") : "");
    if (d) d.value = plan.description;
  }
  async function findPhotos(manual) {
    const qs = [...new Set(plan.slides.map(s => s.photoQ).filter(Boolean))].slice(0, 8);
    const out = $("#vmsg");
    if (!qs.length) { if (manual) toast("Script mein photo ke liye koi cheez nahi mili — 📷 Apni photo laga sakte ho"); return; }
    let got = 0, failed = 0;
    for (let k = 0; k < qs.length; k++) {
      const q = qs[k];
      if (out) out.innerHTML = `<span class="dots"><i></i><i></i><i></i></span> Photo dhundh raha hoon… ${k + 1}/${qs.length} (${esc(q)})`;
      try {
        if (!sets[q]) sets[q] = { list: await commons(q), i: 0 };
        const set = sets[q];
        while (set.i < set.list.length && !(await loadImg(set.list[set.i].url))) set.i++;
        const c = set.list[set.i];
        if (c) { got++; plan.slides.forEach(s => { if (s.photoQ === q && !(s.photo && s.photo.own)) s.photo = c; }); }
      } catch (e) { failed++; }
    }
    if (out) out.textContent = got ? `✅ ${got} photo mili — har line ke neeche dekho, pasand na aaye to 🔄 Doosri ya 📷 Apni` : failed ? "⚠️ Photo nahi mil payi (internet?) — 📷 Apni photo laga sakte ho" : "Is topic ki free photo nahi mili — 📷 Apni photo laga sakte ho";
    refreshPhotoRows();
  }
  function photoAt(idx) {
    if (!plan || plan.noPhotos || !plan.slides) return null;
    for (let i = Math.min(idx, plan.slides.length - 1); i >= 0; i--) { const p = plan.slides[i].photo; if (p) return imgs[p.url] || null; }
    for (const s of plan.slides) if (s.photo) return imgs[s.photo.url] || null; // title: first photo
    return null;
  }
  const phCache = new WeakMap();
  function photoBg(ctx, w, h, img, tsec, idx) {
    // scale + darken once, then just slide the ready picture slowly (cheap per frame)
    let m = phCache.get(img);
    if (!m || m.k !== w + "x" + h) {
      const W2 = Math.round(w * 1.1), H2 = Math.round(h * 1.1), c = document.createElement("canvas"); c.width = W2; c.height = H2;
      const x = c.getContext("2d"), r = Math.max(W2 / img.naturalWidth, H2 / img.naturalHeight), dw = img.naturalWidth * r, dh = img.naturalHeight * r;
      x.drawImage(img, (W2 - dw) / 2, (H2 - dh) / 2, dw, dh);
      const g = x.createLinearGradient(0, 0, 0, H2);
      g.addColorStop(0, "rgba(0,0,0,.45)"); g.addColorStop(0.35, "rgba(0,0,0,.08)"); g.addColorStop(0.65, "rgba(0,0,0,.15)"); g.addColorStop(1, "rgba(0,0,0,.65)");
      x.fillStyle = g; x.fillRect(0, 0, W2, H2);
      m = { k: w + "x" + h, c }; phCache.set(img, m);
    }
    const ox = (m.c.width - w) * (0.5 + 0.5 * Math.sin(tsec * 0.12 + idx)), oy = (m.c.height - h) * (0.5 + 0.5 * Math.cos(tsec * 0.09 + idx));
    ctx.drawImage(m.c, -ox, -oy);
  }
  // small label instead of the big board, so the photo stays visible
  function label(ctx, w, h, text, emoji, sc, F) {
    const v = w < h, t = (emoji ? emoji + "  " : "") + (text || "");
    if (!t.trim()) return;
    ctx.font = `bold ${(v ? 40 : 34) * sc}px ${F}`; ctx.textAlign = "center";
    const tw = Math.min(w - 40 * sc, ctx.measureText(t).width + 50 * sc), y = (v ? 120 : 70) * sc;
    ctx.fillStyle = "rgba(20,30,40,.72)"; rr(ctx, (w - tw) / 2, y, tw, (v ? 64 : 56) * sc, 18 * sc); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillText(t, w / 2, y + (v ? 44 : 39) * sc, w - 60 * sc);
  }

  // ---------- travel scenes: scrolling road + vehicles (drawn every frame) ----------
  function movingBg(ctx, w, h, tsec, sid) {
    const sc = Math.min(w, h) / 720, v = w < h, fy = h * (v ? 0.8 : 0.78);
    const spd = { car: 1, bike: 0.9, cycle: 0.45, walk: 0.22 }[sid] || 0.5;
    const rnd = k => { const x = Math.sin(k * 127.1) * 43758.5453; return x - Math.floor(x); };
    const g = ctx.createLinearGradient(0, 0, 0, fy); g.addColorStop(0, "#7cc4f5"); g.addColorStop(1, "#e3f4ff"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, fy);
    // far buildings (slow)
    const far = (tsec * 25 * spd) % (120 * sc);
    for (let i = -1, x0 = -far; x0 < w; i++, x0 += 120 * sc) { const k = Math.floor((tsec * 25 * spd) / (120 * sc)) + i + 2, bh = (120 + rnd(k) * 200) * sc; ctx.fillStyle = ["#c8d6e5", "#b8c9db", "#d5dfe9"][k % 3]; ctx.fillRect(x0, fy - h * 0.12 - bh, 110 * sc, bh); }
    // trees / poles (mid)
    const mid = (tsec * 140 * spd) % (260 * sc);
    for (let x0 = -mid; x0 < w + 260 * sc; x0 += 260 * sc) { ctx.fillStyle = "#7f5539"; ctx.fillRect(x0 + 20 * sc, fy - h * 0.12 - 140 * sc, 18 * sc, 140 * sc); ctx.fillStyle = "#52b788"; ctx.beginPath(); ctx.arc(x0 + 29 * sc, fy - h * 0.12 - 160 * sc, 62 * sc, 0, 7); ctx.fill(); ctx.fillStyle = "#40916c"; ctx.beginPath(); ctx.arc(x0 + 60 * sc, fy - h * 0.12 - 130 * sc, 44 * sc, 0, 7); ctx.fill(); }
    // footpath + road (fast)
    ctx.fillStyle = "#b7b7a4"; ctx.fillRect(0, fy - h * 0.12, w, h * 0.12);
    if (sid === "walk") { ctx.strokeStyle = "rgba(0,0,0,.12)"; ctx.lineWidth = 3 * sc; const o = (tsec * 140 * spd) % (60 * sc); for (let x0 = -o; x0 < w; x0 += 60 * sc) { ctx.beginPath(); ctx.moveTo(x0, fy - h * 0.12); ctx.lineTo(x0 - 20 * sc, fy); ctx.stroke(); } }
    ctx.fillStyle = "#5c636a"; ctx.fillRect(0, fy, w, h - fy);
    const fast = (tsec * 420 * spd) % (160 * sc); ctx.fillStyle = "#f8f9fa"; for (let x0 = -fast; x0 < w; x0 += 160 * sc) ctx.fillRect(x0, fy + (h - fy) * 0.45, 80 * sc, 8 * sc);
    return fy;
  }
  function wheel(ctx, x, y, r, tsec, spin) {
    ctx.fillStyle = "#1f1f24"; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.fillStyle = "#adb5bd"; ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, 7); ctx.fill();
    ctx.strokeStyle = "#495057"; ctx.lineWidth = r * 0.08; for (let k = 0; k < 5; k++) { const a = -tsec * spin + k * 1.2566; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5); ctx.stroke(); }
  }
  function spokeWheel(ctx, x, y, r, tsec, spin) {
    ctx.strokeStyle = "#1f1f24"; ctx.lineWidth = r * 0.14; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
    ctx.strokeStyle = "#868e96"; ctx.lineWidth = r * 0.03; for (let k = 0; k < 12; k++) { const a = -tsec * spin + k * 0.5236; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.stroke(); }
    ctx.fillStyle = "#495057"; ctx.beginPath(); ctx.arc(x, y, r * 0.1, 0, 7); ctx.fill();
  }
  // returns where to stand the two characters, plus what to draw behind/in front of them
  function travelLayout(sid, w, h, sc, v, fy, tsec) {
    const bump = Math.sin(tsec * 15) * 2.5 * sc;
    if (sid === "car") {
      const L = (v ? 640 : 820) * sc, cx = w / 2, bot = fy + 40 * sc + bump, cs = (v ? 0.82 : 0.86) * sc, winTop = bot - 320 * sc, winBot = bot - 175 * sc;
      const headY = bot - 245 * sc;
      return { cs, A: { x: cx - L * 0.2, cy: headY + 232 * cs }, B: { x: cx + L * 0.2, cy: headY + 232 * cs },
        back: ctx2 => { ctx2.fillStyle = "#e63946"; rr(ctx2, cx - L * 0.36, winTop - 10 * sc, L * 0.72, 150 * sc, 70 * sc); ctx2.fill(); ctx2.fillStyle = "#cfe8f7"; rr(ctx2, cx - L * 0.33, winTop + 6 * sc, L * 0.66, winBot - winTop - 6 * sc, 50 * sc); ctx2.fill(); },
        front: ctx2 => {
          ctx2.fillStyle = "#e63946"; rr(ctx2, cx - L / 2, winBot, L, bot - winBot - 20 * sc, 46 * sc); ctx2.fill();
          ctx2.fillStyle = "#c1121f"; ctx2.fillRect(cx - L * 0.012, winTop, L * 0.024, winBot - winTop);
          ctx2.fillStyle = "rgba(255,255,255,.18)"; ctx2.fillRect(cx - L / 2 + 30 * sc, winBot + 30 * sc, L - 60 * sc, 10 * sc);
          ctx2.fillStyle = "#ffd166"; ctx2.beginPath(); ctx2.ellipse(cx + L / 2 - 20 * sc, winBot + 50 * sc, 20 * sc, 14 * sc, 0, 0, 7); ctx2.fill();
          ctx2.fillStyle = "#adb5bd"; ctx2.fillRect(cx - 40 * sc, winBot + 40 * sc, 22 * sc, 6 * sc); ctx2.fillRect(cx + 60 * sc, winBot + 40 * sc, 22 * sc, 6 * sc);
          wheel(ctx2, cx - L * 0.3, bot - 20 * sc, 62 * sc, tsec, 9); wheel(ctx2, cx + L * 0.3, bot - 20 * sc, 62 * sc, tsec, 9);
        } };
    }
    if (sid === "bike") {
      const cx = w / 2, cs = (v ? 0.8 : 0.82) * sc, seat = fy - 40 * sc + bump;
      return { cs, A: { x: cx + 40 * sc, cy: seat }, B: { x: cx - 80 * sc, cy: seat - 8 * sc }, backFirst: "B", hands: { A: [[80, -40], [56, -30]] },
        front: ctx2 => {
          wheel(ctx2, cx - 170 * sc, fy + 20 * sc, 58 * sc, tsec, 10); wheel(ctx2, cx + 190 * sc, fy + 20 * sc, 58 * sc, tsec, 10);
          ctx2.fillStyle = "#264653"; ctx2.beginPath(); ctx2.moveTo(cx - 200 * sc, seat + 10 * sc); ctx2.lineTo(cx + 150 * sc, seat - 10 * sc); ctx2.lineTo(cx + 190 * sc, fy + 20 * sc); ctx2.lineTo(cx - 170 * sc, fy + 20 * sc); ctx2.closePath(); ctx2.fill();
          ctx2.fillStyle = "#2a9d8f"; rr(ctx2, cx + 30 * sc, seat - 40 * sc, 140 * sc, 60 * sc, 26 * sc); ctx2.fill();
          ctx2.fillStyle = "#111"; rr(ctx2, cx - 190 * sc, seat - 8 * sc, 230 * sc, 22 * sc, 10 * sc); ctx2.fill();
          ctx2.strokeStyle = "#111"; ctx2.lineWidth = 10 * sc; ctx2.beginPath(); ctx2.moveTo(cx + 170 * sc, seat - 40 * sc); ctx2.lineTo(cx + 150 * sc, seat - 110 * sc); ctx2.stroke();
          ctx2.fillStyle = "#ffd166"; ctx2.beginPath(); ctx2.arc(cx + 205 * sc, seat - 40 * sc, 16 * sc, 0, 7); ctx2.fill();
        } };
    }
    if (sid === "cycle") {
      const cs = (v ? 0.72 : 0.78) * sc, xs = v ? [w * 0.28, w * 0.72] : [w * 0.3, w * 0.7], R = (v ? 50 : 56) * sc, wy = fy + 10 * sc;
      const crank = x => ({ x, y: wy - 8 * sc }), seatY = wy - 120 * sc;
      const frame = (ctx2, x, col) => {
        spokeWheel(ctx2, x - 95 * sc, wy, R, tsec, 7); spokeWheel(ctx2, x + 95 * sc, wy, R, tsec, 7);
        ctx2.strokeStyle = col; ctx2.lineWidth = 9 * sc; ctx2.lineJoin = "round"; ctx2.beginPath();
        ctx2.moveTo(x - 95 * sc, wy); ctx2.lineTo(x - 10 * sc, wy - 8 * sc); ctx2.lineTo(x - 30 * sc, seatY + 14 * sc); ctx2.lineTo(x - 95 * sc, wy);
        ctx2.moveTo(x - 30 * sc, seatY + 14 * sc); ctx2.lineTo(x + 70 * sc, seatY + 20 * sc); ctx2.lineTo(x - 10 * sc, wy - 8 * sc);
        ctx2.moveTo(x + 70 * sc, seatY + 20 * sc); ctx2.lineTo(x + 95 * sc, wy); ctx2.moveTo(x + 70 * sc, seatY + 20 * sc); ctx2.lineTo(x + 62 * sc, seatY - 30 * sc); ctx2.stroke();
        ctx2.fillStyle = "#111"; rr(ctx2, x - 55 * sc, seatY + 4 * sc, 50 * sc, 14 * sc, 7 * sc); ctx2.fill();
        ctx2.strokeStyle = "#111"; ctx2.lineWidth = 8 * sc; ctx2.beginPath(); ctx2.moveTo(x + 45 * sc, seatY - 32 * sc); ctx2.lineTo(x + 82 * sc, seatY - 30 * sc); ctx2.stroke();
      };
      const pedal = (x, cs2, ph) => { const c = crank(x - 10 * sc); return [0, Math.PI].map(o => ({ x: (c.x + Math.cos(tsec * 6 + o + ph) * 22 * sc - (x - 30 * sc)) / cs2, y: (c.y + Math.sin(tsec * 6 + o + ph) * 22 * sc - (seatY + 4 * sc)) / cs2 })); };
      return { cs, A: { x: xs[0] - 30 * sc, cy: seatY + 4 * sc, legs: { mode: "pedal", dir: -1, feet: pedal(xs[0], cs, 0) } }, B: { x: xs[1] - 30 * sc, cy: seatY + 4 * sc, legs: { mode: "pedal", dir: -1, feet: pedal(xs[1], cs, 1.3) } },
        hands: { A: [[96, -42], [96, -42]], B: [[96, -42], [96, -42]] },
        front: ctx2 => { frame(ctx2, xs[0], "#e76f51"); frame(ctx2, xs[1], "#3a86ff"); } };
    }
    // walk
    const cs = (v ? 0.8 : 0.84) * sc, leg = 120 * cs;
    return { cs, A: { x: v ? w * 0.3 : w * 0.34, cy: fy - h * 0.02 - leg, legs: { mode: "walk", ph: tsec * 6.5 } }, B: { x: v ? w * 0.7 : w * 0.66, cy: fy - h * 0.02 - leg, legs: { mode: "walk", ph: tsec * 6.5 + 1.1 } } };
  }

  // the drawn room/space/street stays the same during a video → draw it once and reuse (smoother video)
  let sceneC = null, sceneK = "";
  const sceneMap = new Map();
  function sceneCache(w, h, sid) {
    const k = (sid || CAT()) + "|" + w + "|" + h + "|" + (GL() ? "g" : "in");
    if (!sceneMap.has(k)) { if (sceneMap.size > 12) sceneMap.clear(); const c = document.createElement("canvas"); c.width = w; c.height = h; cartoonScene(c.getContext("2d"), w, h, 0, sid); sceneMap.set(k, c); }
    return sceneMap.get(k);
  }
  const sceneAt = idx => { if (!plan || !plan.slides) return ""; for (let i = Math.min(idx, plan.slides.length - 1); i >= 0; i--) if (plan.slides[i].scene != null) return plan.slides[i].scene; return ""; };
  function cartoonFrame(ctx, w, h, kind, s, prog, idx, total, channel, tsec, mouth) {
    const sc = Math.min(w, h) / 720, F = "'Noto Sans Devanagari','Noto Sans',sans-serif", v = w < h;
    const ph = photoAt(kind === "slide" ? idx : kind === "end" ? 1e9 : 0);
    const sid = sceneAt(kind === "slide" ? idx : kind === "end" ? 1e9 : 0);
    const moving = !ph && MOVING.has(sid);
    let fyM = 0;
    if (ph) photoBg(ctx, w, h, ph, tsec, idx); else if (moving) fyM = movingBg(ctx, w, h, tsec, sid); else ctx.drawImage(sceneCache(w, h, sid), 0, 0);
    const board = ph || moving || LABEL_SCENES.has(sid) ? label : boardBig;
    const names = (plan && plan.names) || (GL() ? { A: "Leo", B: "Priya" } : { A: "Pappu", B: "Chacha" });
    const who = kind === "slide" ? s.who : null;
    if (kind === "slide") { if (!moving) board(ctx, w, h, s.heading, s.emoji, sc, F); }
    else board(ctx, w, h, kind === "title" ? (plan && plan.title) || s : (EN() ? "Thanks for watching 🙏  Like • Subscribe" : "धन्यवाद 🙏  Like • Subscribe"), "", sc, F);
    const TL = moving ? travelLayout(sid, w, h, sc, v, fyM, tsec) : null;
    const cs = TL ? TL.cs : (v ? 1.15 : 1.25) * sc, ax = TL ? TL.A.x : v ? w * 0.27 : w * 0.16, bx = TL ? TL.B.x : v ? w * 0.73 : w * 0.84, cy = TL ? TL.A.cy : v ? h - 30 * sc : h - 10 * sc, cyB = TL ? TL.B.cy : cy;
    const bl = k => (tsec + k) % 3.9 < 0.13;
    const end = kind === "end";
    const mood = kind === "slide" ? (s.mood || "") : "";
    const emoOf = k => {
      const sp = who === k;
      if (mood === "funny") return sp ? (prog > 0.8 ? "happy" : "") : (prog > 0.35 ? "happy" : "");
      if (mood === "daant") return sp ? "angry" : "sad";
      if (mood === "serious") return "serious";
      if (mood === "shayari") return !sp && prog > 0.85 ? "happy" : "";
      return end ? "happy" : "";
    };
    const eA = emoOf("A"), eB = emoOf("B");
    const dressOf = k => { // a costume change on a line lasts until the next change
      if (plan && plan.slides && kind !== "title") for (let i = Math.min(kind === "end" ? 1e9 : idx, plan.slides.length - 1); i >= 0; i--) { const d = plan.slides[i]["d" + k]; if (d != null) return d; }
      return ((plan && plan.cast) || {})[k] || "";
    };
    const gOf = (k, f) => {
      let P;
      if (kind === "end") P = poseOf("wave", f, tsec, prog, 0);
      else if (kind === "title") P = poseOf(k === "A" ? "wave" : "hip", f, tsec, prog, 0);
      else {
        const sp = who === k, g = gestureFor(s, idx, sp, prog); P = poseOf(g, f, tsec, prog, sp ? mouth : 0);
        if (sp && NEG.test(s.narration || "") && prog < 0.45) P.shake = 1; // "nahi" → head shake
      }
      P.dress = dressOf(k);
      if (TL) {
        if (TL[k].legs) P.legs = TL[k].legs;
        const hd = TL.hands && TL.hands[k]; // holding the handlebar
        if (hd) P.hands = [{ x: hd[0][0], y: hd[0][1], shape: "fist" }, { x: hd[1][0], y: hd[1][1], shape: "fist" }];
        P.lean = 0;
      }
      return P;
    };
    if (TL && TL.back) TL.back(ctx);
    const drawA = () => drawChar(ctx, ax, cy, cs, "A", who === "A" ? mouth : 0, bl(0), who === "A" || (end && Math.sin(tsec * 6) > 0), tsec, 1, eA, gOf("A", 1));
    const drawB = () => drawChar(ctx, bx, cyB, cs, "B", who === "B" ? mouth : 0, bl(1.7), who === "B", tsec, -1, eB, gOf("B", -1));
    if (TL && TL.backFirst === "B") { drawB(); drawA(); } else { drawA(); drawB(); }
    if (TL && TL.front) TL.front(ctx);
    // mood stickers
    const sticker = (x, e) => { const t = e === "happy" ? "😂" : e === "angry" ? "💢" : e === "sad" ? "😳" : ""; if (!t) return; ctx.font = `${40 * sc}px sans-serif`; ctx.textAlign = "center"; ctx.fillText(t, x + 60 * sc, (x === ax ? cy : cyB) - 296 * cs + Math.sin(tsec * 6) * 4 * sc); };
    sticker(ax, eA); sticker(bx, eB);
    if (mood === "shayari" && who) { ctx.font = `${34 * sc}px sans-serif`; ctx.textAlign = "center"; ctx.fillText("✨📜✨", who === "A" ? ax : bx, (who === "A" ? cy : cyB) - 384 * cs + Math.sin(tsec * 3) * 5 * sc); }
    // name tags
    ctx.font = `bold ${22 * sc}px ${F}`; ctx.textAlign = "center";
    [[ax, names.A, "A"], [bx, names.B, "B"]].forEach(([x, n, k]) => {
      const tw = ctx.measureText(n).width + 24 * sc, ty = (k === "A" ? cy : cyB) - 340 * cs;
      ctx.fillStyle = who === k ? "#ffd166" : "rgba(255,255,255,.85)"; rr(ctx, x - tw / 2, ty - 24 * sc, tw, 34 * sc, 12 * sc); ctx.fill();
      ctx.fillStyle = "#2b2420"; ctx.fillText(n, x, ty);
    });
    if (kind === "slide") subtitle(ctx, w, h, (who === "N" ? "📖 " : "") + s.narration, prog, sc, F, TL ? (v ? h * 0.24 : h * 0.17) : v ? h * 0.48 : h * 0.5, who === "A" ? "#ffd166" : who === "N" ? "#ffe8a3" : "#8fe3ff");
    if (kind === "slide") { ctx.fillStyle = "rgba(0,0,0,.12)"; ctx.fillRect(0, h - 8 * sc, w, 8 * sc); ctx.fillStyle = "#e07a2e"; ctx.fillRect(0, h - 8 * sc, w * ((idx + prog) / total), 8 * sc); }
    overlay(ctx, w, h, channel, sc, F, !ph && CAT() !== "how");
  }
  // mouth movement from the real voice loudness (30 values per second)
  function envelope(buf) {
    const d = buf.getChannelData(0), step = Math.floor(buf.sampleRate / 30), out = [];
    let mx = 1e-6;
    for (let i = 0; i < d.length; i += step) { let s = 0; const e = Math.min(d.length, i + step); for (let k = i; k < e; k += 4) s += d[k] * d[k]; const r = Math.sqrt(s / Math.max(1, (e - i) / 4)); out.push(r); if (r > mx) mx = r; }
    return out.map(r => Math.min(1, r / (mx * 0.7)));
  }

  function b64(u8) { let s = ""; for (let k = 0; k < u8.length; k += 32768) s += String.fromCharCode.apply(null, u8.subarray(k, k + 32768)); return btoa(s); }
  async function saveBlob(blob, name, mime) {
    if (!IS_APP) {
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); return true;
    }
    const buf = new Uint8Array(await blob.arrayBuffer()), CH = 768 * 1024;
    for (let i = 0; i < buf.length || i === 0; i += CH) {
      const part = buf.subarray(i, Math.min(buf.length, i + CH));
      let s = ""; for (let k = 0; k < part.length; k += 32768) s += String.fromCharCode.apply(null, part.subarray(k, k + 32768));
      const r = await nativeCall("saveChunk", name, mime, btoa(s), i === 0, i + CH >= buf.length);
      if (!r.ok) return false;
      if (r.uri) return r.uri;
      if (i + CH >= buf.length) break;
    }
    return true;
  }

  async function saveThumb() {
    readEdits();
    const c = document.createElement("canvas"); c.width = 1280; c.height = 720;
    const x = c.getContext("2d");
    if (plan.style === "cartoon") {
      const ph = photoAt(0); if (ph) photoBg(x, 1280, 720, ph, 0, 0); else cartoonScene(x, 1280, 720, 0, sceneAt(0));
      const tp = (k, g, f) => Object.assign(poseOf(g, f, 0.3, 0.5, 0), { dress: (plan.cast || {})[k] || "" });
      drawChar(x, 190, 740, 1.35, "A", 0.7, false, true, 0.3, 1, "", tp("A", "explain", 1)); drawChar(x, 1090, 740, 1.35, "B", 0, false, false, 0, -1, "", tp("B", "hip", -1));
      x.fillStyle = "rgba(0,0,0,.55)"; x.fillRect(330, 150, 620, 400);
      x.fillStyle = "#ffd166"; x.textAlign = "center"; x.font = "bold 78px 'Noto Sans Devanagari',sans-serif";
      wrap(x, plan.thumbnail_text || plan.title || "", 640, 270, 580, 92, 4);
      x.fillStyle = "#fff"; x.font = "34px sans-serif"; x.fillText(S.get(K("vChannel"), ""), 640, 530);
      const blob = await new Promise(r => c.toBlob(r, "image/png"));
      toast(await saveBlob(blob, "thumbnail-" + ymd() + ".png", "image/png") ? (IS_APP ? "✅ Thumbnail: Gallery → Pictures/Sahayak" : "✅ Thumbnail download ho gaya") : "Save nahi hua");
      return;
    }
    bg(x, 1280, 720, 10);
    x.fillStyle = "#ffd166"; x.textAlign = "center"; x.font = "bold 92px 'Noto Sans Devanagari',sans-serif";
    wrap(x, plan.thumbnail_text || plan.title || "", 640, 300, 1150, 110, 3);
    x.fillStyle = "#fff"; x.font = "36px sans-serif"; x.fillText(S.get(K("vChannel"), ""), 640, 660);
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    toast(await saveBlob(blob, "thumbnail-" + ymd() + ".png", "image/png") ? (IS_APP ? "✅ Thumbnail: Gallery → Pictures/Sahayak" : "✅ Thumbnail download ho gaya") : "Save nahi hua");
  }

  async function make() {
    if (busy) return null;
    let result = null;
    const cartoon = plan.style === "cartoon";
    if (!cartoon && !IS_APP && !S.get("vVoice", "ai:Charon").startsWith("ai:")) { toast("Laptop pe 🤖 AI awaaz chuno (phone ki awaaz sirf phone app mein)"); return; }
    readEdits(); busy = true; if (IS_APP) window.Native.keepScreenOn(true);
    if (IS_APP && window.Native.videoWork) window.Native.videoWork(true);
    // big notice on top while working
    const cover = document.createElement("div"); cover.id = "vbusy";
    cover.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:50;padding:12px 16px;background:#1d2a44;color:#fff;font-size:15px;box-shadow:0 2px 10px rgba(0,0,0,.3)";
    cover.innerHTML = '🎬 <b>Video ban rahi hai</b> — <span id="vbusyt">shuru…</span><br><small>📵 Phone lock (power button) mat dabana aur doosra app mat kholna — screen band hote hi video ruk jaati hai. Galti se ho jaye to phone kholo, Sahayak wahin se aage chalegi.</small>';
    document.body.appendChild(cover);
    const prog = $("#vprog"), say = m => { prog.innerHTML = m; const t = $("#vbusyt"); if (t) t.innerHTML = m.replace(/<br>[\s\S]*$/, ""); };
    const stage = st => S.set("vMaking", { stage: st, at: Date.now() }); // survives a crash → shown next time
    let onVis = null;
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const bufs = []; let fallbackNote = "";
      if (cartoon) { try { await batchVoices(0, plan.slides.length, sec => say(`🔊 Google ki limit — ${sec} second ruk kar dobara…`), (d, t) => say(`🔊 Awaaz ek saath ban rahi hai… ${d}/${t} line`)); } catch (e) { /* the per-line loop below reports it */ } }
      for (let i = 0; i < plan.slides.length; i++) {
        say(`🔊 Awaaz taiyaar ho rahi hai… ${i + 1}/${plan.slides.length}`); stage(`awaaz ${i + 1}/${plan.slides.length}`);
        if (voices[i]) { bufs.push(await ac.decodeAudioData(await voices[i].blob.arrayBuffer())); continue; }
        const vv = cartoon ? "ai:" + voiceOf(plan.slides[i].who) : S.get("vVoice", "ai:Charon"), text = plan.slides[i].narration || plan.slides[i].heading || " ";
        if (cartoon && engine() === "phone") { bufs.push(await phoneLine(ac, text, plan.slides[i].who)); continue; }
        if (vv.startsWith("ai:")) {
          try { bufs.push(await ac.decodeAudioData(await aiVoice(text, vv.slice(3), cartoon ? plan.slides[i].who : "", cartoon ? plan.slides[i].mood : "", sec => say(`🔊 Awaaz ${i + 1}/${plan.slides.length} — Google ki limit, ${sec} second ruk kar dobara…`)))); continue; }
          catch (e) {
            // cartoon: two characters must keep their own voices — never fill gaps with the phone's robot voice
            if (cartoon) throw new Error(`AI awaaz ki free limit abhi poori (${i}/${plan.slides.length} line ki awaaz ban chuki, wo save hai). 15-30 minute baad "Video banao" dobara dabao — wahin se aage banegi, awaaz nahi badlegi.`);
            if (!IS_APP) throw e; fallbackNote = "Kuch hisson mein AI awaaz ki free limit poori — wahan phone ki awaaz lagi" + (cartoon ? " (dono kirdaar ki ek jaisi awaaz)" : ""); }
        }
        const r = await nativeCall("speakToFile", plan.slides[i].narration || plan.slides[i].heading || " ", EN() ? "en-US" : "hi-IN", S.get("voiceRate", 1));
        if (r.error) throw new Error(r.error);
        const bin = atob(r.b64), arr = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
        bufs.push(await ac.decodeAudioData(arr.buffer));
      }
      say("🖼️ Photos load ho rahi hain…"); await Promise.all(plan.slides.filter(x => x.photo && x.photo.url).map(x => loadImg(x.photo.url)));
      const low = !!S.get("vLow", (navigator.deviceMemory || 8) <= 4), fps = low ? 20 : 24;
      const w = plan.short ? (low ? 540 : 720) : (low ? 960 : W), h = plan.short ? (low ? 960 : 1280) : (low ? 540 : H);
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      const dest = ac.createMediaStreamDestination();
      const stream = new MediaStream([...c.captureStream(fps).getVideoTracks(), ...dest.stream.getAudioTracks()]);
      const mime = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1,mp4a", "video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
      if (!mime) throw new Error("Is phone mein video recording nahi chalti");
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: low ? 2000000 : 4000000 });
      const ext = mime.startsWith("video/mp4") ? "mp4" : "webm", base = mime.split(";")[0];
      const name = "video-" + ymd() + "-" + Date.now().toString(36).slice(-4) + "." + ext;
      // phone: write each second's piece straight to storage, so the whole video never sits in memory
      const chunks = []; let wq = Promise.resolve(), size = 0, firstW = true, wfail = false, outUri = "";
      // FileReader does the base64 work natively, so drawing doesn't stutter every second
      const blobB64 = bl => new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => { const u = String(fr.result), k = u.indexOf(";base64,"); ok(k < 0 ? "" : u.slice(k + 8)); /* mime can contain commas: avc1,mp4a */ }; fr.onerror = () => no(fr.error); fr.readAsDataURL(bl); });
      const put = async (b64s, last) => { const f = firstW; firstW = false; const r = await nativeCall("saveChunk", name, base, b64s, f, last); if (!r.ok) wfail = true; if (r.uri) outUri = r.uri; };
      rec.ondataavailable = e => {
        if (!e.data.size) return; size += e.data.size;
        if (!IS_APP) { chunks.push(e.data); return; }
        const d = e.data; wq = wq.then(async () => put(await blobB64(d), false));
      };
      // timeline: title 2.5s, slides (voice + 0.6s), end 2.5s
      const segs = [{ kind: "title", d: plan.short ? 1.2 : 2.5 }];
      bufs.forEach((b, i) => segs.push({ kind: "slide", i, d: b.duration + lineGap(plan.slides[i], cartoon), buf: b, env: cartoon ? envelope(b) : null }));
      segs.push({ kind: "end", d: 2.5 });
      let t = 0; segs.forEach(s => { s.start = t; t += s.d; }); const total = t;
      const ch = S.get(K("vChannel"), "");
      if (cartoon) cartoonFrame(ctx, w, h, "title", plan.title, 0, 0, 1, ch, 0, 0); else frame(ctx, w, h, "title", plan.title, 0, 0, 1, ch);
      rec.start(1000);
      // leaving the app pauses the video; coming back continues from the same point
      let away = false;
      const goAway = () => { if (away) return; away = true; try { rec.pause(); } catch (e) {} ac.suspend(); };
      const comeBack = () => { if (!away) return; away = false; ac.resume(); try { rec.resume(); } catch (e) {} };
      onVis = e => { if ((e && e.type === "apphide") || document.hidden) goAway(); else comeBack(); };
      document.addEventListener("visibilitychange", onVis);
      window.addEventListener("apphide", onVis); window.addEventListener("appshow", onVis);
      const t0 = ac.currentTime + 0.3; let lastSay = -1;
      const mp = musicPlayer(ac, dest, t0, total, musicStyle(), segs.filter(x => x.buf).map(x => [x.start, x.start + x.buf.duration])); mp.tick();
      if (cartoon) scheduleFx(ac, dest, t0, segs.filter(x => x.buf));
      segs.forEach(s => { if (s.buf) { const src = ac.createBufferSource(); src.buffer = s.buf; src.connect(dest); src.start(t0 + s.start); } });
      await new Promise(done => {
        const iv = setInterval(() => {
          const el = ac.currentTime - t0; mp.tick();
          if (el >= total) { clearInterval(iv); done(); return; }
          const s = segs.find(x => el >= x.start && el < x.start + x.d) || segs[0];
          const p = Math.max(0, Math.min(1, (el - s.start) / s.d));
          if (cartoon) {
            const m = s.env ? (s.env[Math.floor((el - s.start) * 30)] || 0) : 0;
            cartoonFrame(ctx, w, h, s.kind, s.kind === "slide" ? plan.slides[s.i] : plan.title, s.kind === "slide" ? Math.min(1, (el - s.start) / s.buf.duration) : p, s.i || 0, plan.slides.length, ch, el, m);
          } else if (s.kind === "slide") frame(ctx, w, h, "slide", plan.slides[s.i], p, s.i, plan.slides.length, ch, el);
          else frame(ctx, w, h, s.kind, plan.title, p, 0, 1, ch, el);
          const sec = Math.floor(Math.max(0, el));
          if (sec !== lastSay) { lastSay = sec; say(`🎬 Video ban rahi hai… ${sec}/${Math.ceil(total)} sec — screen chalu rakho, app mat chhodo`); if (sec % 5 === 0) stage(`video ${sec}/${Math.ceil(total)} sec`); }
        }, 1000 / fps);
      });
      await new Promise(r => { rec.onstop = r; rec.stop(); });
      document.removeEventListener("visibilitychange", onVis); window.removeEventListener("apphide", onVis); window.removeEventListener("appshow", onVis); onVis = null;
      say("💾 Save ho raha hai…"); stage("save");
      let ok;
      if (IS_APP) { await wq; await put("", true); ok = !wfail; }
      else ok = await saveBlob(new Blob(chunks, { type: base }), name, base);
      S.del("vMaking");
      const where = IS_APP ? "📁 Gallery → <b>Movies/Sahayak</b> folder (Files app: Movies → Sahayak)" : "💻 Browser ke Downloads mein";
      say(ok ? `✅ <b>Video taiyaar!</b> ${name} (${(size / 1048576).toFixed(1)} MB)<br>${where}
        ${IS_APP && outUri ? `<div class="row" style="margin-top:6px"><button class="btn primary" id="vplay">▶️ Video dekho</button><button class="btn" id="vshare">📤 YouTube / WhatsApp par bhejo</button></div>` : ""}
        <br>YouTube par daalte waqt title/description upar se copy karo.${fallbackNote ? "<br>⚠️ " + fallbackNote : ""}<br>ℹ️ YouTube puchhe "altered/synthetic content?" — AI awaaz ho to imaandaari se batana.` : "❌ Save nahi hua — phone ki storage bhari to nahi?");
      if (ok && IS_APP && outUri) { $("#vplay").onclick = () => window.Native.openMedia(outUri, base); $("#vshare").onclick = () => window.Native.shareMedia(outUri, base); }
      result = { ok, name, uri: outUri || "", mime: base };
      ac.close();
    } catch (e) { say("❌ " + (e.message || "Video nahi bani")); S.del("vMaking"); }
    if (onVis) { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("apphide", onVis); window.removeEventListener("appshow", onVis); }
    busy = false; if (IS_APP) window.Native.keepScreenOn(false);
    if (IS_APP && window.Native.videoWork) window.Native.videoWork(false);
    const cv = $("#vbusy"); if (cv) cv.remove();
    return result;
  }


  // 🤖 Aaj ki Video (Global): today's topic from what people abroad search about India → Short + 3-minute video.
  // The owner checks and uploads by hand. Daily notification at the chosen time; tap → runs by itself.
  const AUTO = "autoG";
  const autoCfg = () => Object.assign({ on: false, time: "05:30", done: [] }, S.get(AUTO, {}));
  const normT = t => String(t || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\b(the|a|an|in|of|india|indian|indians)\b/g, " ").replace(/\s+/g, " ").trim();
  function autoSchedule() {
    if (!IS_APP || !window.Native.remind) return;
    const a = autoCfg();
    try { window.Native.cancelRemind("auto:global"); } catch (e) { /* old app */ }
    if (!a.on) return;
    const [h, m] = a.time.split(":").map(Number), t = new Date(); t.setHours(h || 5, m || 0, 0, 0);
    if (t <= new Date()) t.setDate(t.getDate() + 1);
    window.Native.remind("auto:global", t.getTime(), "🤖 Aaj ki video banao", "Dabao — phone charger par lagao, Sahayak aaj ka vishay chun kar Short + 6 minute video bana dega");
  }
  function uploadNudge() {
    if (!IS_APP || !window.Native.remind) return;
    const t = new Date(); t.setHours(6, 45, 0, 0);
    const now = new Date();
    if (now > t && now.getHours() < 9) return; // it is upload time already
    if (now > t) t.setDate(t.getDate() + 1);
    window.Native.remind("video:upload", t.getTime(), "📤 Upload ka sahi time", "America mein abhi shaam hai — aaj ki video YouTube par daal do (title/description Sahayak mein ready hai)");
  }
  function drawAuto() {
    const el = $("#vauto"); if (!el) return;
    const a = autoCfg(), last = a.last;
    el.innerHTML = `<h3 style="margin-top:0">🤖 Aaj ki Video (apne aap)</h3>
      <p class="muted small">Bahar ke log India ke baare mein kya search kar rahe hain → sabse achha naya vishay → Short (~35 sec) + usi vishay ki 6 minute video. Aap sirf dekh kar upload karo.</p>
      <button class="btn primary wide" id="aurun">▶️ Abhi banao (Short + 6 min)</button>
      <p class="small muted">🔌 Phone charger par lagao. Screen dheemi ho jaayegi — app mat chhodo, lock mat karo. ~20-25 minute.</p>
      <div class="row" style="align-items:flex-end">${IS_APP ? `<label class="field" style="flex:1">🔔 Roz yaad dilao<select id="auon"><option value="0" ${a.on ? "" : "selected"}>Band</option><option value="1" ${a.on ? "selected" : ""}>Haan</option></select></label><label class="field" style="flex:1">Kis time<input type="time" id="autime" value="${esc(a.time)}"></label>` : ""}</div>
      <p class="small">⏰ <b>Upload ka sahi time: subah 6:30 – 8:00</b> (tab America/Canada mein shaam hoti hai). Isliye video raat ko ya subah 5-6 baje banao.</p>
      <div id="aumsg" class="small"></div>
      ${last && last.results ? `<h3>✅ Pichhli: ${esc(last.topic)} <small class="muted">(${new Date(last.at).toLocaleString("en-IN")})</small></h3>
        ${last.results.map((r, k) => `<div class="list-item small" style="display:block"><b>${r.len === "short" ? "📱 Short" : "▶️ 6 minute"}</b> — ${esc(r.title)}
          <div class="row" style="margin-top:4px;flex-wrap:wrap">${IS_APP && r.uri ? `<button class="btn" data-aup="${k}">▶️ Dekho</button><button class="btn" data-aush="${k}">📤 Share</button>` : ""}<button class="btn" data-auc="${k}:title">📋 Title</button><button class="btn" data-auc="${k}:desc">📋 Description</button><button class="btn" data-auc="${k}:tags">📋 Tags</button></div></div>`).join("")}
        <div class="banner small">Upload se pehle: ☑️ poori video ek baar dekho · ☑️ tathya sahi lage · ☑️ YouTube mein "Altered or synthetic content" = <b>Yes</b> · ☑️ Pehle <b>Short</b> daalo, phir <b>6 minute</b> wali. Uske baad YouTube Studio → Short → Edit → <b>"Related video"</b> = 6 minute wali chuno (Short dekhne wale seedha lambi video tak aayenge).</div>` : ""}`;
    $("#aurun").onclick = () => autoRun();
    if ($("#auon")) {
      const save = () => { const c = autoCfg(); c.on = $("#auon").value === "1"; c.time = $("#autime").value || "05:30"; S.set(AUTO, c); if (c.on && window.Native.askNotify) window.Native.askNotify(); autoSchedule(); toast(c.on ? "🔔 Roz " + c.time + " baje yaad dilaunga" : "Roz ki yaad band"); };
      $("#auon").onchange = save; $("#autime").onchange = save;
    }
    $$("[data-aup]").forEach(b => b.onclick = () => { const r = last.results[+b.dataset.aup]; window.Native.openMedia(r.uri, r.mime); });
    $$("[data-aush]").forEach(b => b.onclick = () => { const r = last.results[+b.dataset.aush]; window.Native.shareMedia(r.uri, r.mime); });
    $$("[data-auc]").forEach(b => b.onclick = async () => {
      const [k, f] = b.dataset.auc.split(":"), r = last.results[+k];
      const txt = f === "title" ? r.title : f === "desc" ? r.description : (r.tags || []).join(", ");
      try { await navigator.clipboard.writeText(txt); toast("📋 Copy ho gaya"); } catch (e) { if (window.Native && window.Native.share) window.Native.share(txt); }
    });
  }
  let autoBusy = false, autoHint = "";
  async function autoRun() {
    if (autoBusy || busy) return;
    if (mode !== "g" || !$("#vauto")) { App.go("global"); await new Promise(r => setTimeout(r, 600)); }
    autoBusy = true;
    const say = t => { const m = $("#aumsg"); if (m) m.innerHTML = t; };
    $("#vauto").scrollIntoView({ block: "start" });
    if (IS_APP && window.Native.dim) window.Native.dim(true);
    if (IS_APP) window.Native.keepScreenOn(true);
    try {
      let snap = S.get("trend.abroad", null);
      if (!snap || Date.now() - snap.at > 20 * 3600e3 || !(snap.ideas || []).length) {
        if (typeof Trends === "undefined" || !Trends.abroad) throw new Error("Trends hissa nahi mila — app update karo");
        snap = await Trends.abroad(t => say(t));
      }
      const a = autoCfg(), recent = new Set((a.done || []).filter(d => Date.now() - d.at < 30 * 864e5).map(d => normT(d.topic)));
      const cands = (snap.ideas || []).map(x => x.topic).concat((snap.top || []).map(t => t.q));
      const topic = cands.find(t => normT(t) && !recent.has(normT(t)));
      if (!topic) throw new Error("Aaj koi naya vishay nahi mila — kal phir try karo");
      const results = [];
      if ($("#vstyle")) $("#vstyle").value = "cartoon";
      if ($("#vfmt")) $("#vfmt").value = "auto";
      for (const len of ["short", "long"]) {
        const nm = len === "short" ? "📱 Short" : "▶️ 6 minute";
        autoHint = len === "short" ? "\nThis Short is the teaser of our 6-minute video on the same topic: give the single most surprising bit, and make the LAST line invite people to watch the full video (e.g. \"The full story is in our 6-minute video — tap the link below!\")." : "\nThis is the full 6-minute video; our Short on the same topic teased it, so start by quickly paying off that teaser hook, then go deeper.";
        $("#vq").value = topic; $("#vtopic").value = ""; $("#vlen").value = len;
        say(`📝 ${nm} ki script likhi ja rahi hai: <b>${esc(topic)}</b>…`);
        if (!(await makePlan())) throw new Error($("#vmsg").textContent.replace(/^❌\s*/, "") || "Script nahi bani");
        await Promise.race([photosP, new Promise(r => setTimeout(r, 25000))]);
        say(`🎬 ${nm} video ban rahi hai… (screen chalu rehne do)`);
        const r = await make();
        if (!r || !r.ok) throw new Error(($("#vprog") ? $("#vprog").textContent : "").replace(/^❌\s*/, "") || "Video nahi bani");
        results.push({ len, title: plan.title || "", description: plan.description || "", tags: plan.tags || [], name: r.name, uri: r.uri, mime: r.mime });
      }
      const c = autoCfg(); c.done = (c.done || []).concat({ topic, at: Date.now() }).slice(-60); c.last = { at: Date.now(), topic, results }; S.set(AUTO, c);
      uploadNudge();
      if (IS_APP && window.Native.remind) window.Native.remind("video:ready", Date.now() + 3000, "✅ Aaj ki video taiyaar", topic + " — Short + 6 minute. Dekho aur upload karo.");
      drawAuto(); say("✅ Dono video taiyaar — neeche dekho, phir upload karo.");
      $("#vauto").scrollIntoView({ block: "start" });
    } catch (e) {
      say("❌ " + esc(e.message || "Auto video nahi bani") + "<br><span class='muted'>Jo awaaz ban chuki hai wo save hai — thodi der baad ▶️ dobara dabao, wahin se aage banegi.</span>");
    }
    autoHint = "";
    if (IS_APP && window.Native.dim) window.Native.dim(false);
    if (IS_APP) window.Native.keepScreenOn(false);
    autoBusy = false;
  }

  return { autoRun, _draw: drawChar, _pose: poseOf, _music: musicPlayer, _sfx: sfx, render, _frame: frame, _photos: photos, _setPlan: p => { plan = p; }, _imgs: imgs, _cartoon: (ctx, w, h, s, names, tsec, m, extra) => { plan = plan || { title: "" }; plan.names = names; Object.assign(plan, extra || {}); if (extra && extra.img) { imgs["t"] = extra.img; plan.slides = [{ photo: { url: "t" } }]; } return cartoonFrame(ctx, w, h, extra && extra.endKind ? "end" : "slide", s, extra && extra.prog != null ? extra.prog : 0.5, extra && extra.idx != null ? extra.idx : 2, 8, "Kanoon Aasaan", tsec, m); } };
})();
