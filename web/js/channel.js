// 📊 Mera YouTube channel: public stats (YouTube Data API, owner's own free key) → growth,
// best videos, when to post next, AI plan. Read-only: never uploads or changes anything.
"use strict";
const Channel = (() => {
  const API = "https://www.googleapis.com/youtube/v3/";
  const key = () => S.get("ytKey", "");

  async function get(path) {
    const url = API + path + (path.includes("?") ? "&" : "?") + "key=" + encodeURIComponent(key());
    try {
      const r = await fetch(url);
      const j = await r.json();
      if (!r.ok) throw Object.assign(new Error((j.error && j.error.message) || r.status), { status: r.status });
      return j;
    } catch (e) {
      if (!IS_APP || e.status) throw e;
      const r = await nativeCall("http", "GET", url, "{}", "");
      const j = JSON.parse(r.text || "{}");
      if (r.status !== 200) throw new Error((j.error && j.error.message) || "HTTP " + r.status);
      return j;
    }
  }

  async function refresh() {
    const h = S.get("ytHandle", "").trim();
    let q = /^UC[\w-]{20,}$/.test(h) ? "id=" + h : "forHandle=" + encodeURIComponent(h.startsWith("@") ? h : "@" + h);
    const c = await get("channels?part=snippet,statistics,contentDetails&" + q);
    const ch = (c.items || [])[0];
    if (!ch) throw new Error("Channel nahi mila — @handle sahi likho");
    const up = ch.contentDetails.relatedPlaylists.uploads;
    const pl = await get("playlistItems?part=contentDetails&maxResults=50&playlistId=" + up);
    const ids = (pl.items || []).map(x => x.contentDetails.videoId);
    const vids = ids.length ? (await get("videos?part=snippet,statistics,contentDetails&id=" + ids.join(","))).items || [] : [];
    const day = ymd();
    const data = {
      at: Date.now(), title: ch.snippet.title, subs: +(ch.statistics.subscriberCount || 0), views: +(ch.statistics.viewCount || 0), count: +(ch.statistics.videoCount || 0),
      videos: vids.map(v => ({ id: v.id, title: v.snippet.title, pub: v.snippet.publishedAt, views: +(v.statistics.viewCount || 0),
        likes: +(v.statistics.likeCount || 0), comments: +(v.statistics.commentCount || 0), dur: v.contentDetails.duration })),
    };
    const hist = S.get("ytHist", []).filter(x => x.day !== day);
    hist.push({ day, subs: data.subs, views: data.views });
    S.set("ytHist", hist.slice(-120));
    S.set("ytLast", data);
    return data;
  }

  const secs = d => { const m = String(d || "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/) || []; return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0); };
  const ageDays = iso => Math.max(1, (Date.now() - new Date(iso)) / 86400000);
  const num = n => Number(n || 0).toLocaleString("en-IN");

  function render() {
    const d = S.get("ytLast", null), hist = S.get("ytHist", []);
    const setup = !key() || !S.get("ytHandle", "");
    $("#view").innerHTML = `<div class="wrap"><h2 style="margin:6px 0">📊 Mera YouTube channel</h2>
      <div class="card"><h3>⚙️ Jodna (ek baar)</h3>
        ${setup ? `<ol class="small">
          <li><b>console.cloud.google.com</b> kholo (Gmail se login) → upar wahi project chuno jo Gemini key ka hai.</li>
          <li>Search mein <b>"YouTube Data API v3"</b> likho → <b>Enable</b>.</li>
          <li><b>Credentials → Create credentials → API key</b> → copy.</li>
          <li>Neeche paste karo + apna channel <b>@handle</b> likho.</li></ol>
          <button class="btn" id="ytopen">🌐 Google Cloud kholo</button>` : `<p class="small">✅ Juda hua: <b>${esc(S.get("ytHandle", ""))}</b></p>`}
        <label class="field">YouTube API key<input id="ytk" type="password" autocomplete="off" placeholder="${key() ? "✅ laga hua (badalna ho to naya paste karo)" : "AIza…"}"></label>
        <label class="field">Channel @handle<input id="yth" value="${esc(S.get("ytHandle", ""))}" placeholder="@KanoonAasaan"></label>
        <button class="btn primary" id="ytsave">💾 Save + check</button> <span id="ytmsg" class="small"></span>
        <p class="muted small">Sirf public ginti padhta hai (views, likes, subscribers). Channel mein koi badlav ya upload nahi karta. Key sirf is phone mein.</p>
      </div>
      <div id="ytout"></div></div>`;
    const o = $("#ytopen"); if (o) o.onclick = () => openLink("https://console.cloud.google.com/apis/library/youtube.googleapis.com");
    $("#ytsave").onclick = async () => {
      const k = $("#ytk").value.replace(/\s/g, ""); if (k) S.set("ytKey", k);
      S.set("ytHandle", $("#yth").value.trim());
      $("#ytmsg").textContent = "⏳ Check ho raha hai…";
      try { await refresh(); render(); } catch (e) { $("#ytmsg").textContent = "❌ " + e.message; }
    };
    if (d) draw(d, hist);
    if (!setup && (!d || Date.now() - d.at > 3 * 3600000)) refresh().then(x => draw(x, S.get("ytHist", []))).catch(() => {});
  }

  function draw(d, hist) {
    const out = $("#ytout"); if (!out) return;
    const prev = hist.length > 1 ? hist[hist.length - 2] : null;
    const vids = d.videos.map(v => ({ ...v, perDay: v.views / ageDays(v.pub), short: secs(v.dur) <= 61 })).sort((a, b) => new Date(b.pub) - new Date(a.pub));
    const best = vids.slice().sort((a, b) => b.perDay - a.perDay).slice(0, 3);
    const last = vids[0], gap = last ? Math.floor(ageDays(last.pub)) : null;
    const shorts = vids.filter(v => v.short).length, longs = vids.length - shorts;
    const next = !last ? "Pehli video aaj hi daalo 🚀"
      : gap >= 2 ? `⏰ Aakhri video ${gap} din pehle aayi — aaj ek nayi video (ya Short) daalo`
      : "✅ Haal hi mein video aayi — kal ek Short daalo";
    out.innerHTML = `
      <div class="card"><h3>📺 ${esc(d.title)}</h3>
        <div class="grid" style="grid-template-columns:repeat(3,1fr)">
          <div class="tile"><span>👥</span>${num(d.subs)}<small>Subscribers${prev ? ` (${d.subs - prev.subs >= 0 ? "+" : ""}${num(d.subs - prev.subs)})` : ""}</small></div>
          <div class="tile"><span>👁️</span>${num(d.views)}<small>Kul views${prev ? ` (+${num(Math.max(0, d.views - prev.views))})` : ""}</small></div>
          <div class="tile"><span>🎬</span>${num(d.count)}<small>Videos (${shorts} Shorts)</small></div>
        </div>
        <p class="small muted">Monetization ki shart: 1,000 subscribers + 4,000 ghante watch time (12 mahine) ya 1 crore Shorts views (90 din). Abhi: ${Math.min(100, Math.round(d.subs / 10))}% subscribers poore.</p>
      </div>
      <div class="card"><h3>📅 Agli video kab</h3><p><b>${next}</b></p>
        <ul class="small"><li>Shuru mein: <b>Shorts roz ya ek din chhod ke</b>, lambi video <b>hafte mein 1-2</b>.</li>
        <li>Bharat mein aam taur pe <b>shaam 6-9 baje</b> zyada log dekhte hain (aapke channel ka sahi time YouTube Studio → Analytics → "When your viewers are on YouTube" mein dikhta hai).</li>
        <li>Ek hi vishay pe tikke raho — algorithm ko samajh aata hai ki channel kis baare mein hai.</li></ul>
        <button class="btn primary" id="ytai">🤖 Agle 7 din ka plan banao</button>
      </div>
      ${best.length ? `<div class="card"><h3>🏆 Sabse achhi chal rahi (views/din)</h3>${best.map(v => `<div class="list-item small"><span class="t">${v.short ? "📱" : "▶️"} ${esc(v.title)}</span><b>${num(Math.round(v.perDay))}/din</b></div>`).join("")}</div>` : ""}
      <div class="card"><h3>🎬 Saari videos</h3>${vids.map(v => `<div class="list-item small"><span class="t">${v.short ? "📱" : "▶️"} ${esc(v.title)}<br><span class="muted">${Math.floor(ageDays(v.pub))} din pehle · 👍 ${num(v.likes)} · 💬 ${num(v.comments)}</span></span><b>${num(v.views)}</b></div>`).join("") || "<p class='muted'>Abhi koi video nahi</p>"}
        <button class="btn" id="ytre">🔄 Abhi update karo</button><span class="small muted"> Aakhri: ${new Date(d.at).toLocaleString("en-IN")}</span></div>`;
    $("#ytre").onclick = () => { out.innerHTML = '<p class="muted">⏳</p>'; refresh().then(x => draw(x, S.get("ytHist", []))).catch(e => { out.textContent = "❌ " + e.message; }); };
    $("#ytai").onclick = () => {
      const brief = { channel: d.title, subscribers: d.subs, videos: vids.slice(0, 30).map(v => ({ title: v.title, short: v.short, days_ago: Math.floor(ageDays(v.pub)), views: v.views, views_per_day: Math.round(v.perDay), likes: v.likes, comments: v.comments })) };
      Chat.start("[📊 YouTube] Mere channel ka data (public ginti) hai. Hinglish mein, seedhe points mein batao: 1) kaunse vishay/andaaz sabse achha chal raha hai aur kyun, 2) kya nahi chal raha, 3) agle 7 din ka plan — har din: Short ya lambi video, sawaal/vishay, title idea, daalne ka samay (aam taur pe shaam 6-9 baje, data ke hisaab se badlo), 4) title/thumbnail sudhaar ke 3 tips. Kanooni videos mein peedit ka naam aur judge pe ilzaam kabhi nahi. Andaaze ko pakki baat mat banao.\n\n" + JSON.stringify(brief), { send: true, web: false });
    };
  }

  return { render };
})();
