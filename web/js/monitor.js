// 🩺 Monitor (owner only): trading app on this phone + court app on GitHub.
// Trading: reads health words through the token-gated Sahayak link and can ask
// Kaam-Doctor (its fixed safe playbook) to run. Never places orders.
"use strict";
const Monitor = (() => {
  const TRADING = "http://localhost:8787/sahayak/";
  const COURT = "sunny1991-co/court-judgments-app";
  let last = null;

  const enabled = () => !!S.get("owner", false);

  async function get(url, opts) {
    opts = opts || {};
    if (IS_APP && (url.startsWith("http://localhost") || opts.native)) {
      const r = await nativeCall("http", opts.method || "GET", url, JSON.stringify(opts.headers || {}), opts.body || "");
      return { status: r.status, json: () => JSON.parse(r.text || "{}") };
    }
    try {
      const res = await fetch(url, { method: opts.method || "GET", headers: opts.headers });
      const t = await res.text();
      return { status: res.status, json: () => JSON.parse(t || "{}") };
    } catch (e) {
      if (IS_APP) return get(url, { ...opts, native: true });
      return { status: 0, json: () => ({}) };
    }
  }

  async function trading() {
    if (!IS_APP) return { state: "LAPTOP", text: "Trading app sirf phone pe dekh sakte ho" };
    const tok = S.get("tradeToken", "");
    if (!tok) return { state: "NO_TOKEN", text: "Token nahi laga — ⚙️ Settings > 🩺 Monitor" };
    const r = await get(TRADING + "status", { headers: { "X-Sahayak-Token": tok } });
    if (r.status === 0) return { state: "DOWN", text: "Trading app nahi chal raha (Termux band?)" };
    if (r.status === 404) return { state: "NO_TOKEN", text: "Token galat ya link band — Termux mein --enable dobara chalao" };
    if (r.status !== 200) return { state: "DOWN", text: "Trading app ne error diya (" + r.status + ")" };
    const j = r.json();
    const kd = j.kaam_doctor || {};
    return { state: kd.state || "UNKNOWN", monitoring: j.monitoring, problems: kd.problems || [], stuck: kd.still_stuck || [], checked: kd.checked_at_utc, lastFix: j.last_sahayak_fix_utc };
  }

  async function court() {
    const out = { problems: [], runs: [] };
    const rel = await get("https://api.github.com/repos/" + COURT + "/releases/tags/data-latest");
    if (rel.status === 200) {
      const j = rel.json();
      const assets = j.assets || [];
      const man = assets.find(a => a.name === "manifest.json");
      out.files = assets.length;
      out.dataDate = man ? man.updated_at : null;
      if (!man) out.problems.push("Data ki list (manifest) abhi nahi bani — data upload adhoora");
      else if ((Date.now() - new Date(man.updated_at)) / 86400000 > 9) out.problems.push("Judgments data 9 din se purana");
    } else out.problems.push("Data release nahi mili (" + rel.status + ")");
    for (const wf of ["data.yml", "apk.yml"]) {
      const r = await get("https://api.github.com/repos/" + COURT + "/actions/workflows/" + wf + "/runs?per_page=1");
      if (r.status !== 200) continue;
      const run = (r.json().workflow_runs || [])[0];
      if (!run) continue;
      out.runs.push({ wf, status: run.status, conclusion: run.conclusion, url: run.html_url, at: run.updated_at });
      if (run.status === "completed" && run.conclusion !== "success")
        out.problems.push((wf === "data.yml" ? "Weekly data update" : "APK build") + " fail hua");
    }
    out.state = out.problems.length ? "PROBLEM" : "ALL_OK";
    return out;
  }

  async function check() {
    const [t, c] = await Promise.all([trading().catch(() => ({ state: "DOWN", text: "Check nahi hua" })), court().catch(() => ({ state: "UNKNOWN", problems: ["Internet nahi mila"], runs: [] }))]);
    last = { t, c, at: Date.now() };
    S.set("monitorLast", { t: t.state, c: c.state, at: last.at, n: (t.problems || []).length + (c.problems || []).length });
    return last;
  }

  const ICON = { ALL_OK: "✅", FIXING: "🔧", STUCK: "❌", PROBLEM: "⚠️", DOWN: "⛔", NO_TOKEN: "🔑", LAPTOP: "💻", UNKNOWN: "❔" };
  const WORD = { ALL_OK: "Sab theek", FIXING: "Kaam-Doctor theek kar raha hai", STUCK: "Atka hua — dhyaan do", PROBLEM: "Gadbad", DOWN: "Band", NO_TOKEN: "Juda nahi", LAPTOP: "Phone pe dekho", UNKNOWN: "Pata nahi" };
  const ago = s => { if (!s) return "-"; const m = Math.round((Date.now() - new Date(s)) / 60000); return m < 60 ? m + " min pehle" : m < 2880 ? Math.round(m / 60) + " ghante pehle" : Math.round(m / 1440) + " din pehle"; };

  function draw() {
    const v = $("#mon");
    if (!v) return;
    if (!last) { v.innerHTML = '<p class="muted">⏳ Check ho raha hai…</p>'; return; }
    const { t, c } = last;
    const list = a => (a && a.length ? "<ul>" + a.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul>" : "");
    v.innerHTML = `
      <div class="card"><h3>📈 Trading app (phone)</h3>
        <p style="font-size:1.2em;margin:4px 0">${ICON[t.state] || "❔"} ${WORD[t.state] || esc(t.state)}</p>
        ${t.text ? `<p class="small muted">${esc(t.text)}</p>` : ""}
        ${t.monitoring ? `<p class="small">Worker: ${t.monitoring === "ON" ? "🟢 chal raha hai" : "🔴 band"} · Kaam-Doctor ne check kiya: ${ago(t.checked)}</p>` : ""}
        ${list(t.problems)}
        ${t.stuck && t.stuck.length ? `<p class="small" style="color:var(--bad)">Koshish ke baad bhi atka: ${esc(t.stuck.join("; "))}</p>` : ""}
        ${["ALL_OK", "FIXING", "STUCK", "UNKNOWN"].includes(t.state) ? `<button class="btn primary" id="mfix">🔧 Kaam-Doctor se theek karwao</button>
          <p class="muted small">Sirf Kaam-Doctor ke fixed safe kaam (step dobara chalana, purani files saaf karna). Order kabhi nahi. 10 minute mein ek baar.</p>` : ""}
      </div>
      <div class="card"><h3>⚖️ Court Judgments app (GitHub)</h3>
        <p style="font-size:1.2em;margin:4px 0">${ICON[c.state] || "❔"} ${WORD[c.state] || esc(c.state)}</p>
        <p class="small">Data update: ${c.dataDate ? ago(c.dataDate) : "-"} · Files: ${c.files != null ? c.files : "-"}</p>
        ${list(c.problems)}
        ${(c.runs || []).map(r => `<div class="small">${r.wf === "data.yml" ? "📚 Weekly data" : "📦 APK"}: ${r.status !== "completed" ? "⏳ chal raha hai" : r.conclusion === "success" ? "✅" : "❌ " + esc(r.conclusion)} (${ago(r.at)}) ${r.status === "completed" && r.conclusion !== "success" ? `<button class="btn" data-url="${esc(r.url)}">🔁 GitHub pe Re-run</button>` : ""}</div>`).join("")}
        <p class="muted small">Weekly data khud chalta hai. Fail ho to "Re-run" se GitHub pe dobara chala sakte ho, ya Claude ko bolo.</p>
      </div>
      <div class="row"><button class="btn" id="mre">🔄 Dobara check</button><button class="btn" id="mai">🤖 AI se samjho</button></div>
      <p class="muted small">Aakhri check: ${new Date(last.at).toLocaleTimeString("en-IN")}</p>`;
    const f = $("#mfix");
    if (f) f.onclick = async () => {
      if (!Chat.confirmTwice(f)) return;
      f.disabled = true; f.textContent = "⏳ Shuru ho raha hai…";
      const r = await get(TRADING + "fix", { method: "POST", headers: { "X-Sahayak-Token": S.get("tradeToken", ""), "Content-Type": "application/json" }, body: "{}" });
      const j = r.status === 200 ? r.json() : {};
      toast(j.started ? "🔧 Kaam-Doctor chalu — 2-5 minute baad Dobara check karo" : j.reason === "WAIT" ? "Abhi chala tha — " + Math.ceil(j.wait_seconds / 60) + " min baad" : "Shuru nahi hua (" + r.status + ")", 4000);
      f.disabled = false; f.textContent = "🔧 Kaam-Doctor se theek karwao";
    };
    $$("[data-url]", v).forEach(b => b.onclick = () => openLink(b.dataset.url));
    $("#mre").onclick = () => { last = null; draw(); check().then(draw); };
    $("#mai").onclick = () => {
      const txt = "Mere do apps ka health status hai (JSON). Aasaan Hinglish mein batao kya theek hai, kya gadbad hai aur mujhe kya karna chahiye (chhote steps). Trading orders hamesha band rehte hain.\n\n" + JSON.stringify(last, null, 1).slice(0, 6000);
      App.go("chat"); Chat.newChat();
      setTimeout(() => { const i = $("#inp"); i.value = txt; $("#send").click(); }, 60);
    };
  }

  function render() {
    $("#view").innerHTML = `<div class="wrap"><h2 style="margin:6px 0">🩺 Monitor</h2><div id="mon"></div></div>`;
    draw();
    if (!last || Date.now() - last.at > 60000) check().then(draw);
  }

  // short line for the chat home screen
  function bannerText() {
    const m = S.get("monitorLast", null);
    if (!enabled() || !m || (m.t === "ALL_OK" || m.t === "LAPTOP") && m.c === "ALL_OK") return "";
    return "🩺 Apps mein dhyaan chahiye: trading " + (ICON[m.t] || "") + " · court " + (ICON[m.c] || "");
  }

  return { render, check, enabled, bannerText };
})();
