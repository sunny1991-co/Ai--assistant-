// 🎥 CCTV — laptop only. The video is opened and checked INSIDE the browser;
// it is never uploaded. Only the open-source detection models are downloaded once.
// Finds: faces (as separate photos), people (with clothes colour), vehicles — with time.
// It does NOT recognise who a face belongs to; the user compares photos themselves.
"use strict";
const CCTV = (() => {
  const LIB = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
  const MODELS = {
    obj: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite",
    face: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
  };
  const VEH = { car: "🚗 Car", motorcycle: "🏍️ Motorcycle", truck: "🚚 Truck", bus: "🚌 Bus", bicycle: "🚲 Cycle" };
  let det = null, run = null, res = null, videoUrl = null;

  async function load(msg) {
    if (det) return det;
    if (window.__cctvMock) return (det = window.__cctvMock);
    msg("⏳ Pehli baar AI model download ho raha hai (~10 MB)…");
    const v = await import(LIB + "/vision_bundle.mjs");
    const files = await v.FilesetResolver.forVisionTasks(LIB + "/wasm");
    const opt = path => ({ baseOptions: { modelAssetPath: path, delegate: "GPU" }, runningMode: "IMAGE" });
    let obj, face;
    try {
      obj = await v.ObjectDetector.createFromOptions(files, { ...opt(MODELS.obj), scoreThreshold: 0.35, maxResults: 40 });
      face = await v.FaceDetector.createFromOptions(files, { ...opt(MODELS.face), minDetectionConfidence: 0.5 });
    } catch (e) { // no GPU: use CPU
      const cpu = path => ({ baseOptions: { modelAssetPath: path, delegate: "CPU" }, runningMode: "IMAGE" });
      obj = await v.ObjectDetector.createFromOptions(files, { ...cpu(MODELS.obj), scoreThreshold: 0.35, maxResults: 40 });
      face = await v.FaceDetector.createFromOptions(files, { ...cpu(MODELS.face), minDetectionConfidence: 0.5 });
    }
    det = {
      objects: c => obj.detect(c).detections.map(d => ({ label: d.categories[0].categoryName, score: d.categories[0].score, box: d.boundingBox })),
      faces: c => face.detect(c).detections.map(d => ({ score: d.categories[0].score, box: d.boundingBox })),
    };
    return det;
  }

  // ---------- helpers ----------
  const fmt = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? h + ":" : "") + String(m).padStart(2, "0") + ":" + String(x).padStart(2, "0"); };
  const iou = (a, b) => {
    const x1 = Math.max(a.originX, b.originX), y1 = Math.max(a.originY, b.originY);
    const x2 = Math.min(a.originX + a.width, b.originX + b.width), y2 = Math.min(a.originY + a.height, b.originY + b.height);
    const i = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    return i / (a.width * a.height + b.width * b.height - i || 1);
  };
  function crop(src, box, maxSide, pad) {
    pad = pad || 0;
    const x = Math.max(0, box.originX - box.width * pad), y = Math.max(0, box.originY - box.height * pad);
    const w = Math.min(src.width - x, box.width * (1 + 2 * pad)), h = Math.min(src.height - y, box.height * (1 + 2 * pad));
    const s = Math.min(4, maxSide / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    c.getContext("2d").drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
    return c;
  }
  // main clothes colour from the upper body (25%–60% of the person's height)
  function colour(src, box) {
    const c = crop(src, { originX: box.originX + box.width * 0.2, originY: box.originY + box.height * 0.25, width: box.width * 0.6, height: box.height * 0.35 }, 40);
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const votes = {};
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx, s = mx ? (mx - mn) / mx : 0;
      let k;
      if (v < 0.22) k = "kaala";
      else if (s < 0.18) k = v > 0.75 ? "safed" : "grey";
      else {
        let h = mx === mn ? 0 : mx === r ? 60 * (((g - b) / (mx - mn)) % 6) : mx === g ? 60 * ((b - r) / (mx - mn) + 2) : 60 * ((r - g) / (mx - mn) + 4);
        if (h < 0) h += 360;
        k = h < 15 || h >= 340 ? "laal" : h < 40 ? (v < 0.55 ? "bhura" : "orange") : h < 70 ? "peela" : h < 170 ? "hara" : h < 260 ? "neela" : "baingani";
      }
      votes[k] = (votes[k] || 0) + 1;
    }
    return Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
  }
  const COLOR_DOT = { kaala: "#111", safed: "#eee", grey: "#888", laal: "#d22", orange: "#f80", peela: "#ec0", hara: "#2a2", neela: "#25d", baingani: "#82c", bhura: "#753" };

  // ---------- the scan ----------
  async function scan(file, opts, onProgress) {
    const d = await load(onProgress);
    const v = document.createElement("video");
    v.muted = true; v.preload = "auto"; v.src = URL.createObjectURL(file);
    await new Promise((ok, bad) => { v.onloadedmetadata = ok; v.onerror = () => bad(new Error("Ye video browser mein nahi chal rahi — MP4 mein badal ke do (DVR ke Export/Backup se MP4 chuno)")); });
    const W = v.videoWidth, H = v.videoHeight;
    if (!W || !H) throw new Error("Video ka size nahi mila — MP4 mein badal ke do");
    const frame = document.createElement("canvas"); frame.width = W; frame.height = H;
    const fx = frame.getContext("2d", { willReadFrequently: true });
    const start = Math.max(0, opts.from || 0), end = Math.min(v.duration, opts.to || v.duration), step = opts.step;
    const tracks = { person: [], vehicle: [] }, out = { faces: [], people: [], vehicles: [], activity: [], W, H, duration: v.duration, name: file.name };
    let nextId = 1;
    const t0 = Date.now();
    for (let t = start; t <= end; t += step) {
      if (run && run.stop) break;
      v.currentTime = t;
      await new Promise(ok => { const f = () => { v.removeEventListener("seeked", f); ok(); }; v.addEventListener("seeked", f); setTimeout(f, 3000); });
      fx.drawImage(v, 0, 0, W, H);
      const objs = d.objects(frame);
      let ppl = 0, veh = 0;
      for (const o of objs) {
        const isP = o.label === "person", isV = !!VEH[o.label];
        if (!isP && !isV) continue;
        if (o.box.width * o.box.height < 400) continue; // too tiny to be useful
        isP ? ppl++ : veh++;
        const list = isP ? tracks.person : tracks.vehicle;
        let tr = null, best = 0.25;
        for (const x of list) if (t - x.last <= step * 3 + 0.01 && (isP || x.label === o.label)) { const s = iou(x.box, o.box); if (s > best) { best = s; tr = x; } }
        if (!tr) {
          tr = { id: nextId++, label: o.label, first: t, last: t, box: o.box, size: 0 };
          list.push(tr);
          if (isP && opts.people) out.people.push(tr); else if (isV && opts.vehicles) out.vehicles.push(tr);
        }
        tr.last = t; tr.box = o.box;
        const size = o.box.width * o.box.height;
        if (size > tr.size) { // keep the biggest (clearest) picture of each person / vehicle
          tr.size = size;
          tr.img = crop(frame, o.box, isP ? 140 : 180, 0.05).toDataURL("image/jpeg", 0.8);
          tr.at = t;
          if (isP) tr.color = colour(frame, o.box);
        }
        if (isP && opts.faces) {
          const head = { originX: o.box.originX, originY: o.box.originY, width: o.box.width, height: Math.min(o.box.height, o.box.width * 1.3) };
          const hc = crop(frame, head, 256, 0.15);
          const fs = d.faces(hc);
          if (fs.length) {
            const f = fs.sort((a, b) => b.score - a.score)[0];
            const fsz = f.box.width * f.box.height / (hc.width * hc.height) * size;
            if (!tr.face || fsz > tr.faceSize) {
              tr.faceSize = fsz;
              tr.face = { img: crop(hc, f.box, 120, 0.3).toDataURL("image/jpeg", 0.85), at: t, score: f.score, scene: null };
              if (!tr.faceListed) { out.faces.push(tr); tr.faceListed = true; }
              tr.face.scene = crop(frame, { originX: 0, originY: 0, width: W, height: H }, 480).toDataURL("image/jpeg", 0.6);
            }
          }
        }
      }
      if (ppl || veh) out.activity.push({ t, ppl, veh });
      const done = (t - start) / Math.max(1, end - start);
      const el = (Date.now() - t0) / 1000;
      onProgress(`⏳ ${fmt(t)} / ${fmt(end)} · ${Math.round(done * 100)}% · bacha ~${fmt(done > 0.01 ? el / done - el : 0)} · 🙂 ${out.faces.length} · 🚶 ${out.people.length} · 🚗 ${out.vehicles.length}`, done);
    }
    URL.revokeObjectURL(v.src);
    return out;
  }

  // ---------- view ----------
  function render() {
    if (IS_APP) {
      $("#view").innerHTML = `<div class="wrap"><div class="card welcome"><div class="big">💻</div><h3>CCTV laptop pe chalega</h3>
        <p class="small">Laptop ke Chrome/Edge mein kholo: <b>sunny1991-co.github.io/ai--assistant-</b> → 🧰 Tools → 🎥 CCTV</p></div></div>`;
      return;
    }
    $("#view").innerHTML = `<div class="wrap"><h2 style="margin:6px 0">🎥 CCTV — chehre, log, gaadi</h2>
      <div class="card">
        <p class="small">🔒 Video <b>is laptop se bahar nahi jaati</b> — sab kaam browser ke andar hota hai.</p>
        <div class="row"><button class="btn primary" id="vpick">📂 Video chuno</button><span id="vname" class="small muted"></span></div>
        <input type="file" id="vfile" accept="video/*,.mp4,.mov,.mkv,.webm,.avi,.m4v" hidden>
        <div class="row" style="margin-top:8px">
          <label class="small">Har <select id="vstep"><option value="0.5">0.5</option><option value="1" selected>1</option><option value="2">2</option><option value="3">3</option></select> second</label>
          <label class="small">Shuru <input id="vfrom" placeholder="00:00" size="6"></label>
          <label class="small">Tak <input id="vto" placeholder="ant tak" size="6"></label>
        </div>
        <div class="row small" style="margin-top:6px">
          <label><input type="checkbox" id="vf" checked> 🙂 Chehre</label>
          <label><input type="checkbox" id="vp" checked> 🚶 Log</label>
          <label><input type="checkbox" id="vv" checked> 🚗 Gaadi</label>
        </div>
        <div class="row" style="margin-top:8px"><button class="btn primary" id="vgo" disabled>▶️ Shuru karo</button><button class="btn" id="vstop" hidden>⏹ Roko</button></div>
        <div id="vprog" class="small" style="margin-top:6px"></div>
        <div style="height:6px;background:var(--line);border-radius:4px;margin-top:4px"><div id="vbar" style="height:6px;width:0;background:var(--acc);border-radius:4px"></div></div>
        <p class="muted small">Chhota "Har … second" = zyada pakka par zyada der. 3 ghante ki video ~10–30 min le sakti hai. Laptop charging pe rakho.</p>
      </div>
      <video id="vplay" controls style="width:100%;max-height:50vh;border-radius:12px;background:#000;display:none"></video>
      <div id="vres"></div></div>`;
    let file = null;
    const parseT = s => { s = (s || "").trim(); if (!s) return 0; const p = s.split(":").map(Number); return p.reduce((a, x) => a * 60 + (x || 0), 0); };
    $("#vpick").onclick = () => $("#vfile").click();
    $("#vfile").onchange = e => {
      file = e.target.files[0]; if (!file) return;
      $("#vname").textContent = file.name + " · " + (file.size / 1048576).toFixed(0) + " MB";
      $("#vgo").disabled = false;
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      videoUrl = URL.createObjectURL(file);
      const vp = $("#vplay"); vp.src = videoUrl; vp.style.display = "block";
      if (/\.(dav|264|h264|265|h265|asf|dvr|irf)$/i.test(file.name)) $("#vprog").textContent = "⚠️ Ye CCTV ka khaas format hai — shayad browser na chala paye. DVR/NVR ke Backup/Export mein MP4 chuno, ya uske player se MP4 banao.";
    };
    $("#vgo").onclick = async () => {
      if (!file) return;
      run = { stop: false };
      $("#vgo").disabled = true; $("#vstop").hidden = false; $("#vres").innerHTML = "";
      try {
        res = await scan(file, { step: +$("#vstep").value, from: parseT($("#vfrom").value), to: parseT($("#vto").value) || 0, faces: $("#vf").checked, people: $("#vp").checked, vehicles: $("#vv").checked },
          (m, p) => { $("#vprog").textContent = m; if (p != null) $("#vbar").style.width = Math.round(p * 100) + "%"; });
        $("#vprog").textContent = (run.stop ? "⏹ Roka gaya — ab tak ka result:" : "✅ Ho gaya") + ` · 🙂 ${res.faces.length} chehre · 🚶 ${res.people.length} log · 🚗 ${res.vehicles.length} gaadi`;
        $("#vbar").style.width = "100%";
        show("faces");
      } catch (e) { $("#vprog").textContent = "❌ " + (e.message || "Kuch gadbad hui"); }
      $("#vgo").disabled = false; $("#vstop").hidden = true;
    };
    $("#vstop").onclick = () => { if (run) run.stop = true; };
    if (res) show("faces");
  }

  function seek(t) { const vp = $("#vplay"); if (!vp || !vp.src) return; vp.currentTime = t; vp.scrollIntoView({ behavior: "smooth" }); vp.play().catch(() => {}); }

  function show(tab, colorFilter, vehFilter) {
    const r = res, box = $("#vres");
    if (!r || !box) return;
    const counts = {}; r.vehicles.forEach(v => { counts[v.label] = (counts[v.label] || 0) + 1; });
    const colors = {}; r.people.forEach(p => { colors[p.color] = (colors[p.color] || 0) + 1; });
    const tile = (img, t, extra) => `<button class="vt" data-t="${t}"><img src="${img}" alt=""><span>⏱️ ${fmt(t)}${extra || ""}</span></button>`;
    let body = "";
    if (tab === "faces") body = r.faces.length ? r.faces.slice().sort((a, b) => a.face.at - b.face.at).map(p => tile(p.face.img, p.face.at, ` · ${fmt(p.first)}–${fmt(p.last)}`)).join("") : "<p class='muted'>Koi saaf chehra nahi mila. Camera door ho to chehre chhote rehte hain — 🚶 Log wale photo dekho.</p>";
    if (tab === "people") body = r.people.filter(p => !colorFilter || p.color === colorFilter).map(p => tile(p.img, p.at, ` <i class="dot" style="background:${COLOR_DOT[p.color] || "#999"}"></i>${p.color}`)).join("") || "<p class='muted'>Koi nahi mila</p>";
    if (tab === "veh") body = r.vehicles.filter(v => !vehFilter || v.label === vehFilter).map(v => tile(v.img, v.at, " · " + (VEH[v.label] || v.label))).join("") || "<p class='muted'>Koi gaadi nahi mili</p>";
    if (tab === "time") {
      const mins = {}; r.activity.forEach(a => { const k = Math.floor(a.t / 60); mins[k] = mins[k] || { ppl: 0, veh: 0 }; mins[k].ppl = Math.max(mins[k].ppl, a.ppl); mins[k].veh = Math.max(mins[k].veh, a.veh); });
      body = "<div style='width:100%'>" + (Object.keys(mins).map(k => `<div class="list-item small" data-t="${k * 60}" style="cursor:pointer"><span>⏱️ ${fmt(k * 60)}</span><span>🚶 ${mins[k].ppl} · 🚗 ${mins[k].veh}</span></div>`).join("") || "<p class='muted'>Kuch nahi hila</p>") + "</div>";
    }
    box.innerHTML = `<div class="card">
      <div class="toggles" style="flex-wrap:wrap">
        <button class="tg ${tab === "faces" ? "on" : ""}" data-tab="faces">🙂 Chehre ${r.faces.length}</button>
        <button class="tg ${tab === "people" ? "on" : ""}" data-tab="people">🚶 Log ${r.people.length}</button>
        <button class="tg ${tab === "veh" ? "on" : ""}" data-tab="veh">🚗 Gaadi ${r.vehicles.length}</button>
        <button class="tg ${tab === "time" ? "on" : ""}" data-tab="time">⏱️ Time-list</button>
        <button class="tg" id="vrep">⬇️ Report</button>
      </div>
      ${tab === "people" ? `<div class="toggles" style="flex-wrap:wrap">${Object.entries(colors).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<button class="tg ${colorFilter === c ? "on" : ""}" data-col="${c}"><i class="dot" style="background:${COLOR_DOT[c]}"></i>${c} ${n}</button>`).join("")}</div>` : ""}
      ${tab === "veh" ? `<div class="toggles" style="flex-wrap:wrap">${Object.entries(counts).map(([k, n]) => `<button class="tg ${vehFilter === k ? "on" : ""}" data-veh="${k}">${VEH[k] || k}: ${n}</button>`).join("")}</div>` : ""}
      <div class="vgrid">${body}</div>
      <p class="muted small">Ginti andaaza hai (ek hi aadmi/gaadi do baar gin sakti hai). Photo pe click karo — video us time pe chalegi. Pehchaan aap khud karo.</p></div>`;
    $$("[data-tab]", box).forEach(b => b.onclick = () => show(b.dataset.tab));
    $$("[data-col]", box).forEach(b => b.onclick = () => show("people", colorFilter === b.dataset.col ? null : b.dataset.col));
    $$("[data-veh]", box).forEach(b => b.onclick = () => show("veh", null, vehFilter === b.dataset.veh ? null : b.dataset.veh));
    $$("[data-t]", box).forEach(b => b.onclick = () => seek(+b.dataset.t));
    $("#vrep").onclick = report;
  }

  function report() {
    const r = res;
    const sec = (title, items) => `<h2>${title} (${items.length})</h2><div class="g">${items.map(x => `<figure><img src="${x.img}"><figcaption>${x.cap}</figcaption></figure>`).join("")}</div>`;
    const html = `<!doctype html><meta charset="utf-8"><title>CCTV report — ${esc(r.name)}</title>
      <style>body{font-family:system-ui,sans-serif;margin:20px}.g{display:flex;flex-wrap:wrap;gap:10px}figure{margin:0;width:150px;font-size:12px}img{width:150px;border:1px solid #ccc;border-radius:6px}h2{border-bottom:2px solid #333}</style>
      <h1>CCTV report</h1><p>Video: ${esc(r.name)} · lambai ${fmt(r.duration)} · banaya: ${new Date().toLocaleString("en-IN")}</p>
      <p><i>Ye computer se nikali madad ki list hai — ginti andaaza hai, pehchaan insaan ne khud karni hai.</i></p>
      <h2>Chehre (${r.faces.length})</h2><div class="g">${r.faces.map(p => `<figure style="width:auto"><img src="${p.face.img}"> <img src="${p.face.scene}" style="width:300px"><figcaption>⏱ ${fmt(p.face.at)} (dikha ${fmt(p.first)}–${fmt(p.last)})</figcaption></figure>`).join("")}</div>
      ${sec("Log", r.people.map(p => ({ img: p.img, cap: "⏱ " + fmt(p.at) + " · " + p.color })))}
      ${sec("Gaadi", r.vehicles.map(v => ({ img: v.img, cap: "⏱ " + fmt(v.at) + " · " + (VEH[v.label] || v.label).replace(/^\S+\s/, "") })))}`;
    saveFile("CCTV-report-" + ymd() + ".html", "text/html", html);
    toast("Report download hui — browser mein kholke Ctrl+P se PDF bana sakte ho", 5000);
  }

  return { render };
})();
