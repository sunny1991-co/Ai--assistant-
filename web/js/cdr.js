// 📞 CDR Analysis — everything is calculated inside this phone/laptop.
// The file is read in memory only (not saved, not uploaded). Only a masked
// summary goes to the AI, and only when the user taps "AI se samjho".
"use strict";
const CDR = (() => {
  let A = null, B2 = null; // analysed files: main and compare

  // ---------- reading files (.xlsx without any library, .csv) ----------
  async function unzip(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("Ye Excel (.xlsx) file sahi nahi lag rahi");
    const n = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {};
    const dec = new TextDecoder();
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nl)).replace(/^\//, "");
      files[name] = { method, csize, off };
      p += 46 + nl + xl + cl;
    }
    return {
      names: Object.keys(files),
      async text(name) {
        const f = files[name.replace(/^\//, "")];
        if (!f) return null;
        const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
        const raw = u8.subarray(start, start + f.csize);
        if (f.method === 0) return dec.decode(raw);
        if (typeof DecompressionStream === "undefined") throw new Error("Is phone/browser mein Excel kholne ki suvidha nahi — Chrome update karo");
        const ds = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return await new Response(ds).text();
      },
    };
  }

  const xml = s => new DOMParser().parseFromString(s, "application/xml");
  const tags = (node, name) => node.getElementsByTagNameNS("*", name);
  function colIndex(ref) {
    const m = /^([A-Z]+)/.exec(ref || ""); if (!m) return -1;
    let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1;
  }

  async function readXlsx(buf) {
    const z = await unzip(buf);
    const ssText = await z.text("xl/sharedStrings.xml");
    const shared = ssText ? [...tags(xml(ssText), "si")].map(si => [...tags(si, "t")].map(t => t.textContent).join("")) : [];
    // sheets in workbook order
    const wb = xml(await z.text("xl/workbook.xml") || "<x/>");
    const relsDoc = xml(await z.text("xl/_rels/workbook.xml.rels") || "<x/>");
    const rel = {};
    [...tags(relsDoc, "Relationship")].forEach(r => { rel[r.getAttribute("Id")] = r.getAttribute("Target"); });
    let paths = [...tags(wb, "sheet")].map(s => {
      const id = s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || s.getAttribute("r:id");
      let t = rel[id] || ""; t = t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, "");
      return { name: s.getAttribute("name"), path: t };
    }).filter(s => s.path);
    if (!paths.length) paths = z.names.filter(n => /^xl\/worksheets\/[^/]+\.xml$/.test(n)).sort().map(p => ({ name: p, path: p }));
    const sheets = [];
    for (const sh of paths) {
      const t = await z.text(sh.path);
      if (!t) continue;
      const rows = [];
      for (const r of tags(xml(t), "row")) {
        const row = [];
        let i = 0;
        for (const c of tags(r, "c")) {
          const ci = colIndex(c.getAttribute("r")); if (ci >= 0) i = ci;
          const ty = c.getAttribute("t");
          const v = tags(c, "v")[0];
          let val = "";
          if (ty === "s") val = shared[+(v && v.textContent)] || "";
          else if (ty === "inlineStr") val = [...tags(c, "t")].map(x => x.textContent).join("");
          else val = v ? v.textContent : "";
          row[i++] = val;
        }
        rows.push(row);
      }
      sheets.push({ name: sh.name, rows });
    }
    return sheets;
  }

  function readCsv(text) {
    const rows = []; let row = [], cur = "", q = false;
    const sep = (text.split("\n")[0].match(/\t/g) || []).length > (text.split("\n")[0].match(/,/g) || []).length ? "\t" : ",";
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cur); cur = ""; }
      else if (ch === "\n") { row.push(cur.replace(/\r$/, "")); rows.push(row); row = []; cur = ""; }
      else cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return [{ name: "CSV", rows }];
  }

  // ---------- understanding the columns ----------
  const COLS = {
    a: /suspect|target|a[\s_.-]*(party|number|no)\b|calling|^msisdn/i,
    b: /b[\s_.-]*(party|number|no)\b|other[\s_]*(party|number)|called|destination|^b$/i,
    date: /^(call[\s_]*)?(start[\s_]*)?date(\s*time)?$|^date$/i,
    time: /^(call[\s_]*)?(start[\s_]*)?time$/i,
    dur: /^dur|duration|^call[\s_]*dur/i,
    type: /call[\s_]*type|^type$|record[\s_]*type|direction|^service[\s_]*type/i,
    imei: /imei/i, imsi: /imsi/i,
    cell: /^(first[\s_]*)?cell[\s_-]*id$|^cellid$|^cgi|first[\s_]*cgi|^cell[\s_-]*global/i,
    addr: /^(first[\s_]*)?(cell[\s_]*)?(address|site[\s_]*address|location)$|^address/i,
    lat: /^lat/i, lon: /^lon|^lng/i,
  };
  function mapCols(hdr, rows) {
    const m = {};
    for (const [k, re] of Object.entries(COLS)) {
      const cands = hdr.map((h, i) => ({ h: String(h || "").trim(), i })).filter(x => re.test(x.h) && !/second|last|end/i.test(x.h));
      const filled = cands.find(x => rows.slice(0, 50).some(r => String(r[x.i] || "").trim() && !/^(na|-+)$/i.test(String(r[x.i]).trim())));
      if (filled || cands[0]) m[k] = (filled || cands[0]).i;
    }
    return m;
  }
  function pickSheet(sheets) {
    let best = null;
    for (const s of sheets) {
      for (let h = 0; h < Math.min(10, s.rows.length); h++) {
        const hdr = s.rows[h] || [], body = s.rows.slice(h + 1);
        const m = mapCols(hdr, body);
        const score = ("b" in m) * 3 + ("date" in m) * 2 + ("time" in m) + ("type" in m) + ("dur" in m) + body.length / 1e6;
        if (!best || score > best.score) best = { score, sheet: s, h, m };
      }
    }
    if (!best || best.score < 5) throw new Error("Is file mein CDR ke columns (B number, date) nahi mile");
    return best;
  }

  function parseWhen(d, t) {
    d = String(d || "").trim(); t = String(t || "").trim();
    let y, mo, da, hh = 0, mi = 0, ss = 0, m;
    if (/^\d+(\.\d+)?$/.test(d) && +d > 20000 && +d < 80000) { // Excel serial date
      const ms = Math.round((+d - 25569) * 86400000); const x = new Date(ms);
      y = x.getUTCFullYear(); mo = x.getUTCMonth() + 1; da = x.getUTCDate(); hh = x.getUTCHours(); mi = x.getUTCMinutes(); ss = x.getUTCSeconds();
    } else if ((m = d.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) { y = +m[1]; mo = +m[2]; da = +m[3]; }
    else if ((m = d.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) { da = +m[1]; mo = +m[2]; y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; }
    else if ((m = d.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s](\d{2,4})/))) { da = +m[1]; mo = "janfebmaraprmayjunjulaugsepoctnovdec".indexOf(m[2].toLowerCase()) / 3 + 1; y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; }
    else return null;
    const tm = (t || d.replace(/^\S+\s*/, "")).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (tm) { hh = +tm[1]; mi = +tm[2]; ss = +(tm[3] || 0); if (tm[4]) { if (/pm/i.test(tm[4]) && hh < 12) hh += 12; if (/am/i.test(tm[4]) && hh === 12) hh = 0; } }
    else if (/^0?\.\d+$/.test(t)) { const s = Math.round(+t * 86400); hh = Math.floor(s / 3600); mi = Math.floor(s / 60) % 60; ss = s % 60; }
    const x = new Date(y, mo - 1, da, hh, mi, ss);
    return isNaN(x) ? null : x;
  }
  function kind(t) {
    t = String(t || "").toLowerCase();
    const sms = /sms|msg|message/.test(t), inn = /\bin|incoming|\bmt|_in\b|terminat|recei/.test(t), out = /\bout|outgoing|\bmo|_out\b|originat|sent/.test(t);
    if (sms) return inn ? "sms_in" : out ? "sms_out" : "sms";
    if (/call|voice|voc|^in$|^out$|mtc|moc/.test(t) || inn || out) return inn ? "call_in" : out ? "call_out" : "call";
    return "other";
  }
  const clean = v => { const s = String(v == null ? "" : v).trim(); return /^(na|n\/a|-+|null)$/i.test(s) ? "" : s; };
  const normNum = s => { s = clean(s).replace(/[\s-]/g, ""); if (/^\+?\d+$/.test(s)) { s = s.replace(/^\+/, ""); if (s.length === 12 && s.startsWith("91")) s = s.slice(2); if (s.length === 11 && s.startsWith("0")) s = s.slice(1); } return s; };
  const isService = b => /[A-Za-z]/.test(b) || (/^\d+$/.test(b) && b.length < 8);

  // ---------- analysis ----------
  function analyse(sheets, fileName) {
    const { sheet, h, m } = pickSheet(sheets);
    const recs = [];
    let bad = 0;
    for (const r of sheet.rows.slice(h + 1)) {
      if (!r || !r.some(x => clean(x))) continue;
      const when = parseWhen(r[m.date], m.time != null ? r[m.time] : "");
      const b = normNum(r[m.b]);
      if (!when || !b) { bad++; continue; }
      recs.push({
        b, when, hour: when.getHours(), dur: Math.max(0, parseInt(clean(r[m.dur]), 10) || 0),
        rawType: clean(r[m.type]) || "?", k: kind(r[m.type]),
        imei: m.imei != null ? clean(r[m.imei]) : "", imsi: m.imsi != null ? clean(r[m.imsi]) : "",
        cell: m.cell != null ? clean(r[m.cell]) : "", addr: m.addr != null ? clean(r[m.addr]) : "",
        lat: m.lat != null ? clean(r[m.lat]) : "", lon: m.lon != null ? clean(r[m.lon]) : "",
      });
    }
    if (!recs.length) throw new Error("File mein koi sahi line nahi mili");
    recs.sort((x, y) => x.when - y.when);
    const aNums = m.a != null ? [...new Set(sheet.rows.slice(h + 1).map(r => normNum(r && r[m.a])).filter(Boolean))] : [];
    const by = (key, filter) => { const o = new Map(); recs.forEach(r => { if (filter && !filter(r)) return; const k = key(r); if (!k) return; if (!o.has(k)) o.set(k, []); o.get(k).push(r); }); return o; };
    const contacts = [...by(r => r.b, r => !isService(r.b)).entries()].map(([num, rs]) => ({
      num, n: rs.length,
      ci: rs.filter(r => r.k === "call_in").length, co: rs.filter(r => r.k === "call_out").length,
      si: rs.filter(r => r.k === "sms_in").length, so: rs.filter(r => r.k === "sms_out").length,
      calls: rs.filter(r => /^call/.test(r.k)).length, msgs: rs.filter(r => /^sms/.test(r.k)).length,
      dur: rs.reduce((s, r) => s + r.dur, 0), night: rs.filter(r => r.hour >= 23 || r.hour < 5).length,
      first: rs[0].when, last: rs[rs.length - 1].when,
    })).sort((x, y) => y.calls - x.calls || y.n - x.n);
    const services = [...by(r => r.b, r => isService(r.b)).entries()].map(([num, rs]) => ({ num, n: rs.length })).sort((x, y) => y.n - x.n);
    const devices = k => [...by(r => r[k]).entries()].map(([id, rs]) => ({ id, n: rs.length, first: rs[0].when, last: rs[rs.length - 1].when })).sort((x, y) => x.first - y.first);
    const places = [...by(r => r.cell || r.addr).entries()].map(([cell, rs]) => ({
      cell, addr: rs.find(r => r.addr) ? rs.find(r => r.addr).addr : "", lat: (rs.find(r => r.lat) || {}).lat, lon: (rs.find(r => r.lon) || {}).lon,
      n: rs.length, night: rs.filter(r => r.hour >= 23 || r.hour < 5).length, first: rs[0].when, last: rs[rs.length - 1].when,
    })).sort((x, y) => y.n - x.n);
    const hours = Array(24).fill(0); recs.forEach(r => hours[r.hour]++);
    const week = Array(7).fill(0); recs.forEach(r => week[r.when.getDay()]++);
    const types = {}; recs.forEach(r => { types[r.rawType] = (types[r.rawType] || 0) + 1; });
    return {
      fileName, sheet: sheet.name, cols: m, recs, bad, aNums, contacts, services, imei: devices("imei"), imsi: devices("imsi"), places, hours, week, types,
      from: recs[0].when, to: recs[recs.length - 1].when,
      calls: recs.filter(r => /^call/.test(r.k)).length, sms: recs.filter(r => /^sms/.test(r.k)).length,
      talk: recs.filter(r => /^call/.test(r.k)).reduce((s, r) => s + r.dur, 0),
    };
  }

  // ---------- view ----------
  const dt = d => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const dtt = d => dt(d) + " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const mins = s => (s >= 3600 ? Math.floor(s / 3600) + " ghanta " : "") + Math.round((s % 3600) / 60) + " min";
  const mask = n => (/^\d{6,}$/.test(n) ? n.slice(0, 2) + "XXXXXX" + n.slice(-2) : n.replace(/\d(?=\d{2})/g, "X"));
  const WD = ["Ravi", "Som", "Mangal", "Budh", "Guru", "Shukra", "Shani"];

  function bars(arr, labels) {
    const max = Math.max(1, ...arr);
    return `<div style="display:flex;align-items:flex-end;gap:2px;height:90px">${arr.map((v, i) => `<div title="${labels[i]}: ${v}" style="flex:1;background:var(--acc);opacity:${i >= 23 || i < 5 ? 1 : .6};height:${Math.max(2, v / max * 100)}%;border-radius:3px 3px 0 0"></div>`).join("")}</div>
      <div style="display:flex;gap:2px;font-size:9px;color:var(--muted)">${labels.map(l => `<div style="flex:1;text-align:center">${l}</div>`).join("")}</div>`;
  }

  function render() {
    $("#view").innerHTML = `<div class="wrap"><h2 style="margin:6px 0">📞 CDR Analysis</h2>
      <div class="card">
        <p class="small">Excel (.xlsx) ya CSV CDR file chuno. Saara hisaab <b>isi ${IS_APP ? "phone" : "laptop"} ke andar</b> hota hai — file kahin upload ya save nahi hoti.</p>
        <div class="row"><button class="btn primary" id="cf1">📂 CDR file chuno</button>${A ? '<button class="btn" id="cf2">➕ Doosri CDR (milao)</button><button class="btn" id="cclr">✕ Band</button>' : ""}</div>
        <input type="file" id="cfile" accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden>
        <div id="cmsg" class="small"></div>
      </div>
      <div id="cout"></div></div>`;
    let which = 1;
    $("#cf1").onclick = () => { which = 1; $("#cfile").click(); };
    const f2 = $("#cf2"); if (f2) f2.onclick = () => { which = 2; $("#cfile").click(); };
    const cl = $("#cclr"); if (cl) cl.onclick = () => { A = B2 = null; render(); };
    $("#cfile").onchange = async e => {
      const f = e.target.files[0]; e.target.value = ""; if (!f) return;
      $("#cmsg").textContent = "⏳ Padh raha hoon… (badi file mein thoda time lagega)";
      try {
        const buf = await f.arrayBuffer();
        const sheets = /\.xlsx$/i.test(f.name) || new Uint8Array(buf, 0, 2).join() === "80,75" ? await readXlsx(buf) : readCsv(new TextDecoder().decode(buf));
        const res = analyse(sheets, f.name);
        if (which === 1) { A = res; B2 = null; } else B2 = res;
        render();
      } catch (err) { $("#cmsg").textContent = "❌ " + (err.message || "File nahi padh paya"); }
    };
    if (A) draw();
  }

  function draw() {
    const a = A, out = $("#cout");
    const kn = { ci: "📥 Call aaye", co: "📤 Call kiye", si: "📩 SMS aaye", so: "✉️ SMS bheje" };
    const contactRows = a.contacts.slice(0, 40).map((c, i) => `<tr data-num="${esc(c.num)}"><td>${i + 1}</td><td><b>${esc(c.num)}</b></td><td>${c.calls}</td><td>${c.msgs}</td><td>${mins(c.dur)}</td><td>${c.night || ""}</td><td class="small">${dt(c.first)} – ${dt(c.last)}</td></tr>`).join("");
    const common = B2 ? a.contacts.map(c => ({ c, d: B2.contacts.find(x => x.num === c.num) })).filter(x => x.d) : null;
    out.innerHTML = `
      <div class="card"><h3>📋 Saar (summary)</h3>
        <div class="small">📄 ${esc(a.fileName)} · sheet "${esc(a.sheet)}"${a.bad ? ` · ${a.bad} adhoori line chhodi` : ""}</div>
        <p>👤 Number: <b>${esc(a.aNums.join(", ") || "-")}</b><br>
        📅 ${dt(a.from)} se ${dt(a.to)} (${Math.round((a.to - a.from) / 86400000) + 1} din)<br>
        📞 Calls: <b>${a.calls}</b> (baat ${mins(a.talk)}) · 💬 SMS: <b>${a.sms}</b> · Kul lines: ${a.recs.length}<br>
        👥 Alag-alag number: <b>${a.contacts.length}</b> · 🏢 Company/service SMS: ${a.services.reduce((s, x) => s + x.n, 0)}<br>
        📱 IMEI (phone): <b>${a.imei.filter(x => x.id).length}</b> · 💳 IMSI (SIM): <b>${a.imsi.filter(x => x.id).length}</b> · 📍 Tower: <b>${a.places.length}</b></p>
        <div class="small muted">${Object.entries(a.types).map(([k, v]) => esc(k) + ": " + v).join(" · ")}</div>
        <div class="row" style="margin-top:8px"><button class="btn" id="cai">🤖 AI se samjho</button><button class="btn" id="cexp">⬇️ Report (Excel/CSV)</button></div>
        <p class="muted small">AI ko sirf ginti jaati hai, aur number chhupe hote hain (jaise 98XXXXXX21). Address nahi jaata.</p>
      </div>
      ${common ? `<div class="card"><h3>🔗 Dono CDR mein common number (${common.length})</h3><div class="small">📄 ${esc(B2.fileName)} (${esc(B2.aNums.join(", "))})</div>
        ${common.length ? `<table class="tbl"><tr><th>Number</th><th>File 1 (calls/SMS)</th><th>File 2 (calls/SMS)</th></tr>${common.map(x => `<tr><td><b>${esc(x.c.num)}</b></td><td>${x.c.calls} / ${x.c.msgs}</td><td>${x.d.calls} / ${x.d.msgs}</td></tr>`).join("")}</table>` : "<p>Koi common number nahi mila.</p>"}
        ${B2.aNums.some(n => a.contacts.find(c => c.num === n)) || a.aNums.some(n => B2.contacts.find(c => c.num === n)) ? '<p class="small">⚡ Dono number ne <b>aapas mein seedhe</b> baat ki hai.</p>' : ""}</div>` : ""}
      <div class="card"><h3>👥 Top contacts</h3><p class="muted small">Number pe tap karo — uski poori timeline.</p>
        <div style="overflow:auto"><table class="tbl"><tr><th>#</th><th>Number</th><th>Calls</th><th>SMS</th><th>Baat</th><th>🌙</th><th>Pehli – aakhri</th></tr>${contactRows}</table></div>
        ${a.contacts.length > 40 ? `<p class="small muted">Pehle 40 dikhaye — poori list Report mein.</p>` : ""}</div>
      <div class="card"><h3>🌙 Raat ki baat (11 PM – 5 AM)</h3>
        ${a.contacts.filter(c => c.night).sort((x, y) => y.night - x.night).slice(0, 15).map(c => `<div class="list-item" data-num="${esc(c.num)}"><span class="t">${esc(c.num)}</span><span class="badge">${c.night}</span></div>`).join("") || "<p class='muted'>Raat mein koi call/SMS nahi.</p>"}</div>
      <div class="card"><h3>🕐 Kis time sabse zyada</h3>${bars(a.hours, a.hours.map((_, i) => i % 3 === 0 ? i : ""))}
        <h3 style="margin-top:12px">📆 Kis din</h3>${bars(a.week, WD)}</div>
      <div class="card"><h3>📍 Tower / location (${a.places.length})</h3>
        ${a.places.slice(0, 25).map(p => `<div class="list-item"><span class="t small" style="white-space:normal">${esc(p.addr || p.cell)}<br><span class="muted">${esc(p.cell)} · ${p.n} baar${p.night ? " · 🌙 " + p.night : ""} · ${dt(p.first)} – ${dt(p.last)}</span></span>${p.lat && p.lon ? `<button class="btn" data-map="${esc(p.lat)},${esc(p.lon)}">🗺️</button>` : ""}</div>`).join("")}
        <p class="muted small">🗺️ dabane se Google Maps khulega (sirf us tower ki location jaati hai).</p></div>
      <div class="card"><h3>📱 Phone (IMEI) aur 💳 SIM (IMSI)</h3>
        ${a.imei.filter(x => x.id).map(x => `<div class="small">📱 ${esc(x.id)} — ${x.n} baar · ${dtt(x.first)} se ${dtt(x.last)}</div>`).join("") || "<p class='muted small'>IMEI column nahi mila</p>"}
        ${a.imei.filter(x => x.id).length > 1 ? '<p class="small" style="color:var(--warn)">⚠️ Is beech phone (handset) badla gaya hai.</p>' : ""}
        ${a.imsi.filter(x => x.id).map(x => `<div class="small">💳 ${esc(x.id)} — ${x.n} baar · ${dtt(x.first)} se ${dtt(x.last)}</div>`).join("")}
        ${a.imsi.filter(x => x.id).length > 1 ? '<p class="small" style="color:var(--warn)">⚠️ Is beech SIM badli gayi hai.</p>' : ""}</div>
      <div class="card"><h3>🏢 Company / service SMS</h3><div class="small">${a.services.slice(0, 20).map(s => esc(s.num) + " (" + s.n + ")").join(" · ") || "-"}</div></div>
      <p class="muted small">Ye hisaab madad ke liye hai. Court mein use karne se pehle asli CDR se milaan zaroor karein.</p>`;
    $$("[data-num]", out).forEach(e => e.onclick = () => timeline(e.dataset.num));
    $$("[data-map]", out).forEach(e => e.onclick = () => openLink("https://www.google.com/maps?q=" + encodeURIComponent(e.dataset.map)));
    $("#cexp").onclick = exportCsv;
    $("#cai").onclick = askAi;
  }

  function timeline(num) {
    const rs = A.recs.filter(r => r.b === num);
    const label = { call_in: "📥 Call aaya", call_out: "📤 Call kiya", sms_in: "📩 SMS aaya", sms_out: "✉️ SMS bheja", call: "📞 Call", sms: "💬 SMS", other: "•" };
    openSheet(`<h3>🕘 ${esc(num)} — ${rs.length} baar</h3>
      <div class="row"><button class="btn" id="tcp">📋 Number copy</button><button class="btn" id="tx">Band karo</button></div>
      <div style="max-height:60vh;overflow:auto;margin-top:8px">${rs.map(r => `<div class="list-item small"><span>${dtt(r.when)}</span><span>${label[r.k] || esc(r.rawType)}${r.dur ? " · " + r.dur + "s" : ""}</span><span class="muted" style="max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.addr || r.cell)}</span></div>`).join("")}</div>`, root => {
      $("#tx", root).onclick = closeSheet;
      $("#tcp", root).onclick = () => copyText(num);
    });
  }

  function csvCell(v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function exportCsv() {
    const a = A, L = [];
    L.push(["CDR report", a.fileName, "Number", a.aNums.join(" "), "From", dt(a.from), "To", dt(a.to)].map(csvCell).join(","));
    L.push("");
    L.push(["#", "B Number", "Calls aaye", "Calls kiye", "SMS aaye", "SMS bheje", "Baat (sec)", "Raat (11PM-5AM)", "Pehli", "Aakhri"].join(","));
    a.contacts.forEach((c, i) => L.push([i + 1, c.num, c.ci, c.co, c.si, c.so, c.dur, c.night, dtt(c.first), dtt(c.last)].map(csvCell).join(",")));
    L.push(""); L.push(["Tower / Cell ID", "Address", "Lat", "Long", "Kitni baar", "Raat", "Pehli", "Aakhri"].join(","));
    a.places.forEach(p => L.push([p.cell, p.addr, p.lat, p.lon, p.n, p.night, dtt(p.first), dtt(p.last)].map(csvCell).join(",")));
    L.push(""); L.push(["IMEI", "Kitni baar", "Pehli", "Aakhri"].join(","));
    a.imei.filter(x => x.id).forEach(x => L.push([x.id, x.n, dtt(x.first), dtt(x.last)].map(csvCell).join(",")));
    saveFile("CDR-report-" + (a.aNums[0] || "file") + "-" + ymd() + ".csv", "text/csv", "﻿" + L.join("\n"));
  }

  function askAi() {
    const a = A;
    const s = {
      din: Math.round((a.to - a.from) / 86400000) + 1, calls: a.calls, sms: a.sms, baat_minute: Math.round(a.talk / 60),
      alag_number: a.contacts.length, imei_count: a.imei.filter(x => x.id).length, imsi_count: a.imsi.filter(x => x.id).length, tower_count: a.places.length,
      top_contacts: a.contacts.slice(0, 10).map(c => ({ number: mask(c.num), calls: c.calls, sms: c.msgs, baat_min: Math.round(c.dur / 60), raat: c.night })),
      ghante_ke_hisaab_se: a.hours, hafte_ke_din: Object.fromEntries(WD.map((d, i) => [d, a.week[i]])),
      raat_wale_number: a.contacts.filter(c => c.night).length,
      common_with_second_cdr: B2 ? a.contacts.filter(c => B2.contacts.find(x => x.num === c.num)).length : undefined,
    };
    const txt = "Ek court case ki CDR ka summary hai (number chhupaye hue hain, sirf ginti). Ek vakil ki nazar se aasaan Hinglish mein batao: is pattern mein kya khaas dikhta hai, kin baaton pe dhyaan dena chahiye, aur aage kya check karna chahiye. Andaaza ko pakki baat mat banana.\n\n" + JSON.stringify(s);
    App.go("chat"); Chat.newChat();
    setTimeout(() => { const i = $("#inp"); i.value = txt; S.set("tg.web", false); $("#send").click(); }, 60);
  }

  return { render, _test: { readXlsx, readCsv, analyse, parseWhen, kind, normNum } };
})();
