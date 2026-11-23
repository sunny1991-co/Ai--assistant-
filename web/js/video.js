// 🎬 Video banao: topic → Hindi script + slides (AI) → Indian voice (phone TTS) → video file
// (slides + voice) + thumbnail + title/description/tags. Original content only.
"use strict";
const Video = (() => {
  let plan = null, busy = false;
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

  function render() {
    $("#view").innerHTML = `<div class="wrap"><h2 style="margin:6px 0">🎬 Video banao</h2>
      <div class="banner">✅ Sirf apna original content (doosron ki video/gaana mat daalna). ⚖️ Peedit ka naam kabhi nahi, judge pe ilzaam nahi, parties "A aur B". Upload se pehle script ek baar khud padh lena.</div>
      <div class="card">
        <label class="field">❓ Logon ka sawaal<input id="vq" placeholder="Jaise: Kya police bina warrant giraftar kar sakti hai?"></label>
        <div class="toggles" style="flex-wrap:wrap">${IDEAS.map(q => `<button class="tg" data-idea="${esc(q)}">${esc(q)}</button>`).join("")}</div>
        <label class="field">⚖️ Judgment / tathya (optional — Court app ka saar yahan paste karo)<textarea id="vtopic" rows="4" placeholder="Jaise: Arnesh Kumar vs State of Bihar (2014) — 7 saal se kam saza wale case mein turant giraftari nahi…"></textarea></label>
        <div class="row"><label class="field" style="flex:1">Lambai<select id="vlen">${Object.entries(LENGTHS).map(([k, v]) => `<option value="${k}" ${k === "mid" ? "selected" : ""}>${v[0]}</option>`).join("")}</select></label>
        <label class="field" style="flex:1">Channel ka naam<input id="vch" value="${esc(S.get("vChannel", ""))}" placeholder="Jaise: Kanoon Aasaan"></label></div>
        <button class="btn primary wide" id="vplan">✍️ Script + slides banao</button>
        <div id="vmsg" class="small" style="margin-top:6px"></div>
      </div>
      <div id="vedit"></div></div>`;
    $("#vplan").onclick = makePlan;
    $$("[data-idea]").forEach(b => b.onclick = () => { $("#vq").value = b.dataset.idea; });
    if (plan) drawEditor();
  }

  async function makePlan() {
    const q = $("#vq").value.trim(), facts = $("#vtopic").value.trim();
    if (q.length < 8 && facts.length < 15) { toast("Sawaal likho ya ek idea chuno"); return; }
    const topic = "Sawaal: " + (q || "(tathya se banao)") + (facts ? "\nJudgment / tathya:\n" + facts : "");
    S.set("vChannel", $("#vch").value.trim());
    const len = $("#vlen").value, n = LENGTHS[len][1];
    $("#vmsg").innerHTML = '<span class="dots"><i></i><i></i><i></i></span> Script ban rahi hai…';
    try {
      const r = await G.ask([{ role: "user", parts: [{ text:
        `YouTube video banana hai (Hindi, aam logon ke liye, aasaan bhasha). Vishay:\n${topic}\n\n` +
        `Sirf JSON do, aur kuch nahi:\n{"title":"(60 akshar tak, Hindi+English mix chalega)","description":"(3-5 line + 'Ye kanooni salah nahi hai' disclaimer)","tags":["..."],"thumbnail_text":"(4-6 shabd, bada asar)",` +
        `"slides":[{"heading":"(chhota, Hindi)","points":["(3 chhote point)"],"narration":"(is slide pe bolne ki line, Devanagari Hindi, ${len === "short" ? "1-2" : "4-6"} vakya)"}]}\n` +
        `Theek ${n} slides. Dhaancha: 1) pehli slide sawaal se shuru (dhyaan khinche), 2) seedha jawab, 3) court/kanoon kya kehta hai (judgment diya ho to uska naam-saal), 4) aap kya karein — steps, aakhri: saar + 'ye kanooni salah nahi, jaankari hai' + 'achhi lagi to like aur subscribe'. ` +
        `KADE NIYAM: rape/yaun shoshan/POCSO/juvenile case mein peedit ya bachche ka naam ya pehchaan KABHI nahi; judge ya court ki niyat pe ilzaam nahi; chalte case mein kisi ko doshi mat kaho; aam logon (parties) ke naam ki jagah 'A aur B' ya 'pati/patni'; ` +
        `sirf wahi tathya jo diye gaye hain ya pakke aam kanooni gyaan ke hain — case naam, dhara ya saal apni taraf se mat banao (pakka na ho to dhara ka zikr mat karo); vakil ka prachaar/phone number nahi.` }] }],
        { system: "Tum ek YouTube script writer ho. Sirf valid JSON lautate ho.", web: false, onPart: () => {} });
      const t = r.text.replace(/^[\s\S]*?(\{)/, "$1").replace(/\}[^}]*$/, "}");
      plan = JSON.parse(t);
      if (!Array.isArray(plan.slides) || !plan.slides.length) throw new Error("slides nahi mili");
      plan.short = len === "short";
      $("#vmsg").textContent = "✅ Script taiyaar — neeche padh ke sudhaar sakte ho";
      drawEditor();
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
      ${p.slides.map((s, i) => `<div class="card"><h3>Slide ${i + 1}</h3>
        <label class="field">Heading<input data-h="${i}" value="${esc(s.heading || "")}"></label>
        <label class="field">Points (har line ek point)<textarea data-p="${i}" rows="3">${esc((s.points || []).join("\n"))}</textarea></label>
        <label class="field">🔊 Bolna hai<textarea data-n="${i}" rows="3">${esc(s.narration || "")}</textarea></label></div>`).join("")}
      <div class="card"><button class="btn primary wide" id="vmake">🎬 Video banao (Indian awaaz)</button>
        <div id="vprog" class="small" style="margin-top:6px"></div>
        <p class="muted small">Video banne mein utna hi time lagta hai jitni lambi video hai (3 min video ≈ 3-4 min). Tab tak screen chalu rakho aur app band mat karo. Awaaz: ⚙️ Settings mein chuni Indian awaaz.</p></div>`;
    $$("[data-copy]").forEach(b => b.onclick = () => copyText($("#" + b.dataset.copy).value));
    $("#vthumb").onclick = saveThumb;
    $("#vmake").onclick = make;
  }

  function readEdits() {
    const p = plan;
    p.title = $("#vt").value; p.description = $("#vd").value; p.tags = $("#vg").value.split(",").map(x => x.trim()).filter(Boolean); p.thumbnail_text = $("#vth").value;
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
  function bg(ctx, w, h, hue) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, `hsl(${hue},55%,14%)`); g.addColorStop(1, `hsl(${(hue + 40) % 360},60%,22%)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  function frame(ctx, w, h, kind, s, prog, idx, total, channel) {
    const sc = Math.min(w, h) / 720, F = "'Noto Sans Devanagari','Noto Sans',sans-serif";
    bg(ctx, w, h, 215 + idx * 17);
    ctx.textAlign = "left"; ctx.fillStyle = "#fff";
    const pad = 60 * sc, maxW = w - pad * 2;
    if (kind === "title" || kind === "end") {
      ctx.textAlign = "center";
      ctx.font = `bold ${58 * sc}px ${F}`;
      wrap(ctx, kind === "title" ? s : "धन्यवाद 🙏", w / 2, h * 0.42, maxW, 72 * sc, 4);
      ctx.font = `${30 * sc}px ${F}`; ctx.fillStyle = "#ffd166";
      ctx.fillText(kind === "title" ? (channel || "") : "Like • Subscribe • Share — " + (channel || ""), w / 2, h * 0.78);
    } else {
      ctx.fillStyle = "#ffd166"; ctx.font = `bold ${46 * sc}px ${F}`;
      const hl = wrap(ctx, s.heading || "", pad, pad + 40 * sc, maxW, 56 * sc, 2);
      ctx.fillStyle = "#fff"; ctx.font = `${34 * sc}px ${F}`;
      let y = pad + 40 * sc + hl * 56 * sc + 40 * sc;
      const pts = s.points || [];
      pts.forEach((p, i) => {
        if (prog < i / Math.max(1, pts.length) * 0.8) return; // reveal one by one
        ctx.fillStyle = "#4fd1a5"; ctx.fillText("●", pad, y);
        ctx.fillStyle = "#fff";
        y += wrap(ctx, p, pad + 40 * sc, y, maxW - 40 * sc, 46 * sc, 3) * 46 * sc + 22 * sc;
      });
      ctx.fillStyle = "rgba(255,255,255,.15)"; ctx.fillRect(0, h - 8 * sc, w, 8 * sc);
      ctx.fillStyle = "#ffd166"; ctx.fillRect(0, h - 8 * sc, w * ((idx + prog) / total), 8 * sc);
    }
    if (channel) { ctx.textAlign = "right"; ctx.font = `${22 * sc}px ${F}`; ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.fillText(channel, w - 24 * sc, 40 * sc); }
  }

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
    const x = c.getContext("2d"); bg(x, 1280, 720, 10);
    x.fillStyle = "#ffd166"; x.textAlign = "center"; x.font = "bold 92px 'Noto Sans Devanagari',sans-serif";
    wrap(x, plan.thumbnail_text || plan.title || "", 640, 300, 1150, 110, 3);
    x.fillStyle = "#fff"; x.font = "36px sans-serif"; x.fillText(S.get("vChannel", ""), 640, 660);
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    toast(await saveBlob(blob, "thumbnail-" + ymd() + ".png", "image/png") ? "✅ Thumbnail: Downloads/Sahayak" : "Save nahi hua");
  }

  async function make() {
    if (busy) return;
    if (!IS_APP) { toast("Awaaz wali video phone app mein banti hai"); return; }
    readEdits(); busy = true; window.Native.keepScreenOn(true);
    const prog = $("#vprog"), say = m => { prog.innerHTML = m; };
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const bufs = [];
      for (let i = 0; i < plan.slides.length; i++) {
        say(`🔊 Awaaz ban rahi hai… ${i + 1}/${plan.slides.length}`);
        const r = await nativeCall("speakToFile", plan.slides[i].narration || plan.slides[i].heading || " ", "hi-IN", S.get("voiceRate", 1));
        if (r.error) throw new Error(r.error);
        const bin = atob(r.b64), arr = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
        bufs.push(await ac.decodeAudioData(arr.buffer));
      }
      const w = plan.short ? 720 : W, h = plan.short ? 1280 : H;
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      const dest = ac.createMediaStreamDestination();
      const stream = new MediaStream([...c.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
      const mime = ["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
      if (!mime) throw new Error("Is phone mein video recording nahi chalti");
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2500000 });
      const chunks = []; rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      // timeline: title 2.5s, slides (voice + 0.6s), end 2.5s
      const segs = [{ kind: "title", d: 2.5 }];
      bufs.forEach((b, i) => segs.push({ kind: "slide", i, d: b.duration + 0.6, buf: b }));
      segs.push({ kind: "end", d: 2.5 });
      let t = 0; segs.forEach(s => { s.start = t; t += s.d; }); const total = t;
      const ch = S.get("vChannel", "");
      frame(ctx, w, h, "title", plan.title, 0, 0, 1, ch);
      rec.start(1000);
      const t0 = ac.currentTime + 0.3;
      segs.forEach(s => { if (s.buf) { const src = ac.createBufferSource(); src.buffer = s.buf; src.connect(dest); src.start(t0 + s.start); } });
      await new Promise(done => {
        const iv = setInterval(() => {
          const el = ac.currentTime - t0;
          if (el >= total) { clearInterval(iv); done(); return; }
          const s = segs.find(x => el >= x.start && el < x.start + x.d) || segs[0];
          const p = Math.max(0, Math.min(1, (el - s.start) / s.d));
          if (s.kind === "slide") frame(ctx, w, h, "slide", plan.slides[s.i], p, s.i, plan.slides.length, ch);
          else frame(ctx, w, h, s.kind, plan.title, p, 0, 1, ch);
          say(`🎬 Video ban rahi hai… ${Math.floor(Math.max(0, el))}/${Math.ceil(total)} sec — screen chalu rakho`);
        }, 1000 / 30);
      });
      await new Promise(r => { rec.onstop = r; rec.stop(); });
      const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
      const blob = new Blob(chunks, { type: mime.split(";")[0] });
      say("💾 Save ho raha hai…");
      const name = "video-" + ymd() + "-" + Date.now().toString(36).slice(-4) + "." + ext;
      const ok = await saveBlob(blob, name, mime.split(";")[0]);
      say(ok ? `✅ Video taiyaar: <b>Downloads/Sahayak/${name}</b> (${(blob.size / 1048576).toFixed(1)} MB). YouTube app mein upload karo — title/description upar se copy karo.` : "❌ Save nahi hua");
      ac.close();
    } catch (e) { say("❌ " + (e.message || "Video nahi bani")); }
    busy = false; window.Native.keepScreenOn(false);
  }

  return { render };
})();
