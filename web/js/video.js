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
  const CAT = () => (plan && plan.cat) || "";
  const voices = {}; // slide index -> {blob, dur} (owner's own recorded voice)
  const photos = {}; // slide index -> HTMLImageElement (owner's own photo)
  const AI_VOICES = [["Charon", "👨 Aadmi — gambhir"], ["Puck", "👨 Aadmi — josh wala"], ["Orus", "👨 Aadmi — shaant"], ["Kore", "👩 Aurat — saaf"], ["Aoede", "👩 Aurat — garm"], ["Leda", "👩 Aurat — halki"]];
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
  async function aiVoice(text, voice, who) {
    const ck = (EN() ? "en|" + (who || "") + "|" : "hi|") + voice + "|" + text;
    if (ttsCache.has(ck)) return ttsCache.get(ck).slice(0);
    const buf = await aiVoiceRaw(text, voice, who);
    ttsCache.set(ck, buf.slice(0));
    return buf;
  }
  async function aiVoiceRaw(text, voice, who) {
    const body = { contents: [{ role: "user", parts: [{ text: (EN() && who === "A" ? "Speak as a friendly, curious young American traveler — natural, expressive and conversational, with real reactions (surprise, laughter in the voice), not like a robot or news reader. Pronounce any Hindi words as best you can. Say this:\n" :
      EN() && who === "B" ? "Speak as a warm, cheerful young Indian woman in a natural Indian English accent — friendly, expressive storytelling, natural pauses; pronounce Hindi words authentically. Not robotic. Say this:\n" :
      EN() ? "Speak like a warm, friendly storyteller explaining to a friend — natural and conversational, clear neutral English, with natural pauses at commas and full stops, curious tone on questions. Not like a robot or a news reader. Say this:\n" : "Aise bolo jaise ek samajhdaar Bharatiya bada bhai apne dost ko chai pe samjha raha ho — aaram se, garmjoshi se, sawaal pe awaaz upar, zaroori baat pe zor, comma aur full stop pe halka ruk kar. News reader ya robot jaisa nahi. Ye Hindi bolo:\n") + text }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } };
    const ok = S.get("ttsModel", "");
    const order = ok ? [ok, ...TTS_MODELS.filter(m => m !== ok)] : TTS_MODELS;
    let last = "";
    for (const m of order) {
      for (let attempt = 0; attempt < 2; attempt++) {
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
        if ((status === 429 || status >= 500) && attempt === 0) { await new Promise(r => setTimeout(r, status === 429 ? 21000 : 2000)); continue; }
        break;
      }
    }
    throw new Error(last || "AI awaaz nahi bani");
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

  const LENGTHS = { short: ["📱 Short (~45 sec, khada video)", 3], mid: ["▶️ 3 minute", 6], long: ["▶️ 6 minute", 10] };
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
  function render(m) {
    if (m && m !== mode) {
      plans[mode] = plan; mode = m; plan = plans[mode] || null;
      Object.keys(voices).forEach(k => delete voices[k]); Object.keys(photos).forEach(k => delete photos[k]);
    }
    if (mode === "g") return renderGlobal();
    $("#view").innerHTML = `<div class="wrap"><h2 style="margin:6px 0">🎬 Video banao</h2>
      ${(() => { const mk = S.get("vMaking", null); if (!mk) return ""; S.del("vMaking"); S.set("vLow", true);
        return `<div class="banner" style="border-color:#e66">⚠️ Pichhli video beech mein ruk gayi thi (ruki: <b>${esc(mk.stage || "?")}</b>). Aksar phone ki memory kam padne se hota hai. Maine <b>📉 Halki quality</b> chalu kar di hai — dobara banao, aur banate waqt app mat chhodna.</div>`; })()}
      <div class="banner">✅ Sirf apna original content (doosron ki video/gaana mat daalna). ⚖️ Peedit ka naam kabhi nahi, judge pe ilzaam nahi, parties "A aur B". Upload se pehle script ek baar khud padh lena.</div>
      <div class="card">
        <label class="field">❓ Logon ka sawaal<input id="vq" placeholder="Jaise: Kya police bina warrant giraftar kar sakti hai?"></label>
        <div class="toggles" style="flex-wrap:wrap">${IDEAS.map(q => `<button class="tg" data-idea="${esc(q)}">${esc(q)}</button>`).join("")}</div>
        <label class="field">⚖️ Judgment / tathya (optional — Court app ka saar yahan paste karo)<textarea id="vtopic" rows="4" placeholder="Jaise: Arnesh Kumar vs State of Bihar (2014) — 7 saal se kam saza wale case mein turant giraftari nahi…"></textarea></label>
        <div class="row"><label class="field" style="flex:1">Lambai<select id="vlen">${Object.entries(LENGTHS).map(([k, v]) => `<option value="${k}" ${k === "mid" ? "selected" : ""}>${v[0]}</option>`).join("")}</select></label>
        <label class="field" style="flex:1">Channel ka naam<input id="vch" value="${esc(S.get(K("vChannel"), ""))}" placeholder="Jaise: Kanoon Aasaan"></label></div>
        <div class="row"><label class="field" style="flex:1">Andaaz<select id="vstyle">
          <option value="cartoon" ${S.get(K("vStyle"), "cartoon") === "cartoon" ? "selected" : ""}>🧑‍🤝‍🧑 Do cartoon aapas mein baat karein</option>
          <option value="slides" ${S.get(K("vStyle"), "cartoon") === "slides" ? "selected" : ""}>🖼️ Slides + ek awaaz</option></select></label></div>
        <div class="row" id="vnames"><label class="field" style="flex:1">🙋 Sawaal puchne wala<input id="vna" value="${esc(S.get("vNameA", "Pappu"))}"></label>
          <label class="field" style="flex:1">👴 Samjhane wale<input id="vnb" value="${esc(S.get("vNameB", "Chacha"))}"></label></div>
        <button class="btn primary wide" id="vplan">✍️ Script banao</button>
        <div id="vmsg" class="small" style="margin-top:6px"></div>
      </div>
      <div id="vedit"></div></div>`;
    $("#vplan").onclick = makePlan;
    const sn = () => { $("#vnames").hidden = $("#vstyle").value !== "cartoon"; };
    $("#vstyle").onchange = () => { S.set(K("vStyle"), $("#vstyle").value); sn(); }; sn();
    $$("[data-idea]").forEach(b => b.onclick = () => { $("#vq").value = b.dataset.idea; });
    if (plan) drawEditor();
  }

  function crashBanner() {
    const mk = S.get("vMaking", null); if (!mk) return ""; S.del("vMaking"); S.set("vLow", true);
    return `<div class="banner" style="border-color:#e66">⚠️ Pichhli video beech mein ruk gayi thi (ruki: <b>${esc(mk.stage || "?")}</b>). Aksar phone ki memory kam padne se hota hai. Maine <b>📉 Halki quality</b> chalu kar di hai — dobara banao, aur banate waqt app mat chhodna.</div>`;
  }
  // 🌍 global English channel: Leo (curious traveler) + Priya (Indian friend)
  function renderGlobal() {
    const cat = S.get("vCat_g", "india");
    $("#view").innerHTML = `<div class="wrap"><h2 style="margin:6px 0">🌍 Global channel <small class="muted">(English)</small></h2>
      ${crashBanner()}
      <div class="banner">✅ Sirf original content. Tathya sahi hon, kisi desh/dharm/samuday ka mazaak nahi. ⚠️ YouTube ek jaisi template wali videos ki kamaai rok deta hai — isliye har baar topic, format aur 2-3 line apni taraf se badlo.</div>
      <div class="card">
        <label class="field">📂 Vishay<select id="vcat">${Object.entries(GCATS).map(([k, v]) => `<option value="${k}" ${k === cat ? "selected" : ""}>${v[0]}</option>`).join("")}</select></label>
        <div class="toggles" style="flex-wrap:wrap" id="vchips"></div>
        <label class="field">🎯 Topic (English)<input id="vq" placeholder="e.g. Why do Indians celebrate Diwali?"></label>
        <label class="field">📝 Apne notes / pakke tathya (optional)<textarea id="vtopic" rows="3" placeholder="Jo baat zaroor aani chahiye, ya kisi bharosemand source ki line…"></textarea></label>
        <div class="row"><label class="field" style="flex:1">Lambai<select id="vlen">${Object.entries(LENGTHS).map(([k, v]) => `<option value="${k}" ${k === "short" ? "selected" : ""}>${v[0]}</option>`).join("")}</select></label>
          <label class="field" style="flex:1">Format<select id="vfmt"><option value="auto">🎲 Har baar alag (behtar)</option><option value="qa">💬 Sawaal-jawaab</option><option value="myth">❌✅ Myth vs Fact</option><option value="top">🔢 Top 5</option><option value="story">📖 Kahani</option></select></label></div>
        <div class="row"><label class="field" style="flex:1">🧳 Sawaal puchne wala<input id="vna" value="${esc(S.get("vNameA_g", "Leo"))}"></label>
          <label class="field" style="flex:1">🙋‍♀️ Samjhane wali<input id="vnb" value="${esc(S.get("vNameB_g", "Priya"))}"></label></div>
        <label class="field">Channel ka naam<input id="vch" value="${esc(S.get("vChannel_g", ""))}" placeholder="e.g. Hello India"></label>
        <button class="btn primary wide" id="vplan">✍️ Script banao</button>
        <div id="vmsg" class="small" style="margin-top:6px"></div>
      </div>
      <div id="vedit"></div></div>`;
    const chips = () => {
      const c = $("#vcat").value; S.set("vCat_g", c);
      $("#vchips").innerHTML = GCATS[c][1].map(q => `<button class="tg" data-idea="${esc(q)}">${esc(q)}</button>`).join("");
      $$("[data-idea]").forEach(b => b.onclick = () => { $("#vq").value = b.dataset.idea; });
      $("#vfmt").disabled = c === "hindi";
    };
    $("#vcat").onchange = chips; chips();
    $("#vplan").onclick = makePlan;
    if (plan) drawEditor();
  }

  function globalPrompt(topic, nA, nB, cat, fmt, nl) {
    return `Write a script for an animated YouTube video for an international audience (US, UK, worldwide). Two ORIGINAL cartoon characters talk:\n` +
      `A = "${nA}": a curious, friendly traveler from abroad who asks what viewers would ask, reacts honestly, sometimes gets things funny-wrong.\n` +
      `B = "${nB}": a warm, witty young Indian woman who explains simply with vivid everyday examples.\n\n` +
      `Topic area: ${GCATS[cat][0]}. ${GCAT_NOTE[cat]}\nTopic: ${topic}\n` + (cat === "hindi" ? "" : `Format: ${GFMT[fmt]}\n`) +
      `\nStyle: natural spoken English, short sentences, contractions, light clean humor, real reactions ("wait, what?", "no way!"). The very first line must hook in 3 seconds with a surprising fact or question. Vary rhythm. Never say "in this video we will". No filler, no repeated catchphrases. End: B gives a one-line recap, A asks viewers a question for the comments, then a quick "subscribe for more".\n` +
      `Accuracy and respect (strict): only well-established facts; never invent numbers, dates, names or quotes — if unsure, say it more generally. Respect every culture and religion: explain, never mock; no stereotypes; humor is never at a group's expense. No song lyrics or movie dialogue. No guarantees or personal advice.\n` +
      `Return ONLY valid JSON: {"title":"(max 60 chars, curiosity-driven but honest)","description":"(3-5 lines; end with: 'Made for learning and fun. We check facts carefully, but tell us in the comments if we missed something!')","tags":["..."],"thumbnail_text":"(3-5 punchy words)","lines":[{"who":"A or B","text":"(1-2 short spoken sentences)","key":"(2-5 words for the board)","emoji":"(1 emoji)","photo":"(1-4 word English search for a REAL photo of the place/thing being discussed, e.g. 'Taj Mahal', 'Diwali diya', 'GPS satellite'; reuse the same words while the subject stays the same; empty if nothing visual; never a person's name)"}]}\n` +
      `About ${nl} lines, mostly alternating (sometimes one speaker says two lines).`;
  }

  async function makePlan() {
    const q = $("#vq").value.trim(), facts = $("#vtopic").value.trim();
    if (q.length < 8 && facts.length < 15) { toast("Sawaal likho ya ek idea chuno"); return; }
    const g = mode === "g";
    const topic = g ? q + (facts ? "\nMust-include notes from the creator:\n" + facts : "") : "Sawaal: " + (q || "(tathya se banao)") + (facts ? "\nJudgment / tathya:\n" + facts : "");
    S.set(K("vChannel"), $("#vch").value.trim());
    const len = $("#vlen").value, n = LENGTHS[len][1], style = g ? "cartoon" : $("#vstyle").value;
    const nA = ($("#vna").value.trim() || (g ? "Leo" : "Pappu")).slice(0, 20), nB = ($("#vnb").value.trim() || (g ? "Priya" : "Chacha")).slice(0, 20);
    const en = false;
    S.set(K("vNameA"), nA); S.set(K("vNameB"), nB);
    const cat = g ? $("#vcat").value : "law";
    let fmt = g ? $("#vfmt").value : "";
    if (fmt === "auto") { const all = Object.keys(GFMT).filter(f => f !== S.get("vFmtLast_g", "")); fmt = all[Math.floor(Math.random() * all.length)]; }
    if (g) S.set("vFmtLast_g", fmt);
    const LANG = en ? `\n\nBHASHA (sabse zaroori): title, description, tags, thumbnail_text aur har line/narration/key/heading/points — SAB saral, natural English mein likho, videshi (US/UK/duniya ke) darshakon ke liye. Devanagari ya Hindi bilkul nahi. Indian shabd (FIR, thana, lakh) aaye to ek line mein samjhao. Disclaimer bhi English mein: "this is for education only, not legal advice — rules differ by country, talk to a qualified lawyer". Description ke aakhir mein: "⚠️ For education only. Not legal advice. No outcome is guaranteed." Kisi aur desh ka kanoon pakka pata na ho to uska daawa mat karo — kaho "rules differ by country". Comment wali line: "Has this happened to you? Tell us in the comments."` : "";
    const RULES = `KADE NIYAM: rape/yaun shoshan/POCSO/juvenile case mein peedit ya bachche ka naam ya pehchaan KABHI nahi; judge ya court ki niyat pe ilzaam nahi; chalte case mein kisi ko doshi mat kaho; aam logon (parties) ke naam ki jagah 'A aur B' ya 'pati/patni'; ` +
      `sirf wahi tathya jo diye gaye hain ya pakke aam kanooni gyaan ke hain — case naam, dhara ya saal apni taraf se mat banao (pakka na ho to dhara ka zikr mat karo); vakil ka prachaar/phone number nahi; "pakka milega"/"case jeet jaoge" jaisi koi guarantee nahi.`;
    const HEAD = `"title":"(60 akshar tak, Hindi+English mix chalega)","description":"(3-5 line + aakhir mein: '⚠️ Ye video sirf jaankari ke liye hai, kanooni salah nahi. Kisi nateeje ki guarantee nahi — apne case ke liye vakil se salah lein.')","tags":["..."],"thumbnail_text":"(4-6 shabd, bada asar)"`;
    const nl = { short: 8, mid: 18, long: 32 }[len];
    const CARTOON = `YouTube cartoon video ki script banani hai — do original cartoon kirdaar aapas mein baat karte hain (Hindi, aam logon ke liye). Vishay:\n${topic}\n\n` +
      `Kirdaar: A = "${nA}" — aam aadmi, darshak ki tarah sawaal puchta hai, kabhi confuse hota hai, halka mazaak karta hai. B = "${nB}" — samajhdaar bade, dheeraj se aasaan misaal dekar samjhate hain. B vakil NAHI hai — jaankari deta hai, salah nahi; zaroorat pe kehta hai "apne case ke liye vakil se milna".\n` +
      `Sirf JSON do:\n{${HEAD},"lines":[{"who":"A ya B","text":"(Devanagari Hindi, 1-2 chhote vakya, asli bol-chaal)","key":"(board pe dikhane ko 2-5 shabd)","emoji":"(1 emoji)","photo":"(1-4 English shabd: us cheez/jagah ki asli photo ki khoj, jaise 'Supreme Court of India', 'police station India', 'Indian rupee notes'; vishay na badle to wahi shabd dohraao; zaroorat na ho to khaali; kisi vyakti ka naam KABHI nahi)"}]}\n` +
      `Lagbhag ${nl} lines, A aur B baari-baari (kabhi ek hi kirdaar 2 line bhi). Shuru: A ek aam zindagi ki pareshani/sawaal se (pehli line 3 second mein dhyaan khinche). B ki pehli line mein chhota sa: "dekho, ye sirf jaankari hai, kanooni salah nahi". Beech mein: seedha jawab, kanoon/court kya kehta hai (judgment diya ho to naam-saal), kya karein — steps. A beech-beech mein sawaal/shaq kare taaki baat asli lage. Aakhir: B saar + "apne case ke liye vakil se milna, nateeje ki guarantee koi nahi de sakta"; A darshakon se: "aapke saath aisa hua hai? comment mein batao, aur like-subscribe kar do". ` +
      `Mazaak halka aur saaf ho — peedit, jaati, dharm, aurat/aadmi ya kisi samuday pe mazaak nahi. Kitaabi ya ratti hui bhasha nahi. ` + RULES;
    $("#vmsg").innerHTML = '<span class="dots"><i></i><i></i><i></i></span> Script ban rahi hai…';
    try {
      const r = await G.ask([{ role: "user", parts: [{ text: g ? globalPrompt(topic, nA, nB, cat, fmt, nl) : (style === "cartoon" ? CARTOON :
        `YouTube video banana hai (Hindi, aam logon ke liye, aasaan bhasha). Vishay:\n${topic}\n\n` +
        `Sirf JSON do, aur kuch nahi:\n{"title":"(60 akshar tak, Hindi+English mix chalega)","description":"(3-5 line + aakhir mein: '⚠️ Ye video sirf jaankari ke liye hai, kanooni salah nahi. Kisi nateeje ki guarantee nahi — apne case ke liye vakil se salah lein.')","tags":["..."],"thumbnail_text":"(4-6 shabd, bada asar)",` +
        `"slides":[{"emoji":"(1 emoji jo slide ko dikhaye)","heading":"(chhota, Hindi)","points":["(3 keyword, har ek 2-5 shabd)"],"narration":"(is slide pe bolne ki line, Devanagari Hindi, ${len === "short" ? "1-2" : "4-6"} vakya)"}]}\n` +
        `Theek ${n} slides. Dhaancha: 1) pehli slide sawaal se shuru (dhyaan khinche) aur uski narration ke ant mein ek chhoti line: "ye video sirf jaankari ke liye hai", 2) seedha jawab, 3) court/kanoon kya kehta hai (judgment diya ho to uska naam-saal), 4) aap kya karein — steps, aakhri: saar + 'ye kanooni salah nahi, sirf jaankari hai — kisi nateeje ki guarantee nahi; apne case ke liye vakil se milein' + 'achhi lagi to like aur subscribe'. LEHJA (sabse zaroori — video AI jaisi nahi lagni chahiye): narration aise likho jaise ek insaan camera ke saamne dost se baat kar raha ho — "dekhiye", "ab socho", "yahan dhyaan dena" jaise shabd, chhote vakya, aap/aapke se baat, ek-do sawaal darshak se. Pehli slide ki pehli line 3 second mein dhyaan khinche (ek aam zindagi ki situation: "maan lijiye raat ko police aapke ghar aati hai…" — kisi asli vyakti ka naam nahi). Rataa-rataaya ya kitaabi bhasha nahi, "is video mein hum jaanenge" jaisi ghisi-piti line nahi. Screen ke points narration ko dohraayein nahi — sirf 2-5 shabd ke keyword. Aakhri slide mein darshak se ek sawaal: "aapke saath aisa hua hai? comment mein batao". Video mein kahin bhi "pakka paisa wapas milega" ya "case jeet jaoge" jaisi guarantee mat do. ` +
        `KADE NIYAM: rape/yaun shoshan/POCSO/juvenile case mein peedit ya bachche ka naam ya pehchaan KABHI nahi; judge ya court ki niyat pe ilzaam nahi; chalte case mein kisi ko doshi mat kaho; aam logon (parties) ke naam ki jagah 'A aur B' ya 'pati/patni'; ` +
        `sirf wahi tathya jo diye gaye hain ya pakke aam kanooni gyaan ke hain — case naam, dhara ya saal apni taraf se mat banao (pakka na ho to dhara ka zikr mat karo); vakil ka prachaar/phone number nahi.`) + LANG }] }],
        { system: g ? "You are a top YouTube script writer for animated explainer videos. You return only valid JSON." : "Tum ek YouTube script writer ho. Sirf valid JSON lautate ho.", web: false, onPart: () => {} });
      const t = r.text.replace(/^[\s\S]*?(\{)/, "$1").replace(/\}[^}]*$/, "}");
      plan = JSON.parse(t);
      if (style === "cartoon") {
        plan.slides = (plan.lines || []).filter(l => l && l.text).map(l => ({ who: /^b/i.test(l.who || "") ? "B" : "A", narration: String(l.text), heading: String(l.key || ""), emoji: l.emoji || "", points: [], photoQ: String(l.photo || "").trim().slice(0, 60) }));
        plan.style = "cartoon"; plan.names = { A: nA, B: nB };
      }
      if (!Array.isArray(plan.slides) || !plan.slides.length) throw new Error("script nahi mili — dobara dabao");
      plan.short = len === "short"; plan.lang = g ? "en" : "hi"; plan.mode = mode; plan.cat = cat; plan.fmt = fmt;
      Object.keys(voices).forEach(k => delete voices[k]);
      Object.keys(photos).forEach(k => delete photos[k]);
      $("#vmsg").textContent = "✅ Script taiyaar" + (g ? ` (format: ${{ qa: "sawaal-jawaab", myth: "myth vs fact", top: "top 5", story: "kahani" }[fmt] || "Hindi lesson"})` : "") + " — neeche padh ke sudhaar sakte ho";
      drawEditor();
      if (plan.style === "cartoon") findPhotos();
    } catch (e) { $("#vmsg").textContent = "❌ " + (e.message || "Script nahi bani — dobara try karo"); }
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
        <select data-who="${i}"><option value="A" ${s.who === "A" ? "selected" : ""}>${GL() ? "🧳" : "🙋"} ${esc(p.names.A)}</option><option value="B" ${s.who === "B" ? "selected" : ""}>${GL() ? "🙋‍♀️" : "👴"} ${esc(p.names.B)}</option></select></div>
        <label class="field">🔊 Bolna hai<textarea data-n="${i}" rows="2">${esc(s.narration || "")}</textarea></label>
        <label class="field">🟩 Board pe<input data-h="${i}" value="${esc(s.heading || "")}"></label>
        <div class="row small" data-phrow="${i}">${photoRow(s, i)}</div>
        <div class="row"><button class="btn" data-rec="${i}">🎙️ Apni awaaz</button><span class="small" data-rs="${i}">${voices[i] ? "✅ Aapki awaaz (" + voices[i].dur.toFixed(0) + " sec) <button class='btn' data-play='" + i + "'>▶️</button>" : ""}</span></div></div>`).join("") :
      p.slides.map((s, i) => `<div class="card"><h3>Slide ${i + 1}</h3>
        <label class="field">Heading<input data-h="${i}" value="${esc(s.heading || "")}"></label>
        <label class="field">Points (har line ek point)<textarea data-p="${i}" rows="3">${esc((s.points || []).join("\n"))}</textarea></label>
        <label class="field">🔊 Bolna hai<textarea data-n="${i}" rows="3">${esc(s.narration || "")}</textarea></label>
        <div class="row"><button class="btn" data-pic="${i}">📷 ${photos[i] ? "Photo badlo" : "Apni photo lagao"}</button>${photos[i] ? `<button class="btn" data-unpic="${i}">✕ Photo hatao</button>` : ""}</div>
        <div class="row"><button class="btn" data-rec="${i}">🎙️ Apni awaaz record karo</button><span class="small" data-rs="${i}">${voices[i] ? "✅ Aapki awaaz (" + voices[i].dur.toFixed(0) + " sec) <button class='btn' data-play='" + i + "'>▶️</button>" : "Record nahi kiya to phone ki Indian awaaz"}</span></div></div>`).join("")}
      <div class="card">${p.style === "cartoon" ? `
        <label class="field">🙋 ${esc(p.names.A)} ki awaaz<select id="vva">${AI_VOICES.map(([k, t]) => `<option value="${k}" ${vA() === k ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label class="field">👴 ${esc(p.names.B)} ki awaaz<select id="vvb">${AI_VOICES.map(([k, t]) => `<option value="${k}" ${vB() === k ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <select id="vvoice" hidden><option value="ai:${vA()}"></option></select>` : `
        <label class="field">Awaaz (jo slide aapne record nahi ki)<select id="vvoice">
          ${AI_VOICES.map(([k, t]) => `<option value="ai:${k}" ${S.get("vVoice", "ai:Charon") === "ai:" + k ? "selected" : ""}>🤖 AI insaan jaisi — ${t}</option>`).join("")}
          <option value="phone" ${S.get("vVoice", "") === "phone" ? "selected" : ""}>📱 Phone ki Indian awaaz</option></select></label>`}
        ${p.style === "cartoon" ? `<div class="row"><button class="btn" id="vphotos">🖼️ Topic ki photos dhundho</button><label class="row small"><input type="checkbox" id="vphon" ${p.noPhotos ? "" : "checked"}> Peeche photo dikhao</label></div><div class="small muted">Photos Wikimedia Commons se (free license) — credit description mein apne aap judta hai.</div>` : ""}
        <button class="btn${p.style === "cartoon" ? " primary" : ""}" id="vtest">${p.style === "cartoon" ? "▶️ Pehle namoona dekho-suno (shuru ki 3 line)" : "▶️ Awaaz suno"}</button>
        <label class="row small"><input type="checkbox" id="vlow" ${S.get("vLow", (navigator.deviceMemory || 8) <= 4) ? "checked" : ""}> 📉 Halki quality (purana/kam RAM phone, ya app blank ho jaye to)</label>
        <label class="row small"><input type="checkbox" id="vmusic" ${S.get("vMusic", true) ? "checked" : ""}> 🎵 Peeche halka music (apna banaya, copyright-free)</label>
        ${p.style === "cartoon" ? "" : `<div class="banner small">💡 Video insaan jaisi lage, iske liye: 1) har slide pe <b>apni awaaz</b> record karo (sabse bada fark), 2) <b>apni kheenchi photo</b> lagao (court, thana, kagaz, apna haath — kisi ka chehra nahi), 3) script ko apne shabdon mein thoda badlo.</div>`}
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
    $("#vthumb").onclick = saveThumb;
    $$("[data-rec]").forEach(b => b.onclick = () => recordSlide(+b.dataset.rec));
    $$("[data-pic]").forEach(b => b.onclick = () => pickPhoto(+b.dataset.pic));
    $$("[data-unpic]").forEach(b => b.onclick = () => { readEdits(); delete photos[+b.dataset.unpic]; drawEditor(); });
    $("#vmusic").onchange = e => S.set("vMusic", e.target.checked);
    $("#vlow").onchange = e => S.set("vLow", e.target.checked);
    $$("[data-play]").forEach(b => b.onclick = () => { const a = new Audio(URL.createObjectURL(voices[+b.dataset.play].blob)); a.play(); });
    $("#vmake").onclick = make;
    const gate = () => { $("#vmake").disabled = $$(".vok").some(c => !c.checked); };
    $$(".vok").forEach(c => c.onchange = gate);
    $("#vcheck").onclick = checkScript;
    $("#vvoice").onchange = e => S.set("vVoice", e.target.value);
    if (p.style === "cartoon") {
      $("#vva").onchange = e => { S.set(K("vVoiceA"), e.target.value); $("#vvoice").innerHTML = `<option value="ai:${e.target.value}"></option>`; };
      $("#vvb").onchange = e => S.set(K("vVoiceB"), e.target.value);
    }
    if (p.style === "cartoon") {
      $("#vtest").onclick = preview;
      $("#vphotos").onclick = () => findPhotos(true);
      $("#vphon").onchange = e => { plan.noPhotos = !e.target.checked; };
      bindPhotoRows();
    }
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

  // soft original background music (a few slow chords), mixed quietly under the voice
  function music(ac, dest, start, dur) {
    const out = ac.createGain(); out.gain.value = 0.05;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
    out.connect(lp); lp.connect(dest);
    const CH = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [164.8, 207.7, 246.9]];
    const step = 4;
    for (let t = 0, k = 0; t < dur; t += step, k++) {
      CH[k % 4].forEach(f => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.value = f;
        const a = start + t, e = Math.min(start + dur, a + step + 0.5);
        g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(0.33, a + 1.2); g.gain.linearRampToValueAtTime(0, e);
        o.connect(g); g.connect(out); o.start(a); o.stop(e + 0.1);
      });
    }
    out.gain.setValueAtTime(0.05, start + Math.max(0, dur - 2)); out.gain.linearRampToValueAtTime(0, start + dur);
  }

  // ▶️ live preview of the first lines: real voices + moving cartoon, nothing saved
  async function lineAudio(ac, i) {
    if (voices[i]) return ac.decodeAudioData(await voices[i].blob.arrayBuffer());
    const sl = plan.slides[i], text = sl.narration || sl.heading || " ";
    const vv = plan.style === "cartoon" ? "ai:" + (sl.who === "B" ? vB() : vA()) : S.get("vVoice", "ai:Charon");
    if (vv.startsWith("ai:")) {
      try { return await ac.decodeAudioData(await aiVoice(text, vv.slice(3), plan.style === "cartoon" ? sl.who : "")); }
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
          for (let i = 0; i < n && !stop; i++) {
            st.innerHTML = `<span class="dots"><i></i><i></i><i></i></span> Awaaz ban rahi hai… ${i + 1}/${n}`;
            const b = await lineAudio(ac, i); segs.push({ i, buf: b, env: envelope(b) });
          }
        } catch (e) { st.textContent = "❌ " + (e.message || "Awaaz nahi bani") + " — ⚙️ Settings mein Gemini key dekho"; return; }
        if (stop) return;
        let t = 0; segs.forEach(s => { s.start = t; t += s.buf.duration + 0.3; }); const total = t;
        const t0 = ac.currentTime + 0.2;
        if (S.get("vMusic", true)) music(ac, ac.destination, t0, total);
        segs.forEach(s => { const src = ac.createBufferSource(); src.buffer = s.buf; src.connect(ac.destination); src.start(t0 + s.start); });
        st.textContent = "🔊 Awaaz chalu hai — pasand na aaye to upar awaaz badal ke dobara dekho";
        const tick = () => {
          if (stop || !document.contains(cv)) { end(); return; }
          const el = ac.currentTime - t0;
          if (el >= total) { st.textContent = "✅ Namoona khatam. Theek laga to neeche tick lagao aur 🎬 Video banao (ye awaaz dobara use hogi)."; return; }
          const s = segs.find(x => el >= x.start && el < x.start + x.buf.duration + 0.3) || segs[0];
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
    const script = plan.style === "cartoon" ? plan.slides.map((s, i) => `${i + 1}. ${plan.names[s.who]}: ${s.narration}  [board: ${s.heading}]`).join("\n") :
      plan.slides.map((s, i) => `Slide ${i + 1}: ${s.heading}\n- ${(s.points || []).join("\n- ")}\nBolna: ${s.narration}`).join("\n\n");
    try {
      const r = await G.ask([{ role: "user", parts: [{ text: GL() ?
        "Ye ek English YouTube learning/entertainment video ki script hai (videshi darshakon ke liye). Ek savdhan editor ki tarah jaancho aur Hinglish mein sirf problems ki list do (har ek: line no. · kya galat/jokhim · kaise sudhaarein):\n" +
        "1) galat ya shaky tathya — numbers, tareekh, naam, quotes jo pakke nahi, 2) kisi desh/dharm/samuday/aurat-aadmi ka mazaak ya stereotype, 3) guarantee ya personal paise/health salah, 4) gaane ke bol ya film ke dialogue (copyright), 5) title jo jhooth bole (clickbait), 6) Hindi shabd ka galat matlab/spelling.\n" +
        "Web se pakka karo jahan zaroori ho. Koi problem na ho to sirf likho: '✅ Koi bada jokhim nahi mila'. Andaaza mat lagao.\n\nTitle: " + plan.title + "\n\n" + script :
        "Ye ek shiksha (learning) wali YouTube video ki script hai. Ek savdhan kanooni editor ki tarah jaancho aur Hinglish mein sirf problems ki list do (har ek: slide no. · kya galat/jokhim · kaise sudhaarein):\n" +
        "1) galat ya shaky kanooni tathya (dhara, saal, case naam jo pakka nahi), 2) koi guarantee ('pakka milega', 'jeet jaoge'), 3) kisi peedit/bachche/aam vyakti ka naam ya pehchaan, 4) judge/court/police/vyakti pe ilzaam ya apmaanjanak baat, 5) seedhi kanooni salah ka lehja ('aap ye karo to case jeet jaoge') jahan 'vakil se milein' hona chahiye, 6) chalte case pe faisla.\n" +
        "Web se pakka karo jahan zaroori ho. Koi problem na ho to sirf likho: '✅ Koi bada jokhim nahi mila'. Andaaza mat lagao.\n\nTitle: " + plan.title + "\n\n" + script }] }],
        { system: "Tum ek savdhan kanooni editor ho. Sirf problems batate ho, nayi baatein nahi jodte.", web: true, onPart: p => { out.innerHTML = MD.render(p.text); } });
      out.innerHTML = MD.render(r.text) + ((r.sources || []).length ? "<div class='src'>🔗 " + r.sources.slice(0, 5).map(s => `<a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join("") + "</div>" : "");
    } catch (e) { out.textContent = "❌ " + (e.message || "Jaanch nahi hui"); }
  }

  function readEdits() {
    const p = plan;
    p.title = $("#vt").value; p.description = $("#vd").value; p.tags = $("#vg").value.split(",").map(x => x.trim()).filter(Boolean); p.thumbnail_text = $("#vth").value;
    if (p.style === "cartoon") { p.slides.forEach((s, i) => { s.who = $(`[data-who="${i}"]`).value; s.heading = $(`[data-h="${i}"]`).value.trim(); s.narration = $(`[data-n="${i}"]`).value.trim(); }); return; }
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
    ctx.font = `bold ${(w < h ? 40 : 32) * sc}px ${F}`; ctx.textAlign = "left";
    const sp = ctx.measureText(" ").width, ws = part.map(x => ctx.measureText(x).width);
    const lw = ws.reduce((a, b) => a + b, 0) + sp * (part.length - 1);
    const y = yAt || (w < h ? h * 0.72 : h - 70 * sc), tw = Math.min(w - 30 * sc, lw + 40 * sc);
    ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect((w - tw) / 2, y - 40 * sc, tw, 56 * sc);
    let x = (w - lw) / 2;
    part.forEach((p, j) => { ctx.fillStyle = k * per + j === cur ? (color || "#ffd166") : "#fff"; ctx.fillText(p, x, y); x += ws[j] + sp; });
  }
  function frame(ctx, w, h, kind, s, prog, idx, total, channel, tsec) {
    const sc = Math.min(w, h) / 720, F = "'Noto Sans Devanagari','Noto Sans',sans-serif";
    bg(ctx, w, h, 215 + idx * 17, tsec);
    const ph = kind === "slide" ? photos[idx] : (kind === "title" ? photos[0] : null);
    if (ph && ph.naturalWidth) { // slow zoom/pan over the owner's photo, darkened so text stays readable
      const z = 1.05 + 0.08 * prog, r = Math.max(w / ph.naturalWidth, h / ph.naturalHeight) * z;
      const dw = ph.naturalWidth * r, dh = ph.naturalHeight * r;
      ctx.drawImage(ph, (w - dw) / 2 - (idx % 2 ? 1 : -1) * 20 * prog, (h - dh) / 2, dw, dh);
      const gr = ctx.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "rgba(0,0,0,.72)"); gr.addColorStop(0.5, "rgba(0,0,0,.45)"); gr.addColorStop(1, "rgba(0,0,0,.75)");
      ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
    }
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
  function overlay(ctx, w, h, channel, sc, F, dark) {
    if (channel) { ctx.textAlign = "right"; ctx.font = `${22 * sc}px ${F}`; ctx.fillStyle = dark ? "rgba(60,40,20,.75)" : "rgba(255,255,255,.6)"; ctx.fillText(channel, w - 24 * sc, 40 * sc); }
    // always on screen: education only
    ctx.textAlign = "left"; ctx.font = `bold ${18 * sc}px ${F}`;
    const dl = !EN() ? "📚 सिर्फ शिक्षा/जानकारी के लिए — कानूनी सलाह नहीं" : CAT() === "money" ? "📚 Learning only — not financial advice" : CAT() === "scam" ? "📚 Learning only — not legal or financial advice" : CAT() === "mind" ? "📚 Learning only — not medical advice" : GL() ? "📚 For learning & fun" : "📚 For education only — not legal advice";
    const dw = ctx.measureText(dl).width + 20 * sc;
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(14 * sc, 14 * sc, dw, 32 * sc);
    ctx.fillStyle = "#ffd166"; ctx.fillText(dl, 24 * sc, 36 * sc);
  }

  // ---------- cartoon (two original characters) ----------
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  // cartoon hand: palm + 4 fingers + thumb, pointing along the arm
  function hand(ctx, x, y, dir, s, skin, line, side, wig) {
    const F = [[-0.5, 13], [-0.17, 16], [0.17, 15], [0.5, 12]].map(([a, l]) => [dir + a + wig, l * s]);
    const th = [dir - side * 1.25, 11 * s];
    const seg = ([a, l], from) => { ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * from, y + Math.sin(a) * from); ctx.lineTo(x + Math.cos(a) * (10 * s + l), y + Math.sin(a) * (10 * s + l)); ctx.stroke(); };
    ctx.lineCap = "round";
    ctx.strokeStyle = line; ctx.lineWidth = 9.5 * s; [...F, th].forEach(f => seg(f, 4 * s));
    ctx.fillStyle = skin; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.arc(x, y, 13 * s, 0, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = skin; ctx.lineWidth = 5 * s; [...F, th].forEach(f => seg(f, 6 * s));
    ctx.strokeStyle = line;
  }
  // Original characters. Hindi channel: Pappu + Chacha. Global channel: Leo + Priya.
  const LOOKS = {
    pappu: { skin: "#e0ac7e", shirt: "#f4a72b", hair: "spiky", hc: "#1d1a18", brow: "#1d1a18", chest: "star" },
    chacha: { skin: "#d39a6a", shirt: "#3d6fb6", hair: "bald", hc: "#e8e6e1", brow: "#cfcac2", chest: "buttons", glasses: 1, mustache: 1 },
    leo: { skin: "#f3cba8", shirt: "#2fa37a", hair: "cap", hc: "#d9a441", cap: "#e2533c", brow: "#b5832e", chest: "hood", freckles: 1 },
    priya: { skin: "#c98d62", shirt: "#b0306a", hair: "braid", hc: "#1a1414", brow: "#1a1414", chest: "kurti", bindi: 1, lashes: 1, earrings: 1 },
  };
  const lookOf = who => LOOKS[GL() ? (who === "A" ? "leo" : "priya") : (who === "A" ? "pappu" : "chacha")];
  // mouth 0..1 (open), face: +1 looks right, -1 looks left
  function drawChar(ctx, x, y, s, who, mouth, blink, talking, tsec, face) {
    const L = lookOf(who), ph = who === "A" ? 0 : 2;
    const bob = talking ? Math.sin(tsec * 9) * 2.5 * s : Math.sin(tsec * 1.6 + ph) * 1.5 * s;
    ctx.save(); ctx.translate(x, y + bob);
    const shirt = L.shirt, skin = L.skin, line = "#2b2420";
    ctx.lineWidth = 4 * s; ctx.strokeStyle = line; ctx.lineJoin = "round"; ctx.lineCap = "round";
    if (L.hair === "braid") { ctx.fillStyle = L.hc; ctx.beginPath(); ctx.ellipse(0, -215 * s, 76 * s, 92 * s, 0, 0, 7); ctx.fill(); }
    // body
    ctx.fillStyle = shirt; rr(ctx, -78 * s, -150 * s, 156 * s, 160 * s, 46 * s); ctx.fill(); ctx.stroke();
    if (L.chest === "buttons") { ctx.beginPath(); ctx.moveTo(0, -140 * s); ctx.lineTo(0, -40 * s); ctx.stroke(); [-110, -85, -60].forEach(by => { ctx.fillStyle = "#f3e6c8"; ctx.beginPath(); ctx.arc(8 * s, by * s, 4 * s, 0, 7); ctx.fill(); }); }
    else if (L.chest === "star") { ctx.fillStyle = "#fff"; ctx.font = `bold ${26 * s}px sans-serif`; ctx.textAlign = "center"; ctx.fillText("★", 0, -70 * s); }
    else if (L.chest === "hood") {
      ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(0, -146 * s, 46 * s, 16 * s, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = "#f4f1e8"; ctx.lineWidth = 3 * s; [-14, 14].forEach(dx => { ctx.beginPath(); ctx.moveTo(dx * s, -138 * s); ctx.lineTo(dx * s, -100 * s); ctx.stroke(); });
      ctx.strokeStyle = line; ctx.lineWidth = 3 * s; rr(ctx, -40 * s, -60 * s, 80 * s, 34 * s, 10 * s); ctx.stroke(); ctx.lineWidth = 4 * s;
    } else if (L.chest === "kurti") {
      ctx.strokeStyle = "#f2c14e"; ctx.lineWidth = 5 * s; ctx.beginPath(); ctx.moveTo(-24 * s, -148 * s); ctx.lineTo(0, -108 * s); ctx.lineTo(24 * s, -148 * s); ctx.stroke();
      ctx.fillStyle = "#f2c14e"; for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.arc(k * 20 * s, -24 * s, 3.5 * s, 0, 7); ctx.fill(); }
      ctx.strokeStyle = line; ctx.lineWidth = 4 * s;
    }
    // braid falls over one shoulder
    if (L.hair === "braid") { ctx.fillStyle = L.hc; const bs = -face; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.ellipse(bs * 58 * s, (-178 + k * 21) * s, (13 - k) * s, 13 * s, 0, 0, 7); ctx.fill(); } ctx.fillStyle = "#e2533c"; ctx.beginPath(); ctx.arc(bs * 58 * s, -78 * s, 6 * s, 0, 7); ctx.fill(); }
    // arms: the talker gestures
    const g = talking ? Math.sin(tsec * 5) * 0.35 : 0;
    [-1, 1].forEach(side => {
      const up = talking && side === face;
      const ang = up ? -0.9 + g : 0.25;
      const sx = side * 70 * s, sy = -120 * s, ex = sx + side * Math.cos(ang) * 70 * s * (up ? 0.9 : 0.3), ey = sy + (up ? Math.sin(ang) * 70 * s : 95 * s);
      ctx.strokeStyle = shirt; ctx.lineWidth = 26 * s; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      hand(ctx, ex, ey, Math.atan2(ey - sy, ex - sx), s, skin, line, side, up ? Math.sin(tsec * 7) * 0.12 : 0);
    });
    // neck + head
    ctx.fillStyle = skin; ctx.fillRect(-18 * s, -172 * s, 36 * s, 30 * s);
    const hy = -232 * s, nod = !talking ? Math.sin(tsec * 2.2 + ph) * 0.04 : 0;
    ctx.translate(0, hy); ctx.rotate(nod);
    ctx.lineWidth = 4 * s; ctx.strokeStyle = line;
    ctx.beginPath(); ctx.ellipse(0, 0, 66 * s, 72 * s, 0, 0, 7); ctx.fill(); ctx.stroke();
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
    } else if (L.hair === "braid") {
      ctx.fillStyle = L.hc; ctx.beginPath(); ctx.moveTo(-68 * s, 4 * s);
      ctx.quadraticCurveTo(-72 * s, -84 * s, 0, -80 * s); ctx.quadraticCurveTo(72 * s, -84 * s, 68 * s, 4 * s);
      ctx.quadraticCurveTo(56 * s, -40 * s, 4 * s, -50 * s); ctx.lineTo(-4 * s, -50 * s); ctx.quadraticCurveTo(-56 * s, -40 * s, -68 * s, 4 * s); ctx.fill();
    }
    // eyes (look at the other character)
    const ex = face * 5 * s;
    ctx.strokeStyle = line;
    [-24, 24].forEach(dx => {
      if (blink) { ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo((dx - 10) * s, -6 * s); ctx.lineTo((dx + 10) * s, -6 * s); ctx.stroke(); return; }
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(dx * s, -6 * s, 12 * s, 14 * s, 0, 0, 7); ctx.fill(); ctx.lineWidth = 2.5 * s; ctx.stroke();
      ctx.fillStyle = line; ctx.beginPath(); ctx.arc(dx * s + ex, -4 * s, 6 * s, 0, 7); ctx.fill();
      if (L.lashes) { const o = Math.sign(dx); ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo((dx + o * 9) * s, -16 * s); ctx.lineTo((dx + o * 17) * s, -22 * s); ctx.stroke(); }
    });
    // eyebrows (raised while talking)
    ctx.lineWidth = 5 * s; ctx.strokeStyle = L.brow;
    const br = talking ? -6 * s : 0;
    [-24, 24].forEach(dx => { ctx.beginPath(); ctx.moveTo((dx - 12) * s, -28 * s + br); ctx.lineTo((dx + 12) * s, -30 * s + br); ctx.stroke(); });
    ctx.strokeStyle = line; ctx.lineWidth = 3 * s;
    if (L.glasses) { [-24, 24].forEach(dx => { ctx.beginPath(); ctx.arc(dx * s, -6 * s, 19 * s, 0, 7); ctx.stroke(); }); ctx.beginPath(); ctx.moveTo(-5 * s, -6 * s); ctx.lineTo(5 * s, -6 * s); ctx.stroke(); }
    if (L.bindi) { ctx.fillStyle = "#d62839"; ctx.beginPath(); ctx.arc(0, -30 * s, 4.5 * s, 0, 7); ctx.fill(); }
    if (L.freckles) { ctx.fillStyle = "rgba(160,90,50,.55)"; [[-38, 16], [-30, 22], [-44, 22], [38, 16], [30, 22], [44, 22]].forEach(([fx, fy]) => { ctx.beginPath(); ctx.arc(fx * s, fy * s, 2.2 * s, 0, 7); ctx.fill(); }); }
    // nose
    ctx.beginPath(); ctx.moveTo(face * 2 * s, 4 * s); ctx.quadraticCurveTo(face * 12 * s, 20 * s, 0, 22 * s); ctx.stroke();
    // mouth
    const my = 42 * s;
    if (mouth > 0.08) {
      ctx.fillStyle = "#6b2b2b"; ctx.beginPath(); ctx.ellipse(0, my, 18 * s, (4 + 15 * Math.min(1, mouth)) * s, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#e66"; ctx.beginPath(); ctx.ellipse(0, my + (3 + 8 * Math.min(1, mouth)) * s, 9 * s, 4 * s, 0, 0, 7); ctx.fill();
    } else { if (L.lashes) { ctx.strokeStyle = "#a63a46"; ctx.lineWidth = 4.5 * s; } ctx.beginPath(); ctx.arc(0, my - 12 * s, 18 * s, 0.35, Math.PI - 0.35); ctx.stroke(); ctx.strokeStyle = line; }
    if (L.mustache) { ctx.fillStyle = "#e8e6e1"; ctx.beginPath(); ctx.moveTo(-30 * s, 30 * s); ctx.quadraticCurveTo(0, 18 * s, 30 * s, 30 * s); ctx.quadraticCurveTo(0, 38 * s, -30 * s, 30 * s); ctx.fill(); }
    ctx.restore();
  }
  // a different place for each kind of topic, so videos don't all look the same
  function cartoonScene(ctx, w, h, tsec) {
    const sc = Math.min(w, h) / 720, v = w < h, cat = CAT(), fy = h * (v ? 0.86 : 0.8);
    const grad = (a, b) => { const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, a); g.addColorStop(1, b); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); };
    const rnd = k => { const x = Math.sin(k * 127.1) * 43758.5453; return x - Math.floor(x); };
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
  function photoBg(ctx, w, h, img, tsec, idx) {
    const z = 1.06 + 0.04 * Math.sin(tsec * 0.15 + idx), r = Math.max(w / img.naturalWidth, h / img.naturalHeight) * z;
    const dw = img.naturalWidth * r, dh = img.naturalHeight * r;
    ctx.drawImage(img, (w - dw) / 2 + Math.sin(tsec * 0.1) * 12, (h - dh) / 2, dw, dh);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(0,0,0,.45)"); g.addColorStop(0.35, "rgba(0,0,0,.08)"); g.addColorStop(0.65, "rgba(0,0,0,.15)"); g.addColorStop(1, "rgba(0,0,0,.65)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
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

  function cartoonFrame(ctx, w, h, kind, s, prog, idx, total, channel, tsec, mouth) {
    const sc = Math.min(w, h) / 720, F = "'Noto Sans Devanagari','Noto Sans',sans-serif", v = w < h;
    const ph = photoAt(kind === "slide" ? idx : kind === "end" ? 1e9 : 0);
    if (ph) photoBg(ctx, w, h, ph, tsec, idx); else cartoonScene(ctx, w, h, tsec);
    const board = ph ? label : boardBig;
    const names = (plan && plan.names) || (GL() ? { A: "Leo", B: "Priya" } : { A: "Pappu", B: "Chacha" });
    const who = kind === "slide" ? s.who : null;
    if (kind === "slide") board(ctx, w, h, s.heading, s.emoji, sc, F);
    else board(ctx, w, h, kind === "title" ? (plan && plan.title) || s : (EN() ? "Thanks for watching 🙏  Like • Subscribe" : "धन्यवाद 🙏  Like • Subscribe"), "", sc, F);
    const cs = (v ? 1.15 : 1.25) * sc, ax = v ? w * 0.27 : w * 0.16, bx = v ? w * 0.73 : w * 0.84, cy = v ? h - 30 * sc : h - 10 * sc;
    const bl = k => (tsec + k) % 3.9 < 0.13;
    const end = kind === "end";
    drawChar(ctx, ax, cy, cs, "A", who === "A" ? mouth : 0, bl(0), who === "A" || (end && Math.sin(tsec * 6) > 0), tsec, 1);
    drawChar(ctx, bx, cy, cs, "B", who === "B" ? mouth : 0, bl(1.7), who === "B", tsec, -1);
    // name tags
    ctx.font = `bold ${22 * sc}px ${F}`; ctx.textAlign = "center";
    [[ax, names.A, "A"], [bx, names.B, "B"]].forEach(([x, n, k]) => {
      const tw = ctx.measureText(n).width + 24 * sc, ty = cy - (v ? 395 : 425) * sc;
      ctx.fillStyle = who === k ? "#ffd166" : "rgba(255,255,255,.85)"; rr(ctx, x - tw / 2, ty - 24 * sc, tw, 34 * sc, 12 * sc); ctx.fill();
      ctx.fillStyle = "#2b2420"; ctx.fillText(n, x, ty);
    });
    if (kind === "slide") subtitle(ctx, w, h, s.narration, prog, sc, F, v ? h * 0.48 : h * 0.5, who === "A" ? "#ffd166" : "#8fe3ff");
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
      if (i + CH >= buf.length) break;
    }
    return true;
  }

  async function saveThumb() {
    readEdits();
    const c = document.createElement("canvas"); c.width = 1280; c.height = 720;
    const x = c.getContext("2d");
    if (plan.style === "cartoon") {
      const ph = photoAt(0); if (ph) photoBg(x, 1280, 720, ph, 0, 0); else cartoonScene(x, 1280, 720, 0);
      drawChar(x, 190, 740, 1.35, "A", 0.7, false, true, 0.3, 1); drawChar(x, 1090, 740, 1.35, "B", 0, false, false, 0, -1);
      x.fillStyle = "rgba(0,0,0,.55)"; x.fillRect(330, 150, 620, 400);
      x.fillStyle = "#ffd166"; x.textAlign = "center"; x.font = "bold 78px 'Noto Sans Devanagari',sans-serif";
      wrap(x, plan.thumbnail_text || plan.title || "", 640, 270, 580, 92, 4);
      x.fillStyle = "#fff"; x.font = "34px sans-serif"; x.fillText(S.get(K("vChannel"), ""), 640, 530);
      const blob = await new Promise(r => c.toBlob(r, "image/png"));
      toast(await saveBlob(blob, "thumbnail-" + ymd() + ".png", "image/png") ? "✅ Thumbnail: Downloads/Sahayak" : "Save nahi hua");
      return;
    }
    bg(x, 1280, 720, 10);
    x.fillStyle = "#ffd166"; x.textAlign = "center"; x.font = "bold 92px 'Noto Sans Devanagari',sans-serif";
    wrap(x, plan.thumbnail_text || plan.title || "", 640, 300, 1150, 110, 3);
    x.fillStyle = "#fff"; x.font = "36px sans-serif"; x.fillText(S.get(K("vChannel"), ""), 640, 660);
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    toast(await saveBlob(blob, "thumbnail-" + ymd() + ".png", "image/png") ? "✅ Thumbnail: Downloads/Sahayak" : "Save nahi hua");
  }

  async function make() {
    if (busy) return;
    const cartoon = plan.style === "cartoon";
    if (!cartoon && !IS_APP && !S.get("vVoice", "ai:Charon").startsWith("ai:")) { toast("Laptop pe 🤖 AI awaaz chuno (phone ki awaaz sirf phone app mein)"); return; }
    readEdits(); busy = true; if (IS_APP) window.Native.keepScreenOn(true);
    const prog = $("#vprog"), say = m => { prog.innerHTML = m; };
    const stage = st => S.set("vMaking", { stage: st, at: Date.now() }); // survives a crash → shown next time
    let onVis = null;
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const bufs = []; let fallbackNote = "";
      for (let i = 0; i < plan.slides.length; i++) {
        say(`🔊 Awaaz taiyaar ho rahi hai… ${i + 1}/${plan.slides.length}`); stage(`awaaz ${i + 1}/${plan.slides.length}`);
        if (voices[i]) { bufs.push(await ac.decodeAudioData(await voices[i].blob.arrayBuffer())); continue; }
        const vv = cartoon ? "ai:" + (plan.slides[i].who === "B" ? vB() : vA()) : S.get("vVoice", "ai:Charon"), text = plan.slides[i].narration || plan.slides[i].heading || " ";
        if (vv.startsWith("ai:")) {
          try { bufs.push(await ac.decodeAudioData(await aiVoice(text, vv.slice(3), cartoon ? plan.slides[i].who : ""))); continue; }
          catch (e) { if (!IS_APP) throw e; fallbackNote = "Kuch hisson mein AI awaaz ki free limit poori — wahan phone ki awaaz lagi" + (cartoon ? " (dono kirdaar ki ek jaisi awaaz)" : ""); }
        }
        const r = await nativeCall("speakToFile", plan.slides[i].narration || plan.slides[i].heading || " ", EN() ? "en-US" : "hi-IN", S.get("voiceRate", 1));
        if (r.error) throw new Error(r.error);
        const bin = atob(r.b64), arr = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
        bufs.push(await ac.decodeAudioData(arr.buffer));
      }
      if (cartoon) { say("🖼️ Photos load ho rahi hain…"); await Promise.all(plan.slides.filter(x => x.photo).map(x => loadImg(x.photo.url))); }
      const low = !!S.get("vLow", (navigator.deviceMemory || 8) <= 4), fps = low ? 24 : 30;
      const w = plan.short ? (low ? 540 : 720) : (low ? 960 : W), h = plan.short ? (low ? 960 : 1280) : (low ? 540 : H);
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      const dest = ac.createMediaStreamDestination();
      const stream = new MediaStream([...c.captureStream(fps).getVideoTracks(), ...dest.stream.getAudioTracks()]);
      const mime = ["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
      if (!mime) throw new Error("Is phone mein video recording nahi chalti");
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: low ? 1200000 : 2200000 });
      const ext = mime.startsWith("video/mp4") ? "mp4" : "webm", base = mime.split(";")[0];
      const name = "video-" + ymd() + "-" + Date.now().toString(36).slice(-4) + "." + ext;
      // phone: write each second's piece straight to storage, so the whole video never sits in memory
      const chunks = []; let wq = Promise.resolve(), size = 0, firstW = true, wfail = false;
      const put = async (u8, last) => { const f = firstW; firstW = false; const r = await nativeCall("saveChunk", name, base, b64(u8), f, last); if (!r.ok) wfail = true; };
      rec.ondataavailable = e => {
        if (!e.data.size) return; size += e.data.size;
        if (!IS_APP) { chunks.push(e.data); return; }
        const d = e.data; wq = wq.then(async () => { const u8 = new Uint8Array(await d.arrayBuffer()); for (let i = 0; i < u8.length; i += 768 * 1024) await put(u8.subarray(i, i + 768 * 1024), false); });
      };
      // timeline: title 2.5s, slides (voice + 0.6s), end 2.5s
      const segs = [{ kind: "title", d: plan.short ? 1.2 : 2.5 }];
      bufs.forEach((b, i) => segs.push({ kind: "slide", i, d: b.duration + (cartoon ? 0.3 : 0.6), buf: b, env: cartoon ? envelope(b) : null }));
      segs.push({ kind: "end", d: 2.5 });
      let t = 0; segs.forEach(s => { s.start = t; t += s.d; }); const total = t;
      const ch = S.get(K("vChannel"), "");
      if (cartoon) cartoonFrame(ctx, w, h, "title", plan.title, 0, 0, 1, ch, 0, 0); else frame(ctx, w, h, "title", plan.title, 0, 0, 1, ch);
      rec.start(1000);
      // leaving the app pauses the video; coming back continues from the same point
      onVis = () => {
        if (document.hidden) { try { rec.pause(); } catch (e) {} ac.suspend(); }
        else { ac.resume(); try { rec.resume(); } catch (e) {} }
      };
      document.addEventListener("visibilitychange", onVis);
      const t0 = ac.currentTime + 0.3; let lastSay = -1;
      if (S.get("vMusic", true)) music(ac, dest, t0, total);
      segs.forEach(s => { if (s.buf) { const src = ac.createBufferSource(); src.buffer = s.buf; src.connect(dest); src.start(t0 + s.start); } });
      await new Promise(done => {
        const iv = setInterval(() => {
          const el = ac.currentTime - t0;
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
      document.removeEventListener("visibilitychange", onVis); onVis = null;
      say("💾 Save ho raha hai…"); stage("save");
      let ok;
      if (IS_APP) { await wq; await put(new Uint8Array(0), true); ok = !wfail; }
      else ok = await saveBlob(new Blob(chunks, { type: base }), name, base);
      S.del("vMaking");
      say(ok ? `✅ Video taiyaar: <b>Downloads/Sahayak/${name}</b> (${(size / 1048576).toFixed(1)} MB). YouTube app mein upload karo — title/description upar se copy karo.${fallbackNote ? "<br>⚠️ " + fallbackNote : ""}<br>ℹ️ Upload karte waqt YouTube puchhe "altered/synthetic content?" — AI awaaz ho to imaandaari se batana.` : "❌ Save nahi hua");
      ac.close();
    } catch (e) { say("❌ " + (e.message || "Video nahi bani")); S.del("vMaking"); }
    if (onVis) document.removeEventListener("visibilitychange", onVis);
    busy = false; if (IS_APP) window.Native.keepScreenOn(false);
  }

  return { render, _frame: frame, _photos: photos, _cartoon: (ctx, w, h, s, names, tsec, m, extra) => { plan = plan || { title: "" }; plan.names = names; Object.assign(plan, extra || {}); if (extra && extra.img) { imgs["t"] = extra.img; plan.slides = [{ photo: { url: "t" } }]; } return cartoonFrame(ctx, w, h, "slide", s, 0.5, 2, 8, "Kanoon Aasaan", tsec, m); } };
})();
