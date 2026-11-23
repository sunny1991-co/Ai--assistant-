// Google Gemini API (free tier) — the user's own key, kept only on this device.
"use strict";
const G = (() => {
  const API = "https://generativelanguage.googleapis.com/v1beta/";

  const key = () => S.get("key", "");

  class ApiError extends Error {
    constructor(status, msg, raw) { super(msg); this.status = status; this.raw = raw || ""; }
  }

  function friendly(status, raw) {
    const r = String(raw || "");
    if (status === 0) return "Internet nahi mila — net check karo";
    if (/API_KEY_INVALID|API key not valid/i.test(r)) return "Key galat hai — ⚙️ Settings mein sahi key daalo";
    if (status === 429) return /PerDay|per day|daily/i.test(r) ? "Aaj ki free limit khatam — kal phir chalega (ya doosra model try hoga)" : "Free limit thodi der ke liye poori — 1 minute baad try karo";
    if (status === 403) return "Is key ko ijazat nahi mili — nayi key banao";
    if (status === 404) return "Ye model aapki key pe nahi mila";
    if (status >= 500) return "Google ka server busy hai — thodi der baad try karo";
    if (/SAFETY|blocked/i.test(r)) return "Is sawaal ka jawab Google ne rok diya";
    return "Kuch gadbad hui (" + status + ")";
  }

  // fetch first; if the WebView blocks it (CORS/network), use the phone's native HTTP.
  async function http(method, url, body, signal) {
    const headers = { "Content-Type": "application/json", "x-goog-api-key": key() };
    try {
      const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal });
      return res;
    } catch (e) {
      if (e.name === "AbortError") throw e;
      if (!IS_APP) throw new ApiError(0, friendly(0));
      const r = await nativeCall("http", method, url, JSON.stringify(headers), body ? JSON.stringify(body) : "");
      return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => r.text, body: null, native: true };
    }
  }

  async function json(method, path, body) {
    const res = await http(method, API + path, body);
    const t = await res.text();
    if (!res.ok) throw new ApiError(res.status, friendly(res.status, t), t);
    return JSON.parse(t || "{}");
  }

  // Pick models from what this key can use. Newest normal "flash" for chat, "lite" as backup.
  async function pickModels() {
    let names = [], page = "";
    for (let i = 0; i < 5; i++) {
      const r = await json("GET", "models?pageSize=200" + (page ? "&pageToken=" + page : ""));
      (r.models || []).forEach(m => { if ((m.supportedGenerationMethods || []).includes("generateContent")) names.push(m.name.replace(/^models\//, "")); });
      if (!r.nextPageToken) break;
      page = r.nextPageToken;
    }
    const bad = /(preview|exp|tts|image|live|audio|embed|robotic|thinking|computer|vision|native|learnlm|-\d{3}$)/i;
    const ver = n => { const m = n.match(/^gemini-(\d+(?:\.\d+)?)-flash(-lite)?$/); return m ? parseFloat(m[1]) : -1; };
    const flash = names.filter(n => !bad.test(n) && /^gemini-[\d.]+-flash$/.test(n)).sort((a, b) => ver(b) - ver(a));
    const lite = names.filter(n => !bad.test(n) && /^gemini-[\d.]+-flash-lite$/.test(n)).sort((a, b) => ver(b) - ver(a));
    const chat = flash[0] || (names.includes("gemini-flash-latest") ? "gemini-flash-latest" : lite[0] || names.find(n => /flash/.test(n)) || names[0]);
    const m = {
      chat,
      lite: lite[0] || (names.includes("gemini-flash-lite-latest") ? "gemini-flash-lite-latest" : chat),
      // Google Search grounding is free only on some models: try these in order.
      search: [...new Set(["gemini-2.5-flash", "gemini-2.5-flash-lite", chat, ...flash.slice(1), ...lite].filter(n => names.includes(n)))],
      at: Date.now(),
    };
    S.set("models", m);
    return m;
  }

  async function models() {
    const m = S.get("models", null);
    if (m && m.chat && Date.now() - m.at < 3 * 86400000) return m;
    return pickModels();
  }

  function bumpUsage() {
    const u = S.get("usage", {});
    const d = ymd();
    const n = (u.day === d ? u.n : 0) + 1;
    S.set("usage", { day: d, n });
  }
  function usageToday() { const u = S.get("usage", {}); return u.day === ymd() ? u.n : 0; }

  // Search model that failed today is skipped until tomorrow.
  function searchBlocked(m) { const b = S.get("searchBad", {}); return b[m] === ymd(); }
  function blockSearch(m) { const b = S.get("searchBad", {}); b[m] = ymd(); S.set("searchBad", b); }

  // Less "thinking" = answer starts much sooner. Different model families use different settings.
  function fast(model, body) {
    if (S.get("noFast." + model, false)) return body;
    const gc = { ...(body.generationConfig || {}) };
    if (/^gemini-2\.5-flash/.test(model)) gc.thinkingConfig = { thinkingBudget: 0 };
    else if (/^gemini-([3-9])/.test(model)) gc.thinkingConfig = { thinkingLevel: "low" };
    else return body;
    return { ...body, generationConfig: gc };
  }

  // Read a streamed (SSE) answer; calls onPart({text, sources}) as it grows.
  async function streamOnce(model, body0, signal, onPart) {
    let body = fast(model, body0);
    try { return await streamRaw(model, body, signal, onPart); }
    catch (e) {
      if (body !== body0 && e.status === 400 && /thinking/i.test(e.raw)) { S.set("noFast." + model, true); return streamRaw(model, body0, signal, onPart); }
      throw e;
    }
  }

  async function streamRaw(model, body, signal, onPart) {
    const url = API + "models/" + encodeURIComponent(model) + ":streamGenerateContent?alt=sse";
    const res = await http("POST", url, body, signal);
    if (!res.ok) { const t = await res.text(); throw new ApiError(res.status, friendly(res.status, t), t); }
    let text = "", sources = [], finish = "", midErr = null;
    const take = obj => {
      if (obj.error) { midErr = obj.error; return; } // Google can fail halfway through a stream
      const c = (obj.candidates || [])[0] || {};
      ((c.content || {}).parts || []).forEach(p => { if (p.text && !p.thought) text += p.text; });
      const gm = c.groundingMetadata;
      if (gm && gm.groundingChunks) gm.groundingChunks.forEach(g => { if (g.web && g.web.uri) sources.push({ uri: g.web.uri, title: g.web.title || g.web.uri }); });
      if (c.finishReason) finish = c.finishReason;
      if (obj.promptFeedback && obj.promptFeedback.blockReason) finish = "SAFETY";
      onPart({ text, sources });
    };
    if (res.native || !res.body) {
      const t = await res.text();
      t.split("\n").forEach(line => { if (line.startsWith("data:")) { try { take(JSON.parse(line.slice(5))); } catch (e) { /* skip */ } } });
    } else {
      const rd = res.body.getReader(), dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (line.startsWith("data:")) { try { take(JSON.parse(line.slice(5))); } catch (e) { /* skip */ } }
        }
      }
      const last = buf.trim(); // final event without a trailing newline
      if (last.startsWith("data:")) { try { take(JSON.parse(last.slice(5))); } catch (e) { /* skip */ } }
    }
    const seen = new Set();
    sources = sources.filter(s => !seen.has(s.uri) && seen.add(s.uri));
    if (!text && finish === "SAFETY") throw new ApiError(400, friendly(400, "SAFETY"));
    // Broken stream (error midway, or ended without a finish reason) for a JSON job: let the caller retry / use another model
    const jsonJob = !!((body.generationConfig || {}).responseMimeType);
    if (midErr && (jsonJob || !text)) { const code = +midErr.code || 503; throw new ApiError(code >= 400 ? code : 503, friendly(code >= 400 ? code : 503, JSON.stringify(midErr)), JSON.stringify(midErr)); }
    if (jsonJob && !finish) throw new ApiError(503, friendly(503), "stream ended early");
    return { text, sources, model, finish };
  }

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const busyErr = e => e.status >= 500 || (e.status === 429 && !/PerDay|per day|limit: ?0\b/i.test(e.raw));
  const fatal = e => e.name === "AbortError" || e.status === 0 || e.status === 401 || /API_KEY_INVALID/.test(e.raw);

  // one model: if Google is busy (5xx), wait a moment and try once more
  async function attempt(model, body, opts) {
    try { return await streamOnce(model, body, opts.signal, opts.onPart); }
    catch (e) {
      if (!(e.status >= 500)) throw e;
      if (opts.onStatus) opts.onStatus("⏳ Google busy hai, dobara try kar raha hoon…");
      await wait(1500);
      return streamOnce(model, body, opts.signal, opts.onPart);
    }
  }

  // ---------- Plan B web search (when Gemini's own Google Search is not free for this key) ----------
  // Phone app: fetched directly. Laptop browser: through the r.jina.ai reader (sites block browsers).
  async function getText(url) {
    if (IS_APP) {
      const r = await nativeCall("http", "GET", url, JSON.stringify({ "User-Agent": "Mozilla/5.0 (Linux; Android 14) Sahayak", "Accept-Language": "hi-IN,en-IN;q=0.8" }), "");
      if (r.status !== 200) throw new Error("web " + r.status);
      return r.text;
    }
    const res = await fetch("https://r.jina.ai/" + url, { headers: { "X-Return-Format": "html" } });
    if (!res.ok) throw new Error("web " + res.status);
    return res.text();
  }
  function rssItems(t) {
    const d = new DOMParser().parseFromString(t, "text/xml");
    return [...d.getElementsByTagName("item")].slice(0, 12).map(it => {
      const g = n => (it.getElementsByTagName(n)[0] || {}).textContent || "";
      return { title: g("title"), uri: g("link"), when: g("pubDate"), src: g("source") };
    }).filter(x => x.title);
  }
  function ddgItems(t) {
    const d = new DOMParser().parseFromString(t, "text/html");
    return [...d.querySelectorAll(".result")].slice(0, 8).map(r => {
      const a = r.querySelector("a.result__a"); if (!a) return null;
      let u = a.getAttribute("href") || "";
      const m = u.match(/[?&]uddg=([^&]+)/); if (m) u = decodeURIComponent(m[1]);
      if (u.startsWith("//")) u = "https:" + u;
      const sn = r.querySelector(".result__snippet");
      return { title: a.textContent.trim(), uri: u, snip: sn ? sn.textContent.trim() : "" };
    }).filter(x => x && /^https?:/.test(x.uri) && !/duckduckgo\.com\/y\.js/.test(x.uri));
  }
  async function webContext(q) {
    q = String(q || "").slice(0, 200);
    const newsy = /news|khabar|khabr|samachar|समाचार|खबर|aaj|today|latest|abhi|taaza|ताज़ा|आज/i.test(q);
    let items = [];
    const jobs = [];
    if (newsy) {
      const plain = q.replace(/(aaj|ki|ka|ke|news|khabrein|khabar|batao|bataiye|kya|hai|hain|today|latest|taaza|samachar|आज|की|खबर|खबरें|बताओ|समाचार)/gi, " ").trim();
      const u = plain.length > 2 ? "https://news.google.com/rss/search?q=" + encodeURIComponent(plain + " when:2d") + "&hl=hi&gl=IN&ceid=IN:hi" : "https://news.google.com/rss?hl=hi&gl=IN&ceid=IN:hi";
      jobs.push(getText(u).then(t => { items = items.concat(rssItems(t)); }).catch(() => {}));
    }
    jobs.push(getText("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q) + "&kl=in-en").then(t => { items = items.concat(ddgItems(t)); }).catch(() => {}));
    await Promise.all(jobs);
    if (!items.length) return null;
    const seen = new Set();
    items = items.filter(x => !seen.has(x.uri) && seen.add(x.uri)).slice(0, 14);
    const text = "WEB SE MILE TAAZA RESULT (" + new Date().toLocaleString("en-IN") + "):\n" + items.map((x, i) => `${i + 1}. ${x.title}${x.src ? " — " + x.src : ""}${x.when ? " (" + x.when + ")" : ""}${x.snip ? "\n   " + x.snip : ""}\n   ${x.uri}`).join("\n") +
      "\n\nUpar ke result ke hisaab se jawab do (yahi taaza jaankari hai). Jo baat result mein nahi, use pakka mat batao. Zaroori ho to result number [1], [2] likho.";
    return { text, sources: items.slice(0, 8).map(x => ({ uri: x.uri, title: x.title.slice(0, 90) })) };
  }

  // Real YouTube numbers (owner's own free YouTube key from 📊 Mera channel): what is most watched right now.
  const TREND_Q = /youtube|you tube|trend|viral|popular|chal raha|chal rahi|kya chal|channel|shorts|video|यूट्यूब|ट्रेंड|वायरल|चल रहा|चल रही|चैनल|वीडियो|ग्लोबल|global|videsh|विदेश/i;
  async function ytTrends() {
    const k = S.get("ytKey", ""); if (!k) return null;
    const get = async url => {
      if (IS_APP) { const r = await nativeCall("http", "GET", url, "{}", ""); if (r.status !== 200) throw new Error("yt " + r.status); return JSON.parse(r.text); }
      const r = await fetch(url); if (!r.ok) throw new Error("yt " + r.status); return r.json();
    };
    const lakh = n => (n >= 1e7 ? (n / 1e7).toFixed(1) + " crore" : n >= 1e5 ? (n / 1e5).toFixed(1) + " lakh" : Math.round(n / 1000) + "K");
    const parts = [];
    for (const [rc, label] of [["IN", "Bharat"], ["US", "America"], ["GB", "UK"]]) {
      try {
        const j = await get("https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&maxResults=12&regionCode=" + rc + "&key=" + encodeURIComponent(k));
        parts.push(`${label} mein abhi sabse zyada dekhe ja rahe YouTube videos:\n` + (j.items || []).map((v, i) => `${i + 1}. ${v.snippet.title} — ${v.snippet.channelTitle} — ${lakh(+(v.statistics.viewCount || 0))} views (${String(v.snippet.publishedAt).slice(0, 10)})`).join("\n"));
      } catch (e) { /* skip this country */ }
    }
    return parts.length ? "YOUTUBE KA ASLI TAAZA DATA (" + new Date().toLocaleString("en-IN") + "):\n" + parts.join("\n\n") + "\n\nIs data se pattern nikaalo (kis tarah ke vishay/format chal rahe hain) aur user ke channel ke liye kaam ki salah do." : null;
  }

  // Main call: contents = [{role, parts}], opts = {web, system, signal, onPart, onStatus}
  async function ask(contents, opts) {
    if (!key()) throw new ApiError(401, "Pehle ⚙️ Settings mein apni free Gemini key daalo");
    const m = await models();
    const base = { system_instruction: { parts: [{ text: opts.system }] }, contents,
      generationConfig: { temperature: 0.6, ...(opts.json ? { responseMimeType: "application/json", maxOutputTokens: 16384 } : {}) } };
    bumpUsage();
    let note = "", ytUsed = false;
    if (opts.web && TREND_Q.test(opts.query || "")) { // add real YouTube numbers when the question is about trends/channels
      try {
        if (opts.onStatus) opts.onStatus("🌐 YouTube ka taaza data dekh raha hoon…");
        const yt = await ytTrends();
        if (yt) { const last = contents[contents.length - 1]; contents = contents.slice(0, -1).concat([{ role: last.role, parts: last.parts.concat([{ text: yt }]) }]); base.contents = contents; ytUsed = true; }
      } catch (e) { /* no YouTube data, carry on */ }
    }
    if (opts.web) {
      const ok = S.get("searchOk", "");
      const order = ok && m.search.includes(ok) ? [ok, ...m.search.filter(x => x !== ok)] : m.search;
      if (opts.onStatus) opts.onStatus("🌐 Web pe dhundh raha hoon…");
      for (const sm of order) {
        if (searchBlocked(sm) || S.get("planB", "") === ymd()) continue;
        try {
          const r = await attempt(sm, { ...base, tools: [{ google_search: {} }] }, opts);
          S.set("searchOk", sm);
          return r;
        } catch (e) {
          if (fatal(e)) throw e;
          if (!busyErr(e)) blockSearch(sm); // not allowed on free tier: skip it today. Busy: just try the next one.
        }
      }
      // Plan B: our own search, results given to the model as context
      S.set("planB", ymd());
      if (opts.onStatus) opts.onStatus("🌐 Web pe dhundh raha hoon…");
      let ctx = null;
      try { ctx = await webContext(opts.query); } catch (e) { ctx = null; }
      if (ctx) {
        const last = contents[contents.length - 1];
        contents = contents.slice(0, -1).concat([{ role: last.role, parts: last.parts.concat([{ text: ctx.text }]) }]);
        base.contents = contents;
        opts.planSources = ctx.sources;
      } else note = ytUsed ? "📺 YouTube ka taaza data dekh kar jawab diya" : "🌐 Web search abhi nahi chala — bina search ke jawab diya hai";
    }
    const chain = [...new Set([m.chat, m.lite, ...(m.search || [])])].filter(Boolean);
    let lastErr = null;
    for (let i = 0; i < chain.length; i++) {
      try {
        const r = await attempt(chain[i], base, opts);
        r.note = [note, i ? "Bada model busy tha, doosre model se jawab" : ""].filter(Boolean).join(" · ");
        if (opts.planSources && !(r.sources || []).length) r.sources = opts.planSources;
        return r;
      } catch (e) {
        lastErr = e;
        if (fatal(e)) throw e;
        if (e.status === 404) { S.del("models"); continue; }
        if (!busyErr(e) && e.status !== 429) throw e;
        if (opts.onStatus) opts.onStatus("⏳ Doosre model se try kar raha hoon…");
      }
    }
    throw lastErr || new ApiError(503, friendly(503));
  }

  async function test() {
    S.del("models"); S.del("searchBad"); S.del("planB");
    const m = await pickModels();
    return m;
  }

  return { ask, test, models, usageToday, ApiError };
})();
