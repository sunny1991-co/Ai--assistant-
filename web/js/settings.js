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
    $("#th").onchange = e => { S.set("theme", e.target.value); App.applyLook(); };
    $("#fs").oninput = e => { S.set("fs", +e.target.value); $("#fsv").textContent = e.target.value; App.applyLook(); };
    const lk = $("#lock");
    if (lk) lk.onchange = () => { const ok = window.Native.setLock(lk.checked); if (!ok) { lk.checked = false; toast("Phone mein fingerprint ya screen lock set nahi hai"); } else toast(lk.checked ? "🔒 Lock chalu" : "Lock band"); };

    $("#bexp").onclick = () => {
      const data = {};
      S.keys().filter(k => k !== "key" && k !== "models" && k !== "searchBad").forEach(k => { data[k] = S.get(k); });
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
          Object.keys(j.data).forEach(k => { if (k !== "key") S.set(k, j.data[k]); });
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
