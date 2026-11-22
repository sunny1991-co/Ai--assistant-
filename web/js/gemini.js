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
    let text = "", sources = [], finish = "";
    const take = obj => {
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
    }
    const seen = new Set();
    sources = sources.filter(s => !seen.has(s.uri) && seen.add(s.uri));
    if (!text && finish === "SAFETY") throw new ApiError(400, friendly(400, "SAFETY"));
    return { text, sources, model };
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

  // Main call: contents = [{role, parts}], opts = {web, system, signal, onPart, onStatus}
  async function ask(contents, opts) {
    if (!key()) throw new ApiError(401, "Pehle ⚙️ Settings mein apni free Gemini key daalo");
    const m = await models();
    const base = { system_instruction: { parts: [{ text: opts.system }] }, contents, generationConfig: { temperature: 0.6 } };
    bumpUsage();
    let note = "";
    if (opts.web) {
      const ok = S.get("searchOk", "");
      const order = ok && m.search.includes(ok) ? [ok, ...m.search.filter(x => x !== ok)] : m.search;
      if (opts.onStatus) opts.onStatus("🌐 Web pe dhundh raha hoon…");
      for (const sm of order) {
        if (searchBlocked(sm)) continue;
        try {
          const r = await attempt(sm, { ...base, tools: [{ google_search: {} }] }, opts);
          S.set("searchOk", sm);
          return r;
        } catch (e) {
          if (fatal(e)) throw e;
          if (!busyErr(e)) blockSearch(sm); // not allowed on free tier: skip it today. Busy: just try the next one.
        }
      }
      note = "🌐 Web search abhi nahi chala — bina search ke jawab diya hai";
    }
    const chain = [...new Set([m.chat, m.lite, ...(m.search || [])])].filter(Boolean);
    let lastErr = null;
    for (let i = 0; i < chain.length; i++) {
      try {
        const r = await attempt(chain[i], base, opts);
        r.note = [note, i ? "Bada model busy tha, doosre model se jawab" : ""].filter(Boolean).join(" · ");
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
    S.del("models"); S.del("searchBad");
    const m = await pickModels();
    return m;
  }

  return { ask, test, models, usageToday, ApiError };
})();
