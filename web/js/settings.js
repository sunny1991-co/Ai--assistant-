// Settings: key, voice, look, lock, backup, update.
"use strict";
const Settings = (() => {
  function render() {
    const key = S.get("key", "");
    const m = S.get("models", null);
    const theme = S.get("theme", "auto"), fs = S.get("fs", 16), vl = S.get("voiceLang", "hi-IN");
    $("#view").innerHTML = `<div class="wrap">
      <h2 style="margin:6px 0">⚙️ Settings</h2>

      <div class="card"><h3>🔑 Gemini key (free)</h3>
        ${key ? `<p class="small">✅ Key lagi hui hai: <code>${esc(key.slice(0, 6))}…${esc(key.slice(-4))}</code></p>` : `<ol class="small">
          <li><b>Google AI Studio</b> kholo (button neeche) aur apne Gmail se login karo.</li>
          <li><b>Create API key</b> dabao, phir key copy karo.</li>
          <li>Key yahan neeche paste karke <b>Save</b> dabao.</li></ol>`}
        <div class="row"><button class="btn" id="kopen">🌐 AI Studio kholo</button></div>
        <label class="field">Key paste karo<input id="kin" type="password" autocomplete="off" placeholder="AIza…"></label>
        <div class="row"><button class="btn primary" id="ksave">💾 Save + test</button>${key ? '<button class="btn bad" id="kdel">Key hatao</button>' : ""}</div>
        <div id="kres" class="small"></div>
        <p class="muted small">🔒 Key sirf is ${IS_APP ? "phone" : "browser"} mein rehti hai — kisi ko mat bhejna (Claude ko bhi nahi). Free key ke messages Google apna AI sudhaarne mein use kar sakta hai, isliye password, OTP ya bank ki baat mat likhna.</p>
        <p class="small">📊 Aaj ${G.usageToday()} sawaal poochhe${m ? ` · Model: <code>${esc(m.chat)}</code>` : ""}</p>
      </div>

      <div class="card"><h3>🔊 Awaaz</h3>
        <label class="field">Bolne / sunne ki bhasha<select id="vl">
          <option value="hi-IN" ${vl === "hi-IN" ? "selected" : ""}>हिंदी / Hinglish</option>
          <option value="en-IN" ${vl === "en-IN" ? "selected" : ""}>English (India)</option></select></label>
        <label class="field">Awaaz (Indian)<select id="vv"><option value="">⏳ Dhoondh raha hoon…</option></select></label>
        <div class="row"><button class="btn" id="vtest">▶️ Suno</button></div>
        <p class="muted small" id="vhint"></p>
        <label class="field">Bolne ki speed<select id="vr">${[0.75, 1, 1.25, 1.5].map(r => `<option value="${r}" ${S.get("voiceRate", 1) == r ? "selected" : ""}>${r === 1 ? "Normal" : r < 1 ? "Dheere" : r + "x tez"}</option>`).join("")}</select></label>
      </div>

      <div class="card"><h3>🎯 Jawab mere hisaab se</h3>
        <p class="muted small">Sahayak hamesha isi tareeke se jawab dega.</p>
        ${[["len", "Lambai", [["", "Apne aap"], ["short", "Chhota"], ["detail", "Detail mein"]]],
           ["lang", "Bhasha", [["", "Jaise main likhun"], ["hi", "Hindi"], ["hinglish", "Hinglish"], ["en", "English"]]],
           ["tone", "Andaaz", [["", "Apne aap"], ["simple", "Aasaan bhasha"], ["formal", "Formal / professional"]]],
           ["fmt", "Dikhawat", [["", "Apne aap"], ["points", "Points mein"], ["para", "Paragraph mein"]]]].map(([k, label, opts]) =>
          `<label class="field">${label}<select data-style="${k}">${opts.map(([v, t]) => `<option value="${v}" ${(S.get("style", {})[k] || "") === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>`).join("")}
      </div>

      <div class="card"><h3>🧠 Mere baare mein (memory)</h3>
        <p class="muted small">Chat mein <b>"yaad rakho: …"</b> likhoge to wo bhi yahan jud jayega.</p>
        <p class="muted small">Jo yahan likhoge, Sahayak har jawab mein dhyaan rakhega. Jaise: "Main vakil hoon, Uttar Pradesh mein criminal case dekhta hoon. Jawab Hinglish mein, short points mein do." Password ya OTP yahan mat likhna.</p>
        <label class="field"><textarea id="about" rows="4" placeholder="Apne kaam aur pasand ke baare mein likho…">${esc(S.get("aboutMe", ""))}</textarea></label>
        <button class="btn" id="asave">💾 Save</button>
      </div>

      <div class="card"><h3>🎨 Dikhawat</h3>
        <label class="field">Theme<select id="th">
          <option value="auto" ${theme === "auto" ? "selected" : ""}>Phone jaisa</option>
          <option value="dark" ${theme === "dark" ? "selected" : ""}>🌙 Dark</option>
          <option value="light" ${theme === "light" ? "selected" : ""}>☀️ Light</option></select></label>
        <label class="field">Akshar ka size: <span id="fsv">${fs}</span><input id="fs" type="range" min="13" max="22" value="${fs}"></label>
      </div>

      ${IS_APP ? `<div class="card"><h3>🔒 Fingerprint lock</h3>
        <label class="row"><input type="checkbox" id="lock" ${window.Native.getLock() ? "checked" : ""}> App kholne pe fingerprint / phone lock maange</label>
      </div>` : ""}

      <div class="card"><h3>🩺 Monitor (sirf owner ke liye)</h3>
        <label class="row"><input type="checkbox" id="own" ${S.get("owner", false) ? "checked" : ""}> Court app ki monitoring dikhao</label>
        ${IS_APP ? `<label class="row"><input type="checkbox" id="tlink" ${S.get("tradeLink", false) ? "checked" : ""}> 📈 NSE trading app se jodo <span class="muted small">(band = dono app bilkul alag)</span></label>
        <div id="tlinkbox" ${S.get("tradeLink", false) ? "" : "hidden"}><ol class="small">
          <li>Termux mein trading app wale folder mein chalao: <code>python nse_sahayak_link.py --enable</code></li>
          <li>Jo lamba token dikhe, copy karke yahan paste karo.</li></ol>
        <label class="field">Trading link token<input id="ttok" type="password" autocomplete="off" placeholder="${S.get("tradeToken", "") ? "✅ laga hua hai (badalna ho to naya paste karo)" : "Token paste karo"}"></label>
        <button class="btn" id="tsave">💾 Token save</button></div>` : '<p class="muted small">Laptop pe sirf Court app dikhega. Trading app phone pe hi dikhega.</p>'}
      </div>

      <div class="card"><h3>💾 Backup</h3>
        <p class="muted small">Chats, cases aur settings (key ke bina) ek file mein. Naye phone/laptop mein wapas daal sakte ho.</p>
        <div class="row"><button class="btn" id="bexp">⬇️ Backup file banao</button>
        <button class="btn" id="bimp">⬆️ Backup wapas daalo</button><input type="file" id="bfile" accept=".json,application/json" hidden></div>
      </div>

      <div class="card"><h3>🧹 Data saaf</h3>
        <div class="row"><button class="btn bad" id="cchat">Saari chats hatao</button><button class="btn bad" id="call">Sab kuch hatao</button></div>
      </div>

      <div class="card"><h3>ℹ️ App</h3>
        <p class="small">Sahayak ${IS_APP ? "phone app · version 1." + APP_VERSION : "web (laptop/browser)"}<br>
        Laptop pe kholne ka link: <a href="https://sunny1991-co.github.io/ai--assistant-/" target="_blank" rel="noopener">sunny1991-co.github.io/ai--assistant-</a></p>
        ${IS_APP ? '<button class="btn" id="upd">🔄 Naya version check karo</button><div id="ures" class="small"></div>' : ""}
        <p class="muted small">AI galti kar sakta hai. Kanoon, dawai ya paise ke bade faisle se pehle pakka kar lena.</p>
      </div>
    </div>`;

    $("#kopen").onclick = () => openLink("https://aistudio.google.com/apikey");
    $("#ksave").onclick = async () => {
      // remove spaces, line breaks and quotes that come along when copying
      const v = $("#kin").value.replace(/[\s"'`]/g, "");
      if (!v && !key) { toast("Pehle key paste karo"); return; }
      if (v) { if (!/^[\x21-\x7E]{20,}$/.test(v)) { toast("Key poori copy nahi hui — AI Studio se dobara copy karo"); return; } S.set("key", v); }
      $("#kres").textContent = "⏳ Test ho raha hai…";
      try {
        const mm = await G.test();
        $("#kres").innerHTML = "✅ Key chal rahi hai. Model: <code>" + esc(mm.chat) + "</code>";
        setTimeout(render, 1200);
      } catch (e) { $("#kres").textContent = "❌ " + e.message; }
    };
    const kd = $("#kdel");
    if (kd) kd.onclick = () => { if (!Chat.confirmTwice(kd)) return; S.del("key"); S.del("models"); render(); };
    $("#vl").onchange = e => S.set("voiceLang", e.target.value);
    $$("[data-style]").forEach(sel => sel.onchange = () => { const st = S.get("style", {}); st[sel.dataset.style] = sel.value; S.set("style", st); toast("✅ Ab jawab isi tareeke se"); });
    Voice.list().then(r => {
      const sel = $("#vv"); if (!sel) return;
      sel.innerHTML = `<option value="">Apne aap (sabse achhi Indian)</option>` + r.voices.map(v => `<option value="${esc(v.name)}" ${v.name === r.chosen ? "selected" : ""}>${esc(v.label)}</option>`).join("");
      if (!r.voices.length) $("#vhint").innerHTML = "Phone mein Indian awaaz nahi mili. Phone Settings → <b>Text-to-speech</b> → Google → ⚙️ → <b>Install voice data</b> → <b>Hindi (India)</b> aur <b>English (India)</b> download karo.";
      else $("#vhint").textContent = "Aur achhi awaaz chahiye: phone Settings → Text-to-speech → Google → Install voice data → Hindi (India).";
    }).catch(() => {});
    $("#vv").onchange = e => Voice.choose(e.target.value);
    $("#vtest").onclick = () => Voice.speak(S.get("voiceLang", "hi-IN") === "en-IN" ? "Hello! I am Sahayak, your assistant." : "नमस्ते! मैं सहायक हूँ। आपका case strong lag raha hai.");
    $("#vr").onchange = e => S.set("voiceRate", +e.target.value);
    $("#asave").onclick = () => { S.set("aboutMe", $("#about").value.trim()); toast("✅ Save — ab jawab aapke hisaab se"); };
    $("#th").onchange = e => { S.set("theme", e.target.value); App.applyLook(); };
    $("#fs").oninput = e => { S.set("fs", +e.target.value); $("#fsv").textContent = e.target.value; App.applyLook(); };
    const lk = $("#lock");
    if (lk) lk.onchange = () => { const ok = window.Native.setLock(lk.checked); if (!ok) { lk.checked = false; toast("Phone mein fingerprint ya screen lock set nahi hai"); } else toast(lk.checked ? "🔒 Lock chalu" : "Lock band"); };

    $("#own").onchange = e => { S.set("owner", e.target.checked); App.ownerNav(); toast(e.target.checked ? "🩺 Monitor neeche menu mein aa gaya" : "Monitor band"); };
    const tl = $("#tlink");
    if (tl) tl.onchange = () => { S.set("tradeLink", tl.checked); if (!tl.checked) S.del("tradeToken"); $("#tlinkbox").hidden = !tl.checked; toast(tl.checked ? "Token daal kar save karo" : "🔌 NSE app se alag — Sahayak ab use bilkul nahi chhuega"); };
    const ts = $("#tsave");
    if (ts) ts.onclick = () => { const v = $("#ttok").value.replace(/\s/g, ""); if (v.length < 32) { toast("Token poora paste karo"); return; } S.set("tradeToken", v); S.set("owner", true); App.ownerNav(); toast("✅ Token save — 🩺 Monitor kholo"); render(); };

    $("#bexp").onclick = () => {
      const data = {};
      S.keys().filter(k => !["key", "tradeToken", "models", "searchBad"].includes(k)).forEach(k => { data[k] = S.get(k); });
      saveFile("sahayak-backup-" + ymd() + ".json", "application/json", JSON.stringify({ app: "sahayak", v: 1, at: new Date().toISOString(), data }));
    };
    $("#bimp").onclick = () => $("#bfile").click();
    $("#bfile").onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const j = JSON.parse(r.result);
          if (j.app !== "sahayak" || !j.data) throw new Error("x");
          Object.keys(j.data).forEach(k => { if (k !== "key" && k !== "tradeToken") S.set(k, j.data[k]); });
          toast("✅ Backup wapas aa gaya"); App.go("chat"); location.reload();
        } catch (err) { toast("Ye Sahayak ki backup file nahi hai"); }
      };
      r.readAsText(f);
    };
    $("#cchat").onclick = e => { if (!Chat.confirmTwice(e.target)) return; (S.get("chats", [])).forEach(c => S.del("chat." + c.id)); S.set("chats", []); S.del("cur"); toast("Chats hata di"); location.reload(); };
    $("#call").onclick = e => { if (!Chat.confirmTwice(e.target)) return; S.keys().forEach(k => S.del(k)); if (IS_APP) window.Native.clearAll(); location.reload(); };
    const up = $("#upd");
    if (up) up.onclick = () => App.checkUpdate(true);
  }
  return { render };
})();
