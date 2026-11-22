// Small helpers shared by every screen: storage, DOM, toast, native bridge.
"use strict";
const IS_APP = typeof window.Native !== "undefined";
const APP_VERSION = IS_APP ? Number(window.Native.version()) : 0;
const REPO = "sunny1991-co/ai--assistant-";

const S = {
  get(k, d) {
    try { const v = localStorage.getItem("sahayak." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
  },
  set(k, v) {
    try { localStorage.setItem("sahayak." + k, JSON.stringify(v)); return true; }
    catch (e) { toast("Jagah bhar gayi — Settings se purani chats hatao"); return false; }
  },
  del(k) { try { localStorage.removeItem("sahayak." + k); } catch (e) { /* ignore */ } },
  keys() {
    const out = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("sahayak.")) out.push(k.slice(8)); } } catch (e) { /* ignore */ }
    return out;
  },
};

function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return [...(root || document).querySelectorAll(sel)]; }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function ymd(d) {
  d = d || new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function fmtDate(s) {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return d + "-" + m + "-" + y;
}
function daysUntil(s) {
  const a = new Date(ymd() + "T00:00:00"), b = new Date(s + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

let toastTimer = 0;
function toast(msg, ms) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms || 2600);
}

// Bottom sheet (popup). html is trusted markup built by our own code.
function openSheet(html, onReady) {
  const sh = $("#sheet");
  sh.innerHTML = '<div class="in">' + html + "</div>";
  sh.hidden = false;
  sh.onclick = e => { if (e.target === sh) closeSheet(); };
  if (onReady) onReady(sh.firstChild);
}
function closeSheet() { const sh = $("#sheet"); sh.hidden = true; sh.innerHTML = ""; }

// Native bridge calls that answer later: Native.fn(id, ...) -> window.NativeCb(id, data)
const nativeWait = {};
window.NativeCb = function (id, data) {
  const f = nativeWait[id];
  if (f) { delete nativeWait[id]; f(data); }
};
function nativeCall(fn, ...args) {
  return new Promise(resolve => {
    const id = uid();
    nativeWait[id] = resolve;
    window.Native[fn](id, ...args);
  });
}

function openLink(url) {
  if (!/^https:\/\//.test(url)) return;
  if (IS_APP) window.Native.openUrl(url); else window.open(url, "_blank", "noopener");
}
function shareText(text) {
  if (IS_APP) return window.Native.share(text);
  if (navigator.share) return navigator.share({ text }).catch(() => {});
  copyText(text);
}
function copyText(text) {
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast("Copy ho gaya ✓"), () => toast("Copy nahi hua"));
  else toast("Copy nahi hua");
}
// Save a text/binary file: phone -> Downloads/Sahayak, laptop -> browser download.
function saveFile(name, mime, text) {
  if (IS_APP) {
    const b64 = btoa(unescape(encodeURIComponent(text)));
    return nativeCall("saveFile", name, mime, b64).then(r => toast(r && r.ok ? "Save ho gaya: Downloads/Sahayak/" + name : "Save nahi hua"));
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast("Download ho gaya: " + name);
  return Promise.resolve();
}
