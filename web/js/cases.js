// Case diary: next hearing date, notes, reminders (phone app shows notifications).
"use strict";
const Cases = (() => {
  const all = () => S.get("cases", []);
  const save = list => S.set("cases", list);

  function dueSoon() {
    return all().filter(c => c.next && !c.closed && [0, 1].includes(daysUntil(c.next)));
  }

  function remind(c) {
    if (!IS_APP) return;
    window.Native.cancelRemind("case:" + c.id + ":eve");
    window.Native.cancelRemind("case:" + c.id + ":morn");
    if (!c.next || c.closed || c.noRemind) return;
    const day = new Date(c.next + "T08:00:00");
    const eve = new Date(day.getTime() - 13 * 3600000); // previous day 7 PM
    const title = "📅 " + c.title;
    if (eve > new Date()) window.Native.remind("case:" + c.id + ":eve", eve.getTime(), title, "Kal tareekh hai" + (c.court ? " — " + c.court : ""));
    if (day > new Date()) window.Native.remind("case:" + c.id + ":morn", day.getTime(), title, "Aaj tareekh hai" + (c.court ? " — " + c.court : ""));
  }

  function badge(c) {
    if (c.closed) return '<span class="chip">✅ Band</span>';
    if (!c.next) return "";
    const d = daysUntil(c.next);
    if (d < 0) return `<span class="chip">${fmtDate(c.next)} (beet gayi)</span>`;
    if (d === 0) return '<span class="badge today">Aaj</span>';
    if (d === 1) return '<span class="badge">Kal</span>';
    return `<span class="chip">${fmtDate(c.next)} · ${d} din</span>`;
  }

  function render() {
    const list = all().sort((a, b) => (a.closed - b.closed) || String(a.next || "9999").localeCompare(String(b.next || "9999")));
    $("#view").innerHTML = `<div class="wrap">
      <div class="row" style="justify-content:space-between"><h2 style="margin:6px 0">📁 Case diary</h2><button class="btn primary" id="cadd">✚ Naya case</button></div>
      <input id="cq" placeholder="🔍 Case dhoondho" style="width:100%;padding:11px;border-radius:12px;border:1px solid var(--line);background:var(--bg);margin:6px 0">
      <div id="clist"></div>
      <p class="muted small">🔒 Case ki saari jaankari sirf is ${IS_APP ? "phone" : "browser"} mein rehti hai. ${IS_APP ? "Tareekh se ek din pehle shaam 7 baje aur us din subah 8 baje notification aayega." : ""}</p>
    </div>`;
    const draw = q => {
      const items = list.filter(c => !q || (c.title + " " + (c.caseNo || "") + " " + (c.court || "") + " " + (c.notes || "")).toLowerCase().includes(q.toLowerCase()));
      $("#clist").innerHTML = items.length ? items.map(c => `<div class="card" data-id="${c.id}">
          <div class="row" style="justify-content:space-between"><h3>${esc(c.title)}</h3>${badge(c)}</div>
          <div class="muted small">${esc([c.caseNo, c.court].filter(Boolean).join(" · "))}</div>
          ${c.notes ? `<div class="small" style="margin-top:4px">${esc(c.notes.slice(0, 140))}${c.notes.length > 140 ? "…" : ""}</div>` : ""}
        </div>`).join("") : `<div class="card welcome"><div class="big">📁</div><p>Abhi koi case nahi. <b>✚ Naya case</b> dabao.</p></div>`;
      $$("#clist .card[data-id]").forEach(e => e.onclick = () => edit(e.dataset.id));
    };
    draw("");
    $("#cq").oninput = e => draw(e.target.value);
    $("#cadd").onclick = () => edit(null);
  }

  function edit(id) {
    const list = all();
    const c = list.find(x => x.id === id) || { id: uid(), title: "", caseNo: "", court: "", next: "", notes: "", hist: [] };
    const isNew = !list.includes(c);
    openSheet(`<h3>${isNew ? "✚ Naya case" : "✏️ Case"}</h3>
      <label class="field">Naam / Party<input id="ct" value="${esc(c.title)}" placeholder="Jaise: Ram Lal vs State"></label>
      <label class="field">Case number<input id="cn" value="${esc(c.caseNo)}" placeholder="Jaise: CRL.A 123/2026"></label>
      <label class="field">Court<input id="cc" value="${esc(c.court)}" placeholder="Jaise: District Court, Jaipur"></label>
      <label class="field">📅 Agli tareekh<input id="cd" type="date" value="${esc(c.next)}"></label>
      <label class="field">📝 Notes<textarea id="cno" rows="4" placeholder="Kya hua, agli baar kya karna hai…">${esc(c.notes)}</textarea></label>
      <label class="row small"><input type="checkbox" id="cnr" ${c.noRemind ? "" : "checked"}> 🔔 Reminder ${IS_APP ? "" : "(sirf phone app mein)"}</label>
      <label class="row small"><input type="checkbox" id="ccl" ${c.closed ? "checked" : ""}> ✅ Case band ho gaya</label>
      ${(c.hist || []).length ? `<details style="margin-top:8px"><summary>🕘 Purani tareekhein (${c.hist.length})</summary>${c.hist.slice().reverse().map(h => `<div class="small muted">${fmtDate(h.date)} — ${esc(h.note || "")}</div>`).join("")}</details>` : ""}
      <div class="row" style="margin-top:12px">
        <button class="btn primary" id="csave">💾 Save</button>
        <button class="btn" id="cask">🤖 AI se poochho</button>
        ${isNew ? "" : '<button class="btn bad" id="cdel">🗑️</button>'}
        <button class="btn" id="cx">Band karo</button>
      </div>`, root => {
      $("#csave", root).onclick = () => {
        const title = $("#ct", root).value.trim();
        if (!title) { toast("Case ka naam likho"); return; }
        const next = $("#cd", root).value;
        if (c.next && next && next !== c.next) (c.hist = c.hist || []).push({ date: c.next, note: c.notes.slice(0, 200) });
        Object.assign(c, { title, caseNo: $("#cn", root).value.trim(), court: $("#cc", root).value.trim(), next, notes: $("#cno", root).value, noRemind: !$("#cnr", root).checked, closed: $("#ccl", root).checked });
        const l = all().filter(x => x.id !== c.id); l.push(c); save(l);
        remind(c);
        if (IS_APP && !c.noRemind && next) window.Native.askNotify();
        closeSheet(); render(); toast("Save ho gaya ✓");
      };
      $("#cx", root).onclick = closeSheet;
      $("#cask", root).onclick = () => {
        closeSheet(); App.go("chat");
        setTimeout(() => { const inp = $("#inp"); inp.value = "Mere case ke baare mein madad karo (naam/number chhupa ke):\nCourt: " + (c.court || "-") + "\nNotes: " + (c.notes || "-") + "\n\nSawaal: "; inp.focus(); }, 50);
      };
      const del = $("#cdel", root);
      if (del) del.onclick = () => {
        if (!Chat.confirmTwice(del)) return;
        save(all().filter(x => x.id !== c.id));
        if (IS_APP) { window.Native.cancelRemind("case:" + c.id + ":eve"); window.Native.cancelRemind("case:" + c.id + ":morn"); }
        closeSheet(); render();
      };
    });
  }

  return { render, dueSoon };
})();
