// Screens, look, back button, update check.
"use strict";
const App = (() => {
  const VIEWS = { chat: () => Chat.render(), cases: () => Cases.render(), tools: () => Tools.render(), settings: () => Settings.render(), monitor: () => Monitor.render(), cdr: () => CDR.render(), cctv: () => CCTV.render() , finance: () => Finance.render(), health: () => Health.render(), video: () => Video.render("in"), global: () => Video.render("g"), channel: () => Channel.render(), trends: () => Trends.render() };
  let current = "chat";

  function go(v) {
    if (v === "global-auto") { go("global"); setTimeout(() => Video.autoRun(), 900); return; } // daily notification tapped
    if (!VIEWS[v]) v = "chat";
    if (current === "chat" && v !== "chat") Chat.stopAll();
    current = v;
    $$("#nav a").forEach(a => a.classList.toggle("on", a.dataset.v === v));
    if (location.hash !== "#" + v) history.replaceState(null, "", "#" + v);
    VIEWS[v]();
  }

  function applyLook() {
    const t = S.get("theme", "auto");
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    document.documentElement.style.setProperty("--fs", S.get("fs", 16) + "px");
  }

  async function checkUpdate(manual) {
    if (!IS_APP) return;
    const last = S.get("updChecked", "");
    if (!manual && last === ymd()) return;
    S.set("updChecked", ymd());
    const out = $("#ures");
    try {
      const res = await fetch("https://api.github.com/repos/" + REPO + "/releases/tags/app-latest");
      if (!res.ok) throw new Error(res.status);
      const j = await res.json();
      const m = String(j.body || "").match(/versionCode:\s*(\d+)/);
      const latest = m ? +m[1] : 0;
      const apk = (j.assets || []).find(a => /\.apk$/.test(a.name));
      if (latest > APP_VERSION && apk) {
        const msg = "🆕 Naya version 1." + latest + " aaya hai";
        if (out) out.innerHTML = msg + ' <button class="btn primary" id="getupd">⬇️ Update karo</button>';
        else toast(msg + " — ⚙️ Settings mein Update dabao", 5000);
        const b = $("#getupd"); if (b) b.onclick = () => openLink(apk.browser_download_url);
      } else if (out) out.textContent = "✅ Aap latest version pe ho";
    } catch (e) { if (out) out.textContent = "Check nahi ho paya — internet dekho"; }
  }

  // Android back button: close popup -> go to chat -> leave app
  window.onBack = function () {
    if (!$("#sheet").hidden) { closeSheet(); return true; }
    if (["cdr", "cctv", "finance", "health", "video", "global", "channel", "trends"].includes(current)) { go("tools"); return true; }
    if (current !== "chat") { go("chat"); return true; }
    return false;
  };

  function ownerNav() { $("#nav-mon").hidden = !Monitor.enabled(); }

  function init() {
    applyLook();
    ownerNav();
    if (Monitor.enabled()) Monitor.check().then(() => { if (current === "chat" && !$(".msg")) Chat.render(); }).catch(() => {});
    $$("#nav a").forEach(a => a.onclick = e => { e.preventDefault(); go(a.dataset.v); });
    $("#btn-new").onclick = () => { go("chat"); Chat.newChat(); };
    $("#btn-history").onclick = () => Chat.history();
    window.addEventListener("hashchange", () => { const v = location.hash.slice(1); if (v && v !== current) go(v); });
    go(location.hash.slice(1) || (S.get("vMaking", null) ? "video" : "chat"));
    setTimeout(() => checkUpdate(false), 3000);
  }

  return { go, applyLook, checkUpdate, init, ownerNav, view: () => current };
})();
App.init();
