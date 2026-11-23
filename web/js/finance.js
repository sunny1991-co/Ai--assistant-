// 💼 Finance Guide: your goals + your mutual funds (from the trading app on this phone)
// → plain-language guidance. Not a SEBI-registered adviser; no buying/selling ever.
"use strict";
const Finance = (() => {
  const TRADING = "http://localhost:8787/sahayak/status";
  const prof = () => S.get("finProfile", {});

  async function myFunds() {
    if (!IS_APP) return { err: "Mutual funds sirf phone pe (trading app se) dikhte hain" };
    const tok = S.get("tradeToken", "");
    if (!tok) return { err: "Trading link ka token nahi laga — ⚙️ Settings > 🩺 Monitor" };
    const r = await nativeCall("http", "GET", TRADING, JSON.stringify({ "X-Sahayak-Token": tok }), "");
    if (r.status !== 200) return { err: r.status === 0 ? "Trading app band hai (Termux)" : "Trading link ne mana kiya (" + r.status + ")" };
    try { return JSON.parse(r.text).mutual_funds || { funds: [] }; } catch (e) { return { err: "Data samajh nahi aaya" }; }
  }

  const sip = (target, years, rate, step) => { // monthly SIP needed (optional yearly step-up %)
    const r = rate / 1200, n = years * 12;
    let fv1 = 0; // future value of ₹1/month with step-up
    for (let m = 0; m < n; m++) fv1 += Math.pow(1 + step / 100, Math.floor(m / 12)) * Math.pow(1 + r, n - m);
    return target / fv1;
  };
  const inr = n => "₹" + Math.round(n).toLocaleString("en-IN");

  function render() {
    const p = prof();
    const sel = (id, opts, v) => `<select id="${id}">${opts.map(([k, t]) => `<option value="${k}" ${v === k ? "selected" : ""}>${t}</option>`).join("")}</select>`;
    $("#view").innerHTML = `<div class="wrap"><h2 style="margin:6px 0">💼 Finance Guide</h2>
      <div class="banner">ℹ️ Ye AI guide hai, SEBI-registered advisor nahi. Ye samjhata hai aur hisaab lagata hai; kharid-bikri kabhi nahi karta. Bada faisla lene se pehle registered advisor (RIA) se pakka karna.</div>

      <div class="card"><h3>🙋 Mere baare mein (sirf is phone mein)</h3>
        <label class="field">Umar<input id="fa" inputmode="numeric" value="${esc(p.age || "")}" placeholder="Jaise 34"></label>
        <label class="field">Lakshya (goal)<input id="fg" value="${esc(p.goal || "")}" placeholder="Jaise: ghar 2032, bachche ki padhai 2038, retirement"></label>
        <label class="field">Risk kitna le sakte ho${sel("fr", [["", "—"], ["kam", "Kam (paisa surakshit chahiye)"], ["beech", "Beech ka"], ["zyada", "Zyada (girawat jhel sakta hoon)"]], p.risk || "")}</label>
        <label class="field">Emergency fund (6 mahine ka kharcha) alag rakha hai?${sel("fe", [["", "—"], ["haan", "Haan"], ["nahi", "Nahi"]], p.emerg || "")}</label>
        <label class="field">Health / term insurance?${sel("fi", [["", "—"], ["dono", "Dono hain"], ["health", "Sirf health"], ["term", "Sirf term"], ["nahi", "Koi nahi"]], p.ins || "")}</label>
        <button class="btn" id="fsave">💾 Save</button>
      </div>

      <div class="card"><h3>📊 Mere mutual funds</h3><div id="fmf" class="small muted">⏳ Trading app se la raha hoon…</div>
        <div class="row" style="margin-top:8px"><button class="btn primary" id="fask">🤖 Poori salah lo</button></div>
        <p class="muted small">AI ko sirf fund ke naam, category, return % aur hissa % jaata hai — ₹ rakam nahi.</p>
      </div>

      <div class="card"><h3>🎯 Goal ka hisaab (SIP kitni chahiye)</h3>
        <div class="row"><label class="field" style="flex:1">Kitna chahiye (aaj ke ₹)<input id="gt" inputmode="numeric" value="2000000"></label>
        <label class="field" style="flex:1">Kitne saal mein<input id="gy" inputmode="numeric" value="10"></label></div>
        <div class="row"><label class="field" style="flex:1">Andaaza return %<input id="gr" inputmode="decimal" value="11"></label>
        <label class="field" style="flex:1">Mehngai %<input id="gi" inputmode="decimal" value="6"></label>
        <label class="field" style="flex:1">SIP har saal badhao %<input id="gs" inputmode="decimal" value="0"></label></div>
        <button class="btn primary wide" id="gcalc">= Hisaab</button><div id="gres"></div>
      </div>

      <div class="card"><h3>💬 Seedha poochho</h3><div class="sugg" style="margin:0">
        <button data-q="Kya mujhe apna koi fund switch karna chahiye? Mere funds ke data ke hisaab se batao.">🔁 Switch karun?</button>
        <button data-q="Mere paas do small cap funds hain — kya ye zyada risk hai? Category ke hisaab se kya balance hona chahiye?">⚖️ Risk balance</button>
        <button data-q="Mutual fund pe tax kaise bachau? LTCG ₹1.25 lakh wali chhoot ka kaise fayda uthaun?">💸 Tax bachao</button>
        <button data-q="Market gir raha ho to SIP band karun ya chalne doon?">📉 Market gire to?</button>
      </div></div>
    </div>`;
    $("#fsave").onclick = () => { S.set("finProfile", { age: $("#fa").value.trim(), goal: $("#fg").value.trim(), risk: $("#fr").value, emerg: $("#fe").value, ins: $("#fi").value }); toast("✅ Save"); };
    $("#gcalc").onclick = () => {
      const t = +$("#gt").value.replace(/,/g, ""), y = +$("#gy").value, r = +$("#gr").value, inf = +$("#gi").value, st = +$("#gs").value || 0;
      if (!(t > 0 && y > 0 && r > 0)) { $("#gres").innerHTML = '<div class="result">Sahi number daalo</div>'; return; }
      const future = t * Math.pow(1 + inf / 100, y);
      const m = sip(future, y, r, st);
      $("#gres").innerHTML = `<div class="result">Mehngai ke baad chahiye: ${inr(future)}<br>Har mahine SIP: <b>${inr(m)}</b>${st ? ` (har saal ${st}% badhao)` : ""}<br><span class="muted small">${r}% saalana return ka andaaza hai, guarantee nahi.</span></div>`;
    };
    $$("[data-q]").forEach(b => b.onclick = () => ask(b.dataset.q));
    $("#fask").onclick = () => ask("Mere poore portfolio ko dekh ke salah do: kya theek hai, kahan risk zyada hai, mere goal ke liye kya badlav sochne layak hai.");
    myFunds().then(d => {
      const el = $("#fmf"); if (!el) return;
      if (d.err) { el.textContent = "⚠️ " + d.err; return; }
      const fs = d.funds || [];
      el.innerHTML = fs.length ? fs.map(f => `<div class="list-item small"><span class="t">${{ OK: "✅", NAZAR: "⚠️", SWITCH_SOCHO: "❌", NAYA: "⏳" }[f.verdict] || "❔"} ${esc(String(f.name).split(" - ")[0])}</span><span>${f.weight_pct != null ? f.weight_pct + "%" : ""}</span></div>`).join("") + (d.gain_pct != null ? `<p class="small">Kul munafa: <b>${d.gain_pct}%</b></p>` : "")
        : "Trading app mein abhi koi fund nahi joda (Long-Term slide).";
    });
  }

  async function ask(q) {
    const p = prof(), d = await myFunds();
    if (d.err && !ask.warned) { ask.warned = true; toast("⚠️ Funds ka data nahi aaya: " + d.err + " — phir bhi poochhna ho to dobara dabao", 5000); return; }
    const data = {
      mera_profile: { umar: p.age || "?", lakshya: p.goal || "?", risk: p.risk || "?", emergency_fund: p.emerg || "?", insurance: p.ins || "?" },
      mutual_funds: d.err ? "DATA_NAHI_MILA (" + d.err + ") — user ke paas funds HAIN, bas yahan nahi aaye; ye mat maano ki investment zero hai" : d,
    };
    const txt = "[💼 Finance Guide] Tum mere personal finance guide ho (SEBI-registered advisor nahi). Niyam: seedhi Hinglish, chhote points; mere data aur goal ke hisaab se samjhao; " +
      "diversification aur risk dekho (ek hi category mein zyada paisa?); fund badalne ki baat ho to pehle app ka verdict/rank dekho, phir tax (equity 1 saal se pehle 20%, baad mein ₹1.25 lakh se upar 12.5%) aur exit load (~1% 1 saal se pehle) ka kharcha batao; " +
      "jo data nahi diya gaya (jaise umar, income, kul paisa) uska andaaza mat lagao — zaroorat ho to mujhse poochho; kisi ek fund/stock ki pakki tip ya 'guaranteed return' mat do; emergency fund aur insurance pehle; bada faisla lene se pehle SEBI-registered RIA se pakka karne ko kaho.\n\n" +
      "Mera data:\n" + JSON.stringify(data) + "\n\nMera sawaal: " + q;
    Chat.start(txt, { send: true, web: false });
  }

  return { render };
})();
