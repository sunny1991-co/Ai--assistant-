// Chat screen: messages, web search, photo/PDF, voice.
"use strict";
const Chat = (() => {
  let cur = null;            // {id, msgs}
  let pending = [];          // attachments waiting to be sent: {name, mime, data, thumb, text}
  let busy = null;           // AbortController while answering
  const memData = {};        // msg id -> attachment data (only for this session)

  const MAX_CTX = 24;

  function system() {
    const d = new Date();
    return [
      "Tum 'Sahayak' ho — ek madadgar, imaandaar AI assistant (Google Gemini pe chalne wala).",
      "User jis bhasha aur lipi mein likhe (Hindi Devanagari, Roman Hinglish, ya English), usi mein jawab do.",
      "Jawab saaf aur kaam ka ho: pehle seedha jawab, phir zaroorat ho to chhote points ya steps. Bekaar lamba mat likho.",
      "Agar pakka pata na ho to saaf bolo — andaaza ko sach bana ke mat batao. Web search ke result mile hon to unhi ke hisaab se jawab do.",
      "Kanoon, dawai ya paise ke maamle mein poori jaankari do, par bolo ki bada faisla lene se pehle vakil/doctor/official source se pakka karein.",
      "Password, OTP, PIN, bank ya trading account ki details kabhi mat maango.",
      "Aaj ki tareekh: " + d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", weekday: "long" }) + ". Desh: Bharat.",
      S.get("aboutMe", "") ? "User ne apne baare mein ye bataya hai (isko dhyaan mein rakh ke jawab do):\n" + S.get("aboutMe", "").slice(0, 3000) : "",
      style(),
    ].filter(Boolean).join("\n");
  }

  // The user's own answer style — this OVERRIDES the default style above.
  const STYLE = {
    len: { short: "Jawab bahut chhota rakho (2-5 line), jab tak user detail na maange.", detail: "Jawab poora aur detail mein do, har point samjhao." },
    lang: { hi: "Hamesha Hindi (Devanagari) mein jawab do.", hinglish: "Hamesha Roman Hinglish mein jawab do (jaise: 'aapka case strong hai').", en: "Always answer in English." },
    tone: { simple: "Bilkul aasaan, bol-chaal ki bhasha — kanooni/technical shabd ho to saath mein matlab likho.", formal: "Professional aur formal bhasha (vakil/office jaisi)." },
    fmt: { points: "Jawab points/steps mein do.", para: "Jawab chhote paragraph mein do, list kam." },
  };
  function style() {
    const st = S.get("style", {}), out = [];
    Object.keys(STYLE).forEach(k => { if (st[k] && STYLE[k][st[k]]) out.push(STYLE[k][st[k]]); });
    return out.length ? "USER KI PASAND (sabse zaroori — upar ke niyam se takraaye to isko maano):\n- " + out.join("\n- ") : "";
  }

  // ---------- storage ----------
  function index() { return S.get("chats", []); }
  function saveCur() {
    if (!cur || !cur.msgs.length) return;
    const clean = cur.msgs.map(m => ({ id: m.id, role: m.role, text: m.text, att: m.att, src: m.src, note: m.note }));
    S.set("chat." + cur.id, { msgs: clean });
    const first = cur.msgs.find(m => m.role === "user");
    const title = (first && (first.text || (first.att && first.att[0] && "📎 " + first.att[0].name))) || "Chat";
    let idx = index().filter(c => c.id !== cur.id);
    idx.unshift({ id: cur.id, title: title.slice(0, 60), updated: Date.now() });
    idx.slice(150).forEach(c => S.del("chat." + c.id));
    S.set("chats", idx.slice(0, 150));
    S.set("cur", cur.id);
  }
  function load(id) {
    const c = S.get("chat." + id, null);
    cur = c ? { id, msgs: c.msgs || [] } : { id: uid(), msgs: [] };
  }
  function newChat() { stopAll(); cur = { id: uid(), msgs: [] }; pending = []; S.del("cur"); render(); }

  // ---------- view ----------
  function render() {
    if (!cur) { const id = S.get("cur", null); if (id) load(id); else cur = { id: uid(), msgs: [] }; }
    const v = $("#view");
    v.innerHTML = `
      <div class="chat">
        <div class="msgs" id="msgs"></div>
        <div class="composer">
          <div class="toggles">
            <button class="tg" data-t="web">🌐 Web search</button>
            <button class="tg" data-t="speak">🔊 Bol ke jawab</button>
            <button class="tg" data-t="convo">🗣️ Baat-cheet</button>
          </div>
          <div class="pend" id="pend"></div>
          <div class="inrow">
            <button class="round" id="attach" aria-label="Photo / PDF">📎</button>
            <input type="file" id="file" accept="image/*,application/pdf,text/plain,.txt,.csv" multiple hidden>
            <textarea id="inp" rows="1" placeholder="Kuch bhi poochho…"></textarea>
            <button class="round" id="mic" aria-label="Bolo">🎤</button>
            <button class="round send" id="send" aria-label="Bhejo">➤</button>
          </div>
        </div>
      </div>`;
    $$(".tg", v).forEach(b => {
      const k = "tg." + b.dataset.t;
      b.classList.toggle("on", !!S.get(k, b.dataset.t === "web"));
      b.onclick = () => {
        const on = !b.classList.contains("on");
        b.classList.toggle("on", on); S.set(k, on);
        if (b.dataset.t === "convo" && on) { $('.tg[data-t="speak"]').classList.add("on"); S.set("tg.speak", true); toast("Baat-cheet: 🎤 dabao aur bolo — jawab sun ke phir bolo"); }
        if (b.dataset.t === "speak" && !on) Voice.stop();
      };
    });
    const inp = $("#inp");
    inp.oninput = () => { inp.style.height = "auto"; inp.style.height = Math.min(140, inp.scrollHeight) + "px"; };
    inp.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && window.innerWidth > 700) { e.preventDefault(); send(); } };
    $("#send").onclick = () => (busy ? stopAll() : send());
    $("#attach").onclick = () => $("#file").click();
    $("#file").onchange = e => { addFiles([...e.target.files]); e.target.value = ""; };
    $("#mic").onclick = micOnce;
    if (!Voice.canListen()) $("#mic").hidden = true;
    drawMsgs(); drawPending();
  }

  function welcome() {
    const noKey = !S.get("key", "");
    const due = Cases.dueSoon();
    return `
      ${noKey ? `<div class="banner">🔑 Shuru karne ke liye ek baar <b>free Gemini key</b> daalni hai. <button class="btn primary" id="go-key">Key daalo</button></div>` : ""}
      ${Monitor.bannerText() ? `<div class="banner" id="go-mon">${esc(Monitor.bannerText())} — <b>dekho</b></div>` : ""}
      ${due.length ? `<div class="banner">📅 ${due.map(c => esc(c.title) + " — " + (daysUntil(c.next) === 0 ? "<b>aaj</b>" : "kal")).join(", ")}</div>` : ""}
      <div class="welcome">
        <div class="big">🤖</div>
        <h2>Namaste! Main Sahayak hoon</h2>
        <p class="muted">Kuch bhi poochho, likhwao, photo bhejo ya 🎤 bol ke poochho.</p>
        <div class="sugg">
          <button data-q="Ek application likho: bank ko address badalne ke liye">✍️ Application likhwao</button>
          <button data-q="Aaj Bharat ki 5 badi khabrein kya hain?" data-web="1">🌐 Aaj ki khabrein</button>
          <button data-q="Bail kitne prakar ki hoti hai? Aasaan bhasha mein samjhao">⚖️ Kanoon samjho</button>
          <button data-photo="1">📷 Photo se sawaal</button>
          <button data-q="Is English ko Hindi mein translate karo: ">🌐 Translate</button>
          <button data-q="5 lakh ka loan 9% byaaj pe 5 saal ke liye — EMI kitni banegi?">🧮 Hisaab</button>
        </div>
      </div>`;
  }

  function msgHtml(m, last) {
    if (m.role === "user") {
      const att = (m.att || []).map(a => a.thumb ? `<img src="${a.thumb}" alt="">` : `<span class="chip">📎 ${esc(a.name)}</span>`).join("");
      return `<div class="msg user" data-id="${m.id}"><div class="b">${att ? `<div class="att">${att}</div>` : ""}${esc(m.text || "")}</div></div>`;
    }
    const src = (m.src || []).length ? `<div class="src">🔗 Sources:${m.src.slice(0, 6).map(s => `<a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join("")}</div>` : "";
    const note = m.note ? `<div class="note">${esc(m.note)}</div>` : "";
    const err = m.err ? `<div class="note">⚠️ ${esc(m.err)}</div>` : "";
    return `<div class="msg model" data-id="${m.id}"><div class="b">${MD.render(m.text)}${err}${note}${src}
      <div class="acts"><button data-a="copy" aria-label="Copy">📋</button><button data-a="speak" aria-label="Suno">🔊</button><button data-a="share" aria-label="Share">📤</button>${last ? '<button data-a="retry" aria-label="Dobara">🔁</button>' : ""}</div></div></div>`;
  }

  function drawMsgs() {
    const box = $("#msgs");
    if (!box) return;
    if (!cur.msgs.length) {
      box.innerHTML = welcome();
      const gk = $("#go-key"); if (gk) gk.onclick = () => App.go("settings");
      const gm = $("#go-mon"); if (gm) gm.onclick = () => App.go("monitor");
      $$(".sugg button", box).forEach(b => b.onclick = () => {
        if (b.dataset.photo) { $("#file").click(); return; }
        if (b.dataset.web) { S.set("tg.web", true); $('.tg[data-t="web"]').classList.add("on"); }
        const inp = $("#inp"); inp.value = b.dataset.q; inp.focus();
        if (!/: $/.test(b.dataset.q)) send();
      });
      return;
    }
    const lastModel = [...cur.msgs].reverse().find(m => m.role === "model");
    box.innerHTML = cur.msgs.map(m => msgHtml(m, m === lastModel)).join("");
    $$(".acts button", box).forEach(b => b.onclick = () => act(b.dataset.a, b.closest(".msg").dataset.id));
    box.scrollTop = box.scrollHeight;
  }

  function act(a, id) {
    const m = cur.msgs.find(x => x.id === id);
    if (!m) return;
    if (a === "copy") copyText(m.text);
    if (a === "share") shareText(m.text);
    if (a === "speak") { if (Voice.isSpeaking()) Voice.stop(); else Voice.speak(m.text); }
    if (a === "retry") {
      const i = cur.msgs.indexOf(m);
      cur.msgs.splice(i, 1);
      answer();
    }
  }

  function drawPending() {
    const p = $("#pend");
    if (!p) return;
    p.innerHTML = pending.map((a, i) => `<span class="chip">${a.thumb ? "🖼️" : "📎"} ${esc(a.name.slice(0, 24))}<button data-i="${i}" aria-label="Hatao">✕</button></span>`).join("");
    $$("button", p).forEach(b => b.onclick = () => { pending.splice(+b.dataset.i, 1); drawPending(); });
  }

  // ---------- attachments ----------
  function readAs(file, how) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result); r.onerror = () => rej(r.error);
      if (how === "text") r.readAsText(file); else r.readAsDataURL(file);
    });
  }
  function shrink(dataUrl, max, q) {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", q));
      };
      img.onerror = () => res(null);
      img.src = dataUrl;
    });
  }
  async function addFiles(files) {
    for (const f of files) {
      try {
        if (/^image\//.test(f.type)) {
          const url = await readAs(f);
          const big = await shrink(url, 1600, 0.85), thumb = await shrink(url, 200, 0.7);
          if (!big) { toast("Ye photo khul nahi rahi"); continue; }
          pending.push({ name: f.name || "photo.jpg", mime: "image/jpeg", data: big.split(",")[1], thumb });
        } else if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
          if (f.size > 15 * 1024 * 1024) { toast("PDF 15 MB se badi hai — chhoti PDF do"); continue; }
          const url = await readAs(f);
          pending.push({ name: f.name, mime: "application/pdf", data: url.split(",")[1] });
        } else if (/^text\//.test(f.type) || /\.(txt|csv)$/i.test(f.name)) {
          const t = await readAs(f, "text");
          pending.push({ name: f.name, mime: "text/plain", text: t.slice(0, 200000) });
        } else toast("Ye file type abhi nahi chalta: " + f.name);
      } catch (e) { toast("File nahi padhi gayi"); }
    }
    drawPending();
  }

  // ---------- sending ----------
  function send(textArg) {
    if (busy) return;
    const inp = $("#inp");
    const text = (textArg != null ? textArg : inp.value).trim();
    if (!text && !pending.length) return;
    const mem = text.match(/^(yaad rakho|yaad rakhna|याद रखो|याद रखना|remember)[\s:,-]+([\s\S]{3,})/i);
    if (mem) {
      const cur0 = S.get("aboutMe", "");
      S.set("aboutMe", (cur0 ? cur0 + "\n" : "") + "- " + mem[2].trim().slice(0, 300));
      toast("🧠 Yaad rakh liya — ⚙️ Settings > Mere baare mein mein dekh/badal sakte ho", 4000);
    }
    const m = { id: uid(), role: "user", text, att: pending.map(a => ({ name: a.name, mime: a.mime, thumb: a.thumb })) };
    if (pending.length) memData[m.id] = pending;
    pending = [];
    cur.msgs.push(m);
    inp.value = ""; inp.style.height = "auto";
    drawPending();
    answer();
  }

  function partsFor(m) {
    const parts = [];
    const data = memData[m.id];
    if (data) data.forEach(a => {
      if (a.text != null) parts.push({ text: "[File: " + a.name + "]\n" + a.text });
      else parts.push({ inline_data: { mime_type: a.mime, data: a.data } });
    });
    else if ((m.att || []).length) parts.push({ text: "[Pehle yahan ye file bheji thi: " + m.att.map(a => a.name).join(", ") + "]" });
    if (m.text) parts.push({ text: m.text });
    if (!parts.length) parts.push({ text: "(khaali)" });
    return parts;
  }

  async function answer() {
    const ctx = cur.msgs.filter(m => !m.err).slice(-MAX_CTX);
    while (ctx.length && ctx[0].role !== "user") ctx.shift();
    const contents = ctx.map(m => ({ role: m.role === "user" ? "user" : "model", parts: m.role === "user" ? partsFor(m) : [{ text: m.text || "…" }] }));
    const reply = { id: uid(), role: "model", text: "" };
    cur.msgs.push(reply);
    drawMsgs();
    const node = $(`.msg[data-id="${reply.id}"] .b`);
    node.innerHTML = '<span class="typing muted">Soch raha hoon</span>';
    busy = new AbortController();
    $("#send").textContent = "⏹";
    let last = 0;
    try {
      const r = await G.ask(contents, {
        system: system(), web: !!S.get("tg.web", true), signal: busy.signal,
        onPart: p => {
          reply.text = p.text;
          const now = Date.now();
          if (now - last > 120 && node.isConnected) { last = now; node.innerHTML = MD.render(p.text) + '<span class="typing"></span>'; $("#msgs").scrollTop = 1e9; }
        },
      });
      reply.text = r.text || "(Khaali jawab mila)";
      reply.src = r.sources; reply.note = r.note;
    } catch (e) {
      if (e.name === "AbortError") { reply.note = "⏹ Roka gaya"; }
      else { reply.err = e.message || "Gadbad hui"; if (!reply.text) reply.text = ""; }
    } finally {
      busy = null;
    }
    const sb = $("#send"); if (sb) sb.textContent = "➤";
    saveCur();
    drawMsgs();
    if (!reply.err && reply.text && S.get("tg.speak", false)) {
      await Voice.speak(reply.text);
      if (S.get("tg.convo", false) && App.view() === "chat") micOnce();
    }
  }

  async function micOnce() {
    const mic = $("#mic");
    if (!mic) return;
    Voice.stop();
    mic.classList.add("live");
    try {
      const t = await Voice.listen();
      mic.classList.remove("live");
      if (t) send(t); else toast("Kuch sunai nahi diya");
    } catch (e) {
      mic.classList.remove("live");
      toast(e.message || "Mic nahi chala");
    }
  }

  function stopAll() { if (busy) busy.abort(); Voice.stop(); }

  // ---------- history sheet ----------
  function history() {
    const idx = index();
    openSheet(`<h3>🗂️ Purani chats</h3>
      ${cur && cur.msgs.length ? '<button class="btn" id="hexp" style="margin-bottom:8px">⬇️ Abhi wali chat save karo</button>' : ""}
      <input class="field" id="hq" placeholder="🔍 Dhoondho" style="width:100%;padding:10px;border-radius:12px;border:1px solid var(--line);background:var(--bg)">
      <div id="hl"></div>
      ${idx.length ? '<button class="btn bad wide" id="hdel" style="margin-top:12px">🗑️ Saari chats hatao</button>' : ""}`, root => {
      const draw = q => {
        const items = idx.filter(c => !q || c.title.toLowerCase().includes(q.toLowerCase()));
        $("#hl", root).innerHTML = items.length ? items.map(c => `<div class="list-item"><span class="t" data-id="${c.id}">💬 ${esc(c.title)}</span><span class="muted small">${new Date(c.updated).toLocaleDateString("en-IN")}</span><button class="icon-btn" data-del="${c.id}" aria-label="Hatao">🗑️</button></div>`).join("") : '<p class="muted">Koi chat nahi</p>';
        $$("[data-id]", root).forEach(e => e.onclick = () => { stopAll(); load(e.dataset.id); S.set("cur", e.dataset.id); closeSheet(); App.go("chat"); render(); });
        $$("[data-del]", root).forEach(e => e.onclick = () => {
          S.del("chat." + e.dataset.del);
          const left = index().filter(c => c.id !== e.dataset.del); S.set("chats", left);
          idx.splice(idx.findIndex(c => c.id === e.dataset.del), 1);
          if (cur && cur.id === e.dataset.del) cur = { id: uid(), msgs: [] };
          draw($("#hq", root).value);
        });
      };
      draw("");
      const he = $("#hexp", root); if (he) he.onclick = () => { closeSheet(); exportCur(); };
      $("#hq", root).oninput = e => draw(e.target.value);
      const hd = $("#hdel", root);
      if (hd) hd.onclick = () => { if (!confirmTwice(hd)) return; index().forEach(c => S.del("chat." + c.id)); S.set("chats", []); S.del("cur"); cur = { id: uid(), msgs: [] }; closeSheet(); App.go("chat"); render(); };
    });
  }

  // first tap shows "pakka?", second tap does it (no browser dialogs)
  function confirmTwice(btn) {
    if (btn.dataset.sure) return true;
    btn.dataset.sure = "1"; btn.textContent = "⚠️ Pakka? Dobara dabao";
    setTimeout(() => { delete btn.dataset.sure; }, 4000);
    return false;
  }

  // open a fresh chat with a ready prompt (tools use this); pickFile opens the file picker first
  function start(prompt, o) {
    o = o || {};
    App.go("chat"); newChat();
    if (o.web != null) { S.set("tg.web", o.web); const b = $('.tg[data-t="web"]'); if (b) b.classList.toggle("on", o.web); }
    const inp = $("#inp"); inp.value = prompt;
    if (o.pickFile) { toast("📎 File/photo chuno, phir ➤ dabao"); $("#file").click(); }
    else if (o.send) send(); else inp.focus();
  }

  function exportCur() {
    if (!cur || !cur.msgs.length) { toast("Abhi chat khaali hai"); return; }
    const t = cur.msgs.map(m => (m.role === "user" ? "👤 Aap" : "🤖 Sahayak") + ":\n" + (m.text || "") + ((m.src || []).length ? "\nSources: " + m.src.map(s => s.uri).join(" ") : "")).join("\n\n---\n\n");
    saveFile("Sahayak-chat-" + ymd() + ".txt", "text/plain", t);
  }

  return { render, newChat, history, stopAll, confirmTwice, addFiles, start, exportCur };
})();
