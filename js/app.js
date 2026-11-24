/* Jay Snow & Weather: layout, links panel, settings, refreshing, falling snow, update notice and start-up. Loaded last. */
'use strict';

// ---------------------------------------------------------------- layout: phone / iPad portrait / iPad landscape
function applyLayout() {
  var w = document.documentElement.clientWidth, mode = settings.layout || 'auto', cl = document.documentElement.classList, med, big;
  if (mode === 'phone') { med = false; big = false; }
  else if (mode === 'tablet') { med = true; big = w >= 900; }
  else { med = w >= 700; big = w >= 1000; }
  var changed = cl.contains('w-med') !== med || cl.contains('w-big') !== big;
  cl.toggle('w-med', med); cl.toggle('w-big', big);
  return changed;
}
function renderAll() { renderSummary(); renderCharts(); }

// ---------------------------------------------------------------- links (open in Safari: Jay's pages refuse to be framed)
function buildLinks(boxId) {
  var box = el(boxId); box.innerHTML = '';
  CONFIG.links.forEach(function (l) {
    var a = mkEl('a', 'link'); a.href = l.url; a.target = '_blank'; a.rel = 'noopener';
    a.innerHTML = '<span><b>' + esc(l.label) + '</b><span class="s">' + esc(l.sub) + '</span></span><span class="go" aria-hidden="true">↗</span>';
    box.appendChild(a);
  });
}
function openDlg(id) { var d = el(id); if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
document.addEventListener('click', function (e) {
  var c = e.target.closest && e.target.closest('[data-close]'); if (c) c.closest('dialog').close();
  if (e.target.tagName === 'DIALOG') e.target.close(); // tap outside the panel closes it
});

// ---------------------------------------------------------------- settings
function openSettings() {
  el('set-layout').value = settings.layout || 'auto';
  var W = CONFIG.wetBulbWeights;
  el('cfg-summary').innerHTML = 'Now in use:<ul>' +
    '<li>Wet-bulb weights: ' + W.map(function (p) { return p[0] + '°F → ' + (Math.round(p[1] * 100) / 100); }).join(', ') + '</li>' +
    '<li>Summit wind cut from ' + CONFIG.windCutMph + ' mph, none at ' + CONFIG.windStopMph + ' mph</li>' +
    '<li>Opening target ' + CONFIG.targetLow + '–' + CONFIG.targetHigh + ' h; ' + CONFIG.fullGpm.toLocaleString() + ' gpm; ' + CONFIG.gallonsPerAcreFoot.toLocaleString() + ' gal per acre-ft; pond ' + (CONFIG.pondGallons / 1e6) + 'M gal (' + Math.round(pondHours()) + ' h)</li>' +
    '<li>Village ' + CONFIG.sites.village.elevFt + ' ft, summit ' + CONFIG.sites.summit.elevFt + ' ft</li></ul>';
  el('diag-log').textContent = logLines.join('\n');
  openDlg('settings');
}
function saveSettings() {
  settings.layout = el('set-layout').value; store.set('jay.settings', settings);
  el('settings').close(); applyLayout(); renderAll();
}

// ---------------------------------------------------------------- refreshing
var busy = false;
async function refreshAll(force) {
  if (busy) return; busy = true; el('refresh').classList.add('spin');
  try { await loadAll(force); } finally { busy = false; el('refresh').classList.remove('spin'); }
  renderAll();
}

// ---------------------------------------------------------------- falling snow in the header (off when Reduce Motion is on)
function startSnow() {
  var cv = el('snowfall'), hdr = cv.parentNode, flakes = [], W = 0, H = 0, ctx;
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function size() {
    var r = hdr.getBoundingClientRect(); W = r.width; H = r.height; ctx = sizeCanvas(cv, W, H);
    var n = Math.round(W * H / 2600); flakes = [];
    for (var i = 0; i < n; i++) flakes.push({ x: Math.random() * W, y: Math.random() * H, r: 0.6 + Math.random() * 1.8, s: 0.15 + Math.random() * 0.45, d: Math.random() * 6.3 });
    draw();
  }
  function draw() {
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = 'rgba(255,255,255,.75)';
    flakes.forEach(function (f) { ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.3); ctx.fill(); });
  }
  function tick() {
    if (!document.hidden) {
      flakes.forEach(function (f) { f.y += f.s * (0.6 + f.r * 0.5); f.d += 0.01; f.x += Math.sin(f.d) * 0.25; if (f.y > H + 2) { f.y = -2; f.x = Math.random() * W; } });
      draw();
    }
    requestAnimationFrame(tick);
  }
  size(); window.addEventListener('resize', size);
  if (!still) requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- start-up
function start() {
  applyLayout();
  buildLinks('links-list'); buildLinks('links-dlg-list');
  initCharts();
  el('open-links').addEventListener('click', function () { openDlg('links-dlg'); });
  el('open-settings').addEventListener('click', openSettings);
  el('save-settings').addEventListener('click', saveSettings);
  el('refresh').addEventListener('click', function () { refreshAll(true); });
  var rt = null;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { applyLayout(); renderCharts(); }, 120); });
  // back to the app after a while: refresh (models at most every 30 minutes, IJAY3 every time)
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshAll(false); });
  setInterval(function () { if (!document.hidden) refreshAll(false); }, 15 * 60000);
  startSnow();
  // show the saved copy at once, then fetch
  if (omRaw) { applyOm(omRaw); deriveAll(); renderAll(); }
  refreshAll(false);
  if ('serviceWorker' in navigator && !isLocal) {
    navigator.serviceWorker.register('sw.js').catch(function (e) { log('Offline copy unavailable: ' + e.message); });
    navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.type === 'updated') el('update').hidden = false; });
    el('update-reload').addEventListener('click', function () { location.reload(); });
  }
}
start();
