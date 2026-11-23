// ❤️ Health: my profile + my lab reports (summaries kept on this phone) → food guidance,
// including food/water around alcohol. Not a doctor: no medicine changes, urgent values → doctor.
"use strict";
const Health = (() => {
  const prof = () => S.get("hProfile", {});
  const reports = () => S.get("hReports", []);

  const RULES = "Tum mere health aur khane ke guide ho (doctor NAHI). Niyam: seedhi Hinglish, chhote points, Bharatiya khana (dal, roti, sabzi, dahi, phal…). " +
    "Meri report aur profile ke hisaab se batao; jo data nahi diya uska andaaza mat lagao. Dawai shuru/band/dose badalne ki salah kabhi mat do — wo doctor karega. " +
    "Koi value khatarnaak ho (jaise sugar >300, Hb <8, potassium/sodium bahut upar-neeche, creatinine bahut upar) ya seene mein dard, saans phoolna, behoshi, khoon ki ulti jaise lakshan hon to sabse upar likho: 'TURANT doctor/emergency'. " +
    "Sharaab (alcohol) ke baare mein: peene ko badhawa mat do; agar poochha jaye to nuksaan kam karne wali baatein batao — khali pet na piyen, saath mein protein/fibre wala khana, har drink ke saath paani, namkeen/fried/meetha kam, mixers mein cola kam, limit; kuch dawaiyon (jaise paracetamol, metformin, neend/dard ki dawai, antibiotics) ke saath sharaab khatarnaak ho sakti hai — doctor se poochhne ko kaho; " +
    "liver, sugar, BP, uric acid ya fatty liver ki dikkat ho to saaf kaho ki sharaab se bachna behtar hai. Agli subah ke liye: paani/nimbu-paani/nariyal paani, halka khana (khichdi, dahi, kela, poha, ande agar non-veg), chai-coffee kam; behoshi, baar-baar ulti ya bhram ho to emergency.";

  function ctx() {
    const p = prof(), r = reports().slice(-2);
    return "Meri profile: " + JSON.stringify(p) + "\nMeri haal ki reports ka saar:\n" +
      (r.length ? r.map(x => "[" + x.date + " · " + x.name + "]\n" + x.summary.slice(0, 2500)).join("\n\n") : "(koi report nahi di)");
  }

  function render() {
    const p = prof();
    const sel = (id, opts, v) => `<select id="${id}">${opts.map(o => `<option ${v === o ? "selected" : ""}>${o}</option>`).join("")}</select>`;
    const rs = reports();
    $("#view").innerHTML = `<div class="wrap"><h2 style="margin:6px 0">❤️ Health</h2>
      <div class="banner">ℹ️ Ye AI guide hai, doctor nahi. Dawai ya dose kabhi khud mat badalna. Emergency ho to 108/112 ya nazdeeki hospital.</div>

      <div class="card"><h3>🙋 Meri jaankari (sirf is phone mein)</h3>
        <div class="row"><label class="field" style="flex:1">Umar<input id="ha" inputmode="numeric" value="${esc(p.age || "")}"></label>
        <label class="field" style="flex:1">Purush/Mahila${sel("hg", ["—", "Purush", "Mahila"], p.gender || "—")}</label></div>
        <div class="row"><label class="field" style="flex:1">Lambai (cm)<input id="hh" inputmode="numeric" value="${esc(p.height || "")}"></label>
        <label class="field" style="flex:1">Wajan (kg)<input id="hw" inputmode="decimal" value="${esc(p.weight || "")}"></label></div>
        <label class="field">Khana${sel("hf", ["—", "Shakahari (veg)", "Anda chalega", "Non-veg"], p.food || "—")}</label>
        <label class="field">Bimari / dikkat (jaise sugar, BP, thyroid, cholesterol, fatty liver, uric acid)<input id="hc" value="${esc(p.cond || "")}"></label>
        <label class="field">Allergy<input id="hal" value="${esc(p.allergy || "")}"></label>
        <label class="field">Roz ki dawaiyan (naam, optional)<input id="hm" value="${esc(p.meds || "")}"></label>
        <button class="btn" id="hsave">💾 Save</button> <span id="bmi" class="small"></span>
      </div>

      <div class="card"><h3>🧪 Report samjho</h3>
        <p class="small muted">Blood test / koi bhi report ki PDF ya photo. Saar phone mein save rahega aur khane ki salah usi hisaab se aayegi.</p>
        <button class="btn primary" id="hup">📎 Report chuno</button><input type="file" id="hfile" accept="image/*,application/pdf" hidden>
        <div id="hout" class="small" style="margin-top:8px"></div>
        ${rs.length ? `<h3 style="margin-top:12px">📁 Meri reports</h3>` + rs.slice().reverse().map((x, i) => `<details class="small"><summary>${esc(x.date)} · ${esc(x.name)}</summary><div>${MD.render(x.summary)}</div><button class="btn bad" data-del="${rs.length - 1 - i}">🗑️ Hatao</button></details>`).join("") : ""}
        <p class="muted small">⚠️ Free AI key wali report Google apna AI sudhaarne mein use kar sakta hai. Chaho to photo mein naam/number chhupa ke do.</p>
      </div>

      <div class="card"><h3>💬 Poochho</h3><div class="sugg" style="margin:0">
        <button data-q="Meri report aur profile ke hisaab se aaj din bhar kya khaun? Subah, dopahar, shaam, raat.">🍽️ Aaj kya khaun</button>
        <button data-q="Meri report ke hisaab se mujhe kya bilkul nahi khana chahiye aur kya kam karna chahiye?">🚫 Kya na khaun</button>
        <button data-q="Aaj raat drink karunga — usse pehle aur saath mein kya khaun taaki nuksaan kam ho? Meri report ke hisaab se kya dhyaan rakhun?">🥃 Drink ke saath</button>
        <button data-q="Kal raat drink ki thi — aaj subah kya khaun-piyun? Kab doctor ko dikhana chahiye?">🌅 Drink ke baad subah</button>
        <button data-q="Meri report ke hisaab se 7 din ka simple Indian diet plan banao.">📅 7 din ka diet</button>
        <button data-q="Meri report mein kya theek nahi hai aur use sudhaarne ke liye lifestyle mein kya badlav karun?">🏃 Sudhaar kaise</button>
      </div></div>
    </div>`;
    const bmi = () => { const h = +$("#hh").value / 100, w = +$("#hw").value; if (h > 1 && w > 20) { const b = w / (h * h); $("#bmi").textContent = "BMI " + b.toFixed(1) + (b < 18.5 ? " (kam)" : b < 23 ? " (theek)" : b < 25 ? " (thoda zyada)" : " (zyada)"); } };
    bmi();
    $("#hsave").onclick = () => { S.set("hProfile", { age: $("#ha").value.trim(), gender: $("#hg").value, height: $("#hh").value.trim(), weight: $("#hw").value.trim(), food: $("#hf").value, cond: $("#hc").value.trim(), allergy: $("#hal").value.trim(), meds: $("#hm").value.trim() }); bmi(); toast("✅ Save"); };
    $$("[data-q]").forEach(b => b.onclick = () => Chat.start("[❤️ Health] " + RULES + "\n\n" + ctx() + "\n\nMera sawaal: " + b.dataset.q, { send: true, web: false }));
    $$("[data-del]").forEach(b => b.onclick = () => { if (!Chat.confirmTwice(b)) return; const l = reports(); l.splice(+b.dataset.del, 1); S.set("hReports", l); render(); });
    $("#hup").onclick = () => $("#hfile").click();
    $("#hfile").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) readReport(f); };
  }

  async function readReport(f) {
    const out = $("#hout");
    if (f.size > 15 * 1024 * 1024) { out.textContent = "File 15 MB se badi hai"; return; }
    out.innerHTML = '<span class="dots"><i></i><i></i><i></i></span> Report padh raha hoon…';
    try {
      let data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
      let mime = f.type || "application/pdf";
      if (/^image\//.test(mime)) {
        data = await new Promise(res => { const img = new Image(); img.onload = () => { const s = Math.min(1, 2000 / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = img.width * s; c.height = img.height * s; c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", 0.9)); }; img.onerror = () => res(data); img.src = data; });
        mime = "image/jpeg";
      }
      const r = await G.ask([{ role: "user", parts: [{ inline_data: { mime_type: mime, data: data.split(",")[1] } }, { text:
        "Ye meri medical/lab report hai. Hinglish mein, aasaan bhasha mein:\n1. Report ki tareekh aur kis cheez ki jaanch hai\n2. Table: test · meri value · normal range · ✅/⚠️/❌\n3. Kya theek nahi hai, aasaan matlab ke saath\n4. Khane-peene mein kya badlav madad karega (Indian khana)\n5. Kab doctor ko dikhana zaroori hai (khatarnaak value ho to sabse upar 'TURANT doctor')\nMeri profile: " + JSON.stringify(prof()) + "\nJo report mein nahi likha uska andaaza mat lagao. Dawai ki salah mat do." }] }],
        { system: RULES, web: false, onPart: p => { out.innerHTML = MD.render(p.text); } });
      out.innerHTML = MD.render(r.text);
      const l = reports(); l.push({ date: ymd(), name: (f.name || "report").slice(0, 50), summary: r.text.slice(0, 6000) }); S.set("hReports", l.slice(-12));
      toast("✅ Report ka saar save ho gaya");
    } catch (e) { out.textContent = "❌ " + (e.message || "Report nahi padh paya"); }
  }

  return { render };
})();
