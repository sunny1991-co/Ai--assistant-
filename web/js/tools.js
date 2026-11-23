// Tools: calculators and shortcuts. CDR and CCTV come as their own parts later.
"use strict";
const Tools = (() => {
  const inr = n => "₹" + Math.round(n).toLocaleString("en-IN");

  const TOOLS = [
    { k: "video", i: "🎬", t: "Video banao", s: "YouTube ke liye, Indian awaaz" },
    { k: "global", i: "🌍", t: "Global channel", s: "English cartoon, videshi darshak" },
    { k: "channel", i: "📊", t: "Mera channel", s: "Views, subscribers, agli video kab" },
    { k: "trends", i: "🔎", t: "Log kya dhundh rahe", s: "Search trend, samasya, video idea" },
    { k: "health", i: "❤️", t: "Health", s: "Report, khana, drink ke saath" },
    { k: "finance", i: "💼", t: "Finance Guide", s: "Mere funds + goal ki salah" },
    { k: "draft", i: "✍️", t: "Drafting", s: "Notice, application, RTI…" },
    { k: "doc", i: "📄", t: "Document saar", s: "PDF/photo ke mukhya point" },
    { k: "ocr", i: "🔤", t: "Photo se text", s: "Likha hua text nikalo" },
    { k: "emi", i: "🏦", t: "EMI", s: "Loan ki kisht" },
    { k: "int", i: "💰", t: "Byaaj", s: "Simple / compound" },
    { k: "pct", i: "％", t: "Percent", s: "Kitna % / % ka kitna" },
    { k: "days", i: "📆", t: "Din gino", s: "Do tareekh ke beech / din jodo" },
    { k: "court", i: "⚖️", t: "Judgments", s: "Court Judgments app" },
    { k: "cdr", i: "📞", t: "CDR Analysis", s: "Excel/CSV se" },
    { k: "cctv", i: "🎥", t: "CCTV", s: IS_APP ? "Sirf laptop pe" : "Chehre, log, gaadi", off: IS_APP },
  ];

  function render() {
    $("#view").innerHTML = `<div class="wrap"><h2 style="margin:6px 0">🧰 Tools</h2>
      <div class="grid">${TOOLS.map(t => `<button class="tile${t.off ? " off" : ""}" data-k="${t.k}"><span>${t.i}</span>${t.t}<small>${t.s}</small></button>`).join("")}</div>
      <div id="tool"></div></div>`;
    $$(".tile").forEach(b => b.onclick = () => open(b.dataset.k));
  }

  function num(id) { const v = parseFloat(String($(id).value).replace(/,/g, "")); return isFinite(v) ? v : NaN; }

  const DRAFTS = {
    notice: ["⚖️ Legal notice", "ek legal notice (vakil ki taraf se, sahi format: reference, dinank, vishay, tathya ke points, maang, samay-seema, parinaam)"],
    bail: ["🔓 Bail application", "court mein bail application ka draft (court ka naam, case/FIR no., dharayein, aadhar/grounds points mein, prarthana)"],
    anticip: ["🛡️ Anticipatory bail", "anticipatory bail application ka draft (grounds points mein, prarthana)"],
    rti: ["📮 RTI application", "RTI Act 2005 ki dhara 6(1) ke tahat application (PIO ka pata, maangi gayi jaankari ke saaf points, fee ka zikr)"],
    affidavit: ["📜 Affidavit", "affidavit / shapath-patra ka draft (deponent ki details, para-wise bayan, verification)"],
    police: ["🚓 Police complaint", "police station ko likhit shikayat (SHO ko, ghatna ka samay-jagah, tathya, maang ki FIR darj ho)"],
    reply: ["↩️ Notice ka jawab", "aaye hue legal notice ka jawab (para-wise inkaar/sweekar, apni baat, maang)"],
    app: ["📝 Application (general)", "ek saaf aur vinamra application (kisi office/bank/school ko)"],
    letter: ["✉️ Letter / Email", "ek professional letter ya email"],
    wa: ["💬 WhatsApp message", "chhota, saaf WhatsApp message"],
  };

  function draft() {
    openSheet(`<h3>✍️ Drafting</h3>
      <label class="field">Kya banana hai<select id="dk">${Object.entries(DRAFTS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join("")}</select></label>
      <label class="field">Kiski taraf se<input id="d1" placeholder="Naam / pad (jaise: Ram Lal, s/o …)"></label>
      <label class="field">Kisko / kiske khilaaf<input id="d2" placeholder="Jaise: SHO Thana …, ya Shyam Kumar"></label>
      <label class="field">Court / office (agar ho)<input id="d3" placeholder="Jaise: Sessions Court, Kanpur"></label>
      <label class="field">Tathya — kya hua (jitna detail, utna achha)<textarea id="d4" rows="5" placeholder="Tareekh, ghatna, dhara, paise, jo bhi zaroori ho…"></textarea></label>
      <label class="field">Bhasha<select id="d5"><option>Hindi</option><option>English</option></select></label>
      <div class="row"><button class="btn primary" id="dgo">✍️ Draft banao</button><button class="btn" id="dx">Band karo</button></div>
      <p class="muted small">Ye pehla draft hai — court/office mein dene se pehle khud padh ke sudhaar lena.</p>`, root => {
      $("#dx", root).onclick = closeSheet;
      $("#dgo", root).onclick = () => {
        const d = DRAFTS[$("#dk", root).value];
        const v = id => $(id, root).value.trim();
        if (!v("#d4")) { toast("Tathya likho — kya hua"); return; }
        const p = `${v("#d5")} mein ${d[1]} banao.\nKiski taraf se: ${v("#d1") || "[naam]"}\nKisko / kiske khilaaf: ${v("#d2") || "[naam]"}\nCourt / office: ${v("#d3") || "-"}\nTathya:\n${v("#d4")}\n\nJo jaankari nahi di gayi, uski jagah [ ] mein khaali chhodo — apni taraf se naam, tareekh ya dhara mat banao. Sahi kanoon (BNS/BNSS/BSA jahan lagu ho) ka hi zikr karo; pakka na ho to [check karein] likho.`;
        closeSheet(); Chat.start(p, { send: true, web: false });
      };
    });
  }

  function open(k) {
    const box = $("#tool");
    if (k === "draft") { draft(); return; }
    if (k === "finance") { App.go("finance"); return; }
    if (k === "health") { App.go("health"); return; }
    if (k === "video") { App.go("video"); return; }
    if (k === "global") { App.go("global"); return; }
    if (k === "channel") { App.go("channel"); return; }
    if (k === "trends") { App.go("trends"); return; }
    if (k === "doc") { Chat.start("Is document/photo ka saar do: 1) ye kya hai, 2) mukhya baatein points mein, 3) naam, tareekhein, rakam, dharayein (sections), 4) mere liye aage kya karna zaroori hai.", { pickFile: true, web: false }); return; }
    if (k === "ocr") { Chat.start("Is photo/PDF mein jo likha hai, wo poora text jaisa ka taisa likh do (Hindi ho to Hindi mein, English ho to English mein). Kuch mat badlo, sirf saaf karke likho.", { pickFile: true, web: false }); return; }
    if (k === "court") {
      if (IS_APP) window.Native.openApp("in.courtjudgments.app", "https://github.com/sunny1991-co/court-judgments-app/releases/download/app-latest/CourtJudgments.apk");
      else openLink("https://github.com/sunny1991-co/court-judgments-app/releases/download/app-latest/CourtJudgments.apk");
      return;
    }
    if (k === "cdr") { App.go("cdr"); return; }
    if (k === "cctv" && !IS_APP) { App.go("cctv"); return; }
    if (k === "cctv") { toast(IS_APP ? "CCTV wala hissa laptop pe browser mein chalega" : "Ye hissa agle update mein aayega"); return; }
    const forms = {
      emi: `<h3>🏦 EMI</h3><label class="field">Loan (₹)<input id="a" inputmode="decimal" value="500000"></label>
        <label class="field">Byaaj % saalana<input id="b" inputmode="decimal" value="9"></label>
        <label class="field">Kitne saal<input id="c" inputmode="decimal" value="5"></label>`,
      int: `<h3>💰 Byaaj</h3><label class="field">Rakam (₹)<input id="a" inputmode="decimal" value="100000"></label>
        <label class="field">Byaaj % saalana<input id="b" inputmode="decimal" value="7"></label>
        <label class="field">Kitne saal<input id="c" inputmode="decimal" value="3"></label>`,
      pct: `<h3>％ Percent</h3><label class="field">Number A<input id="a" inputmode="decimal" value="250"></label>
        <label class="field">Number B<input id="b" inputmode="decimal" value="1000"></label>`,
      days: `<h3>📆 Din gino</h3><label class="field">Pehli tareekh<input id="a" type="date" value="${ymd()}"></label>
        <label class="field">Doosri tareekh<input id="b" type="date"></label>
        <label class="field">Ya pehli tareekh mein itne din jodo<input id="c" inputmode="numeric" placeholder="Jaise 90 (limitation)"></label>`,
    };
    box.innerHTML = `<div class="card">${forms[k]}<button class="btn primary wide" id="calc">= Hisaab</button><div id="res"></div></div>`;
    $("#calc").onclick = () => calc(k);
    calc(k);
    box.scrollIntoView({ behavior: "smooth" });
  }

  function calc(k) {
    const out = $("#res");
    let h = "";
    if (k === "emi") {
      const P = num("#a"), r = num("#b") / 1200, n = num("#c") * 12;
      if (!(P > 0 && n > 0 && r >= 0)) h = "Sahi number daalo";
      else {
        const emi = r === 0 ? P / n : P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
        h = `EMI: ${inr(emi)} / mahina<br>Kul bharna: ${inr(emi * n)}<br>Kul byaaj: ${inr(emi * n - P)}`;
      }
    }
    if (k === "int") {
      const P = num("#a"), r = num("#b") / 100, t = num("#c");
      if (!(P > 0 && t > 0)) h = "Sahi number daalo";
      else {
        const si = P * r * t, ci = P * Math.pow(1 + r, t) - P, cm = P * Math.pow(1 + r / 12, t * 12) - P;
        h = `Simple byaaj: ${inr(si)} (kul ${inr(P + si)})<br>Compound (saalana): ${inr(ci)} (kul ${inr(P + ci)})<br>Compound (mahine wala): ${inr(cm)} (kul ${inr(P + cm)})`;
      }
    }
    if (k === "pct") {
      const a = num("#a"), b = num("#b");
      if (!(isFinite(a) && isFinite(b) && b !== 0)) h = "Sahi number daalo";
      else h = `${a} , ${b} ka ${(a / b * 100).toFixed(2)}% hai<br>${b} ka ${a}% = ${(b * a / 100).toFixed(2)}<br>${a} se ${b} tak badlav: ${(a === 0 ? 0 : (b - a) / a * 100).toFixed(2)}%`;
    }
    if (k === "days") {
      const a = $("#a").value, b = $("#b").value, add = parseInt($("#c").value, 10);
      const parts = [];
      if (a && b) {
        const d = Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
        parts.push(`Beech mein: <b>${Math.abs(d)} din</b> (${(Math.abs(d) / 7).toFixed(1)} hafte)`);
      }
      if (a && add > 0) {
        const x = new Date(a + "T00:00:00"); x.setDate(x.getDate() + add);
        parts.push(`${fmtDate(a)} + ${add} din = <b>${fmtDate(ymd(x))}</b> (${x.toLocaleDateString("hi-IN", { weekday: "long" })})`);
      }
      h = parts.join("<br>") || "Tareekh chuno";
      if (add > 0) h += '<div class="muted small">Limitation ka hisaab kanoon ke niyam (jaise chhutti, pehla din chhodna) se badal sakta hai — pakka kar lena.</div>';
    }
    out.innerHTML = `<div class="result">${h}</div>`;
  }

  return { render };
})();
