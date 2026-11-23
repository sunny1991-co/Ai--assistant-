// 🔎 Trend research: what people search (Google + YouTube suggestions), which videos are getting views
// (YouTube API, owner's key), latest news + court/government rules (web search) → AI: problems + video ideas.
// Saves weekly snapshots so new / rising searches can be shown.
"use strict";
const Trends = (() => {
  const SEEDS = {
    cyber: ["cyber fraud", "upi fraud", "online fraud paisa wapas", "cyber crime complaint", "digital arrest", "otp fraud", "loan app fraud"],
    police: ["fir kaise", "police complaint", "giraftari ke niyam", "zero fir"],
    family: ["divorce kaise", "talaak ke baad", "dahej case", "gujara bhatta"],
    property: ["zameen kabza", "property hissa", "kirayedar", "registry kaise"],
    money: ["cheque bounce", "paisa wapas nahi de raha", "consumer complaint", "salary nahi mili"],
  };
  const NAMES = { cyber: "💻 Cyber / online fraud", police: "🚓 Police / FIR", family: "👨‍👩‍👧 Pariwar", property: "🏠 Zameen / property", money: "💰 Paisa / consumer" };
  const MODS = ["", " kya kare", " kaise", " complaint", " hindi"];

  async function getText(url) {
    if (IS_APP) {
      const r = await nativeCall("http", "GET", url, JSON.stringify({ "User-Agent": "Mozilla/5.0 (Android) Sahayak" }), "");
      if (r.status !== 200) throw new Error("" + r.status);
      return r.text;
    }
    const r = await fetch("https://r.jina.ai/" + url, { headers: { "X-Return-Format": "text" } });
    if (!r.ok) throw new Error("" + r.status);
    return r.text();
  }
  async function suggest(q, yt) {
    const url = "https://suggestqueries.google.com/complete/search?client=firefox&hl=hi&gl=in" + (yt ? "&ds=yt" : "") + "&q=" + encodeURIComponent(q);
    try {
      const t = await getText(url);
      const j = JSON.parse(t.slice(t.indexOf("[")));
      return (j[1] || []).map(String);
    } catch (e) { return []; }
  }

  async function research(cat, custom, say) {
    const seeds = custom ? [custom] : SEEDS[cat];
    const count = {}, src = {};
    let done = 0; const jobs = [];
    for (const s of seeds) for (const m of MODS) for (const yt of [true, false]) jobs.push([s + m, yt]);
    for (const [q, yt] of jobs) {
      const list = await suggest(q, yt);
      list.forEach((x, i) => { const k = x.toLowerCase().trim(); count[k] = (count[k] || 0) + (10 - Math.min(9, i)); (src[k] = src[k] || new Set()).add(yt ? "YT" : "G"); });
      say(`🔎 Log kya dhundh rahe hain… ${++done}/${jobs.length}`);
    }
    const top = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([q, sc]) => ({ q, score: sc, where: [...src[q]].join("+") }));
    // popular recent videos (needs the YouTube key from 📊 Mera channel)
    let videos = [];
    const yk = S.get("ytKey", "");
    if (yk && top.length) {
      say("▶️ Pichhle 30 din ki sabse zyada dekhi videos…");
      const after = new Date(Date.now() - 30 * 86400000).toISOString();
      for (const t of top.slice(0, 3)) {
        try {
          const base = "https://www.googleapis.com/youtube/v3/";
          const s1 = await fetchJson(base + "search?part=snippet&type=video&maxResults=8&order=viewCount&regionCode=IN&relevanceLanguage=hi&publishedAfter=" + after + "&q=" + encodeURIComponent(t.q) + "&key=" + yk);
          const ids = (s1.items || []).map(x => x.id.videoId).filter(Boolean);
          if (!ids.length) continue;
          const v = await fetchJson(base + "videos?part=snippet,statistics,contentDetails&id=" + ids.join(",") + "&key=" + yk);
          (v.items || []).forEach(x => videos.push({ q: t.q, title: x.snippet.title, channel: x.snippet.channelTitle, views: +(x.statistics.viewCount || 0), days: Math.max(1, Math.round((Date.now() - new Date(x.snippet.publishedAt)) / 86400000)) }));
        } catch (e) { /* quota / key problem: skip */ }
      }
      videos.sort((a, b) => b.views / b.days - a.views / a.days);
      videos = videos.slice(0, 15);
    }
    // compare with last snapshot of this category
    const key = "trend." + (custom ? "custom:" + custom.toLowerCase() : cat);
    const prev = S.get(key, null);
    const prevSet = new Set(((prev && prev.top) || []).map(x => x.q));
    top.forEach(t => { t.isNew = prev ? !prevSet.has(t.q) : false; });
    const snap = { at: Date.now(), top, videos };
    S.set(key, snap);
    S.set("trendLastRun", Date.now());
    return { snap, prevAt: prev && prev.at };
  }

  async function fetchJson(url) {
    try { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json(); }
    catch (e) { if (!IS_APP) throw e; const r = await nativeCall("http", "GET", url, "{}", ""); if (r.status !== 200) throw new Error(r.status); return JSON.parse(r.text); }
  }

  const num = n => Number(n || 0).toLocaleString("en-IN");

  function render() {
    $("#view").innerHTML = `<div class="wrap"><h2 style="margin:6px 0">🔎 Log kya dhundh rahe hain</h2>
      <div class="card">
        <div class="toggles" style="flex-wrap:wrap">${Object.entries(NAMES).map(([k, n]) => `<button class="tg${k === S.get("trendCat", "cyber") ? " on" : ""}" data-cat="${k}">${n}</button>`).join("")}</div>
        <label class="field">Ya apna vishay<input id="tcustom" placeholder="Jaise: bijli bill, school fees, traffic challan"></label>
        <button class="btn primary wide" id="tgo">🔎 Research karo</button>
        <div id="tmsg" class="small" style="margin-top:6px"></div>
        <p class="muted small">Google/YouTube ke search suggestions (jo log sabse zyada type karte hain) + pichhle 30 din ki sabse zyada dekhi videos${S.get("ytKey", "") ? "" : " (iske liye 📊 Mera channel mein YouTube key lagao)"} + taaza khabrein. Har hafte dobara chalao — naye search "🆕" dikhenge.</p>
      </div>
      <div id="tout"></div></div>`;
    $$("[data-cat]").forEach(b => b.onclick = () => { S.set("trendCat", b.dataset.cat); $$("[data-cat]").forEach(x => x.classList.toggle("on", x === b)); const s = S.get("trend." + b.dataset.cat, null); if (s) draw(s, b.dataset.cat, ""); else $("#tout").innerHTML = ""; });
    $("#tgo").onclick = async () => {
      const cat = S.get("trendCat", "cyber"), custom = $("#tcustom").value.trim();
      $("#tgo").disabled = true;
      try { const r = await research(cat, custom, m => { $("#tmsg").textContent = m; }); $("#tmsg").textContent = "✅ Ho gaya" + (r.prevAt ? " — pichhli research " + new Date(r.prevAt).toLocaleDateString("en-IN") + " se tulna" : ""); draw(r.snap, cat, custom); }
      catch (e) { $("#tmsg").textContent = "❌ " + (e.message || "Research nahi hua"); }
      $("#tgo").disabled = false;
    };
    const s = S.get("trend." + S.get("trendCat", "cyber"), null);
    if (s) draw(s, S.get("trendCat", "cyber"), "");
  }

  function draw(snap, cat, custom) {
    const out = $("#tout"); if (!out) return;
    const label = custom || NAMES[cat];
    out.innerHTML = `
      <div class="card"><h3>🔥 Sabse zyada search (${esc(label)})</h3>
        ${snap.top.length ? snap.top.slice(0, 25).map((t, i) => `<div class="list-item small"><span class="t">${i + 1}. ${t.isNew ? "🆕 " : ""}${esc(t.q)}</span><span class="muted">${t.where}</span><button class="btn" data-vid="${esc(t.q)}">🎬</button></div>`).join("") : "<p class='muted'>Suggestions nahi mile — internet check karo</p>"}
        <p class="muted small">🎬 dabao → us sawaal pe video banao. YT = YouTube pe, G = Google pe search.</p></div>
      ${snap.videos.length ? `<div class="card"><h3>▶️ Ye videos chal rahi hain (30 din)</h3>${snap.videos.map(v => `<div class="list-item small"><span class="t">${esc(v.title)}<br><span class="muted">${esc(v.channel)} · ${v.days} din</span></span><b>${num(v.views)}</b></div>`).join("")}</div>` : ""}
      <div class="card"><button class="btn primary wide" id="tai">🤖 Logon ki samasya + court/sarkar ke niyam + video ideas</button>
        <p class="muted small">Web pe taaza khabrein aur court/sarkar ke pravdhan dhundh ke batayega (links ke saath).</p></div>`;
    $$("[data-vid]").forEach(b => b.onclick = () => { App.go("video"); setTimeout(() => { const q = $("#vq"); if (q) q.value = b.dataset.vid.charAt(0).toUpperCase() + b.dataset.vid.slice(1) + "?"; }, 80); });
    $("#tai").onclick = () => {
      const brief = { vishay: label, top_searches: snap.top.slice(0, 25).map(t => t.q + (t.isNew ? " (naya)" : "")), popular_videos_30d: snap.videos.slice(0, 10).map(v => ({ title: v.title, views: v.views, days: v.days })) };
      Chat.start("[🔎 Trend] Ye log Google/YouTube pe search kar rahe hain (suggestions) aur ye videos chal rahi hain. Web search karke Hinglish mein batao: " +
        "1) logon ki asli samasyaein kya hain (groups mein), 2) is vishay pe court/sarkar ke pravdhan aur savdhaniyan — " + (cat === "cyber" && !custom ? "jaise 1930 helpline, cybercrime.gov.in, RBI ke 'zero liability' niyam, IT Act/BNS ki dharayein, court ke haal ke faisle (sirf jo source mein mile, link ke saath), " : "court ke faisle aur sarkari niyam (sirf jo source mein mile, link ke saath), ") +
        "3) top 10 video ideas — title, Short/lambi, kyun chalegi, 4) kya bilkul nahi karna (galat jaankari, peedit ki pehchaan). Andaaze ko pakki baat mat banao. Kisi nateeje (paisa wapas milna, case jeetna) ki guarantee kabhi mat do — har idea ke saath 'jaankari hai, guarantee nahi' wala nazariya rakho.\n\n" + JSON.stringify(brief), { send: true, web: true });
    };
  }

  // weekly reminder on the chat home
  function due() { const t = S.get("trendLastRun", 0); return t && Date.now() - t > 7 * 86400000; }

  return { render, due };
})();
