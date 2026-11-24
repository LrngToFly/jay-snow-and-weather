/* Jay Snow & Weather: shared helpers, storage, diagnostics and chart helpers. Loaded right after config.js.
   Plain scripts that share one set of names, no build step (same style as Backyard Weather). */
'use strict';

var OM_BASE = 'https://api.open-meteo.com/v1/forecast';
var HOUR = 3600, DAY = 86400;
var FT2M = 0.3048;

// ---------------------------------------------------------------- helpers
function el(id) { return document.getElementById(id); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function ok(v) { return v !== null && v !== undefined && !isNaN(v); }
function fmt(v, dp) { return ok(v) ? Number(v).toFixed(dp) : '–'; }
function num() { for (var i = 0; i < arguments.length; i++) { var v = arguments[i]; if (v !== null && v !== undefined && v !== '' && !isNaN(v)) return +v; } return null; }
function mkEl(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function fmtClock(ms) { return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
function fmtHour(t) { return new Date(t * 1000).toLocaleString([], { weekday: 'short', hour: 'numeric' }); }
function localDayStart(t) { var d = new Date(t * 1000); d.setHours(0, 0, 0, 0); return d.getTime() / 1000; }
function modelById(id) { return CONFIG.models.filter(function (m) { return m.id === id; })[0]; }
function nowSec() { return Date.now() / 1000; }

var store = {
  get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* full or private mode */ } }
};
var settings = Object.assign({ layout: 'auto' }, store.get('jay.settings', {}));
var params = new URLSearchParams(location.search);
var isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

// ---------------------------------------------------------------- diagnostics
var logLines = [];
function log(msg) {
  var d = new Date();
  logLines.push(pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) + '  ' + msg);
  if (logLines.length > 200) logLines.shift();
  var pre = el('diag-log'); if (pre) pre.textContent = logLines.join('\n');
}
function friendlyError(e) {
  var m = (e && e.message) || String(e);
  if ((e && e.name === 'TypeError') || /Load failed|Failed to fetch|NetworkError/i.test(m)) return 'Could not connect (' + m + '). Check the internet connection.';
  if (e && e.status === 429) return 'Open-Meteo\'s free limit was reached. Wait a minute, then tap refresh.';
  return m;
}
async function omFetch(url) {
  var r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) {
    var reason = ''; try { reason = (await r.json()).reason || ''; } catch (e) { /* not JSON */ }
    var err = new Error('Open-Meteo HTTP ' + r.status + (reason ? ': ' + reason : '')); err.status = r.status; throw err;
  }
  return r.json();
}

// ---------------------------------------------------------------- canvas
function dprNow() { return Math.min(window.devicePixelRatio || 1, 3); }
function sizeCanvas(cv, W, H) {
  var dpr = dprNow(), w = Math.round(W * dpr), h = Math.round(H * dpr);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  if (cv._cw !== W || cv._ch !== H) { cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv._cw = W; cv._ch = H; }
  var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
function cssVar(name, d) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || d; }
// dark rounded box: a title line, then [color, text] lines
function readoutBox(ctx, W, hx, by, lines) {
  ctx.font = '600 12px -apple-system, system-ui, sans-serif';
  var bw = 0; lines.forEach(function (l, i) { bw = Math.max(bw, ctx.measureText(i ? l[1] : l).width + (i ? 16 : 0)); });
  bw += 16; var bh = lines.length * 17 + 8, bx = hx + 10; if (bx + bw > W - 2) bx = hx - 10 - bw; if (bx < 2) bx = 2;
  ctx.fillStyle = 'rgba(16,28,44,.94)'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 7); else ctx.rect(bx, by, bw, bh); ctx.fill();
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  lines.forEach(function (l, i) {
    var yy = by + 4 + i * 17 + 8.5;
    if (!i) { ctx.fillStyle = '#ffffff'; ctx.fillText(l, bx + 8, yy); }
    else { ctx.fillStyle = l[0]; ctx.fillRect(bx + 8, yy - 5, 9, 9); ctx.fillStyle = '#ffffff'; ctx.fillText(l[1], bx + 22, yy); }
  });
  ctx.textBaseline = 'alphabetic';
}
// A tap (or a sideways slide) shows the readout and it stays; tapping again hides it. With a mouse it follows the pointer.
var readouts = [];
function tapReadout(cv, show, hide, isOpen) {
  var t = null;
  cv.classList.add('readout');
  cv.addEventListener('pointerdown', function (e) { if (e.pointerType === 'mouse') { show(e); return; } t = { x: e.clientX, moved: false, wasOpen: isOpen() }; });
  cv.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'mouse') { show(e); return; }
    if (!t) return;
    if (!t.moved && Math.abs(e.clientX - t.x) > 8) t.moved = true;
    if (t.moved) show(e);
  });
  cv.addEventListener('pointerup', function (e) { if (e.pointerType === 'mouse' || !t) return; if (!t.moved) { if (t.wasOpen) hide(); else show(e); } t = null; });
  cv.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hide(); });
  cv.addEventListener('pointercancel', function () { t = null; });
  readouts.push(hide);
}
document.addEventListener('pointerdown', function (e) {
  if (e.target.closest && e.target.closest('canvas.readout')) return;
  readouts.forEach(function (h) { h(); });
});

// ---------------------------------------------------------------- Tropical Tidbits colors (from Backyard Weather's colors.js)
// Precipitation rate (mm/hr break points, as on Tropical Tidbits' legend); the app shows in/hr.
var RATE_T = [0.1, 0.25, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 30, 36, 42];
var RATE_C = ['#99f26c', '#8bdc62', '#7cc558', '#6dae4d', '#5f9842', '#4f8038', '#406a2d', '#325424',
  '#fafe74', '#ecd565', '#e1ac58', '#d8854b', '#d05138', '#b5413a', '#98343d', '#7d2a42', '#a53ba0', '#bc45ba', '#d44fd4'];
var SNOWR_C = ['#a4f7fd', '#97e2f7', '#88c9f9', '#7fb8f8', '#74a6f7', '#6890f6', '#5167e1', '#4552d4',
  '#3a3ec6', '#302cb5', '#2a1fa9', '#270e95', '#2c1290', '#441f81', '#8a3280', '#ad3e81', '#cf4b7d'];
function band(v, T) { if (!(v >= T[0])) return -1; var k = 0; while (k < T.length - 1 && v >= T[k + 1]) k++; return k; }
function rateColor(inPerHr, frozen) {
  var k = band(inPerHr * 25.4, RATE_T); if (k < 0) k = 0;
  return frozen ? SNOWR_C[Math.min(k, SNOWR_C.length - 1)] : RATE_C[k];
}
// 2 m temperature, one color per °F from -70 to 130 (Tropical Tidbits' T2m bar); only -20..60 °F is used here
var TMIN = -70;
var TCOL = [
  '#ddc7ec', '#dfc3ed', '#d9b2e6', '#d9aee5', '#d7a2dc', '#d49dd3', '#d295cb', '#d393c8', '#d182be', '#d07bba',
  '#cf74b6', '#cf73b5', '#cf69ad', '#ce5ea2', '#ce5b9f', '#ce5a9e', '#cf5191', '#cf5191', '#cc4c85', '#cb4b81',
  '#cb4b81', '#cb4b81', '#cb4b81', '#cb4b81', '#c84a82', '#c64a82', '#c04982', '#bf4982', '#bc4982', '#bc4982',
  '#bb4982', '#ba4982', '#b74a82', '#b74a82', '#b14b83', '#af4c83', '#af4c83', '#af4c83', '#ae4e85', '#ad4f85',
  '#ac528a', '#aa578e', '#ab5890', '#ab5890', '#ae649f', '#af69a3', '#b06da8', '#b06da8', '#b171ac', '#b47eb9',
  '#b07ebc', '#b07ebc', '#a275b8', '#976db5', '#9369b2', '#8b63b0', '#815dac', '#8058a9', '#6f53a3', '#6f53a3',
  '#6f53a3', '#7054a3', '#7863ae', '#8a77b9', '#8f7ebb', '#9d8ec6', '#a299ce', '#afabd7', '#b4b2db', '#cfd0e0',
  '#cacadf', '#b9b7dc', '#b3b0da', '#a49ed0', '#9893cc', '#8987ca', '#8080cb', '#736fc2', '#726abb', '#5752b3',
  '#5752b3', '#5752b3', '#5754b7', '#575bc2', '#575bc2', '#5a65cf', '#5c6bd6', '#5d6cd7', '#5f71dc', '#637be5',
  '#6682eb', '#6a8af0', '#6c8ff1', '#75a1f5', '#7baff7', '#7db1f8', '#80b8f8', '#8ccefa', '#91d5fa', '#98e2fb',
  '#9ceafc', '#a4f7fd', '#a2e8bc', '#a1dd9d', '#9cda96', '#95d28a', '#91ce83', '#8ac778', '#85c270', '#7fbc64',
  '#7bb85e', '#74b254', '#70ad4e', '#6aa644', '#67a23f', '#619a36', '#5e9733', '#669e37', '#6ca33b', '#77ac42',
  '#7db146', '#8bba4f', '#93bf54', '#a1c95d', '#aace63', '#bad86c', '#c3de72', '#d3e77c', '#dded81', '#edf68c',
  '#f8fc92', '#f7f68e', '#f4ee8a', '#f1e484', '#edde80', '#e9d279', '#e6cb75', '#e2c270', '#e0bc6c', '#deb164',
  '#dbaa61', '#d59d57', '#d09652', '#ca8949', '#c78143', '#c1743a', '#bc6d35', '#b7612d', '#b45a28', '#b05325',
  '#a7451e', '#a13f1c', '#a13f1c', '#973b1f', '#933920', '#903823', '#903823', '#87352b', '#84342f', '#803333',
  '#803333', '#843839', '#84393b', '#8f4447', '#94494d', '#994f53', '#9d5457', '#a85f61', '#b2696a', '#b66e70',
  '#bb7378', '#c88089', '#ca8390', '#d08da7', '#d290ae', '#dba0c4', '#dba2cc', '#e2add5', '#e3b6e0', '#e4c0ee',
  '#e5c5f4', '#e0bcee', '#dbb1e8', '#d3a8e3', '#c89dde', '#bd91d9', '#b98dd5', '#b083cb', '#a97ac2', '#9a6fb7',
  '#8e64b0', '#8359ab', '#8153a4', '#7e4897', '#7c418f', '#7b3c88', '#7a3a86', '#78347c', '#77337a', '#732a67',
  '#752b5d'
];
function tempColor(f) { var i = clamp(Math.round(f) - TMIN, 0, TCOL.length - 1); return TCOL[i]; }
