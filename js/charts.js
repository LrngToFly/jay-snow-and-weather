/* Jay Snow & Weather: charts. Wet-bulb by model (past 7 days and next 7), one model in detail (temperature,
   dew point, wet-bulb, precipitation in in/hr), and the inversion chart (village, summit, 925 and 850 hPa). */
'use strict';

var chartState = store.get('jay.charts', { site: 'summit', model: 'ecmwf', invModel: 'gfs' });
var hover = { wb: null, det: null, inv: null };

// value of a series at time t (exact hour), via a per-series index
function at(ser, key, t) {
  if (!ser) return null;
  if (!ser._ix) { ser._ix = {}; ser.t.forEach(function (tt, i) { ser._ix[tt] = i; }); }
  var i = ser._ix[t]; return i === undefined ? null : ser[key][i];
}

// generic time chart. o: { cv, H, t0, t1, lines:[{ser,key,color,width,dash,from,to}], bars:{ser,key,colorFn,max}, bands:[[lo,hi,color]],
//   ref:[[v,color,label]], shade:fn(t)->color|null, hoverT, readout:fn(t)->[title, [color,text]...], yUnit }
function drawTimeChart(o) {
  var cv = o.cv, wrap = cv.parentNode, W = Math.floor(wrap.getBoundingClientRect().width) || 340, H = o.H || 210;
  var ctx = sizeCanvas(cv, W, H); ctx.clearRect(0, 0, W, H);
  var tc = cssVar('--muted', '#667'), line = cssVar('--line', '#ddd'), now = nowSec();
  var L = 32, R = o.bars ? 34 : 8, T = 18, B = 18, pw = W - L - R, ph = H - T - B;
  var lo = Infinity, hi = -Infinity;
  o.lines.forEach(function (l) { if (!l.ser) return; l.ser.t.forEach(function (t, i) { if (t < o.t0 || t > o.t1) return; var v = l.ser[l.key][i]; if (ok(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }); });
  if (lo === Infinity) { lo = 10; hi = 40; }
  (o.keep || []).forEach(function (v) { lo = Math.min(lo, v); hi = Math.max(hi, v); });
  lo = Math.floor((lo - 2) / 10) * 10; hi = Math.ceil((hi + 2) / 10) * 10;
  function X(t) { return L + (t - o.t0) / (o.t1 - o.t0) * pw; }
  function Y(v) { return T + (1 - (v - lo) / (hi - lo)) * ph; }
  // shaded time spans (e.g. inversion hours)
  if (o.shade) { for (var st = Math.ceil(o.t0 / HOUR) * HOUR; st < o.t1; st += HOUR) { var c = o.shade(st); if (c) { ctx.fillStyle = c; ctx.fillRect(X(st), T, Math.max(1, X(st + HOUR) - X(st)), ph); } } }
  // wet-bulb bands
  (o.bands || []).forEach(function (b) {
    var y1 = Y(clamp(b[1], lo, hi)), y0 = Y(clamp(b[0], lo, hi)); if (y0 - y1 <= 0) return;
    ctx.fillStyle = b[2]; ctx.fillRect(L, y1, pw, y0 - y1);
  });
  ctx.font = '10px -apple-system, system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  var step = hi - lo > 60 ? 20 : 10;
  for (var g = lo; g <= hi; g += step) { ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, Y(g)); ctx.lineTo(W - R, Y(g)); ctx.stroke(); ctx.fillStyle = tc; ctx.fillText(g + '°', L - 4, Y(g)); }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  for (var d = localDayStart(o.t0) + DAY; d < o.t1; d += DAY) {
    ctx.strokeStyle = line; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(d), T); ctx.lineTo(X(d), H - B); ctx.stroke(); ctx.setLineDash([]);
    var dw = X(d + DAY) - X(d);
    if (dw >= 12 && X(d) + 8 < W - R) { ctx.fillStyle = tc; ctx.fillText(new Date(d * 1000).toLocaleDateString([], { weekday: dw > 34 ? 'short' : 'narrow' }), X(d) + 2, 11); }
  }
  // precipitation bars on the right axis (in/hr)
  if (o.bars && o.bars.ser) {
    var bs = o.bars.ser, bmax = 0.05;
    bs.t.forEach(function (t, i) { if (t >= o.t0 && t <= o.t1 && ok(bs[o.bars.key][i])) bmax = Math.max(bmax, bs[o.bars.key][i]); });
    bmax = bmax <= 0.05 ? 0.05 : bmax <= 0.1 ? 0.1 : bmax <= 0.2 ? 0.2 : Math.ceil(bmax * 4) / 4;
    var bh = ph * 0.45, bw = Math.max(1.4, pw / ((o.t1 - o.t0) / HOUR) * 0.8);
    bs.t.forEach(function (t, i) {
      var v = bs[o.bars.key][i]; if (t < o.t0 || t > o.t1 || !ok(v) || v <= 0.001) return;
      var h = v / bmax * bh; ctx.fillStyle = o.bars.colorFn(i); ctx.fillRect(X(t) - bw, H - B - h, bw, h);
    });
    ctx.fillStyle = tc; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(bmax.toFixed(2), W - R + 3, H - B - bh); ctx.fillText('in/hr', W - R + 3, H - B - bh + 12); ctx.fillText('0', W - R + 3, H - B);
    ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(W - R, H - B - bh); ctx.lineTo(W - R + 3, H - B - bh); ctx.stroke();
    ctx.textBaseline = 'alphabetic';
  }
  // reference lines (32 °F)
  (o.ref || []).forEach(function (r) {
    if (r[0] <= lo || r[0] >= hi) return;
    ctx.strokeStyle = r[1]; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(L, Y(r[0])); ctx.lineTo(W - R, Y(r[0])); ctx.stroke(); ctx.setLineDash([]);
    if (r[2]) { ctx.fillStyle = r[1]; ctx.font = '600 10px -apple-system, system-ui, sans-serif'; ctx.fillText(r[2], L + 3, Y(r[0]) - 3); ctx.font = '10px -apple-system, system-ui, sans-serif'; }
  });
  // lines
  o.lines.forEach(function (l) {
    if (!l.ser) return;
    ctx.strokeStyle = l.color; ctx.lineWidth = l.width || 1.6; ctx.lineJoin = 'round'; ctx.setLineDash(l.dash || []); ctx.globalAlpha = l.alpha || 1;
    ctx.beginPath(); var pen = false, lastT = null;
    l.ser.t.forEach(function (t, i) {
      var v = l.ser[l.key][i];
      if (t < Math.max(o.t0, l.from || -Infinity) || t > Math.min(o.t1, l.to || Infinity) || !ok(v)) { pen = false; return; }
      if (lastT !== null && t - lastT > 3 * HOUR) pen = false;
      if (!pen) { ctx.moveTo(X(t), Y(v)); pen = true; } else ctx.lineTo(X(t), Y(v)); lastT = t;
    });
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  });
  // now
  if (now > o.t0 && now < o.t1) {
    ctx.strokeStyle = tc; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(now), T); ctx.lineTo(X(now), H - B); ctx.stroke();
    ctx.fillStyle = tc; ctx.textAlign = 'center'; ctx.fillText('now', X(now), H - 5); ctx.textAlign = 'left';
  }
  cv._geo = { L: L, R: R, W: W, t0: o.t0, t1: o.t1 };
  if (o.hoverT !== null && o.hoverT !== undefined && o.readout) {
    var ht = Math.round(o.hoverT / HOUR) * HOUR, hx = X(ht);
    ctx.strokeStyle = tc; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx, T); ctx.lineTo(hx, H - B); ctx.stroke();
    o.lines.forEach(function (l) { var v = at(l.ser, l.key, ht); if (ok(v) && !(l.from && ht < l.from) && !(l.to && ht > l.to)) { ctx.fillStyle = l.color; ctx.beginPath(); ctx.arc(hx, Y(v), 3.2, 0, 6.3); ctx.fill(); } });
    readoutBox(ctx, W, hx, T + 4, o.readout(ht));
  }
}
function hookHover(cv, key, redraw) {
  tapReadout(cv, function (e) {
    var g = cv._geo; if (!g) return;
    var x = e.clientX - cv.getBoundingClientRect().left;
    hover[key] = g.t0 + clamp((x - g.L) / (g.W - g.L - g.R), 0, 1) * (g.t1 - g.t0); redraw();
  }, function () { if (hover[key] !== null) { hover[key] = null; redraw(); } }, function () { return hover[key] !== null; });
}
function wbBands() {
  var P = CONFIG.wetBulbWeights;
  return [[-100, P[3][0], 'rgba(70,140,255,.16)'], [P[3][0], P[0][0], 'rgba(70,140,255,.07)']];
}
function window14() { var now = nowSec(); return { t0: Math.floor(now / HOUR) * HOUR - 7 * DAY, t1: Math.floor(now / HOUR) * HOUR + 7 * DAY }; }

// ---------------------------------------------------------------- tabs
function segButtons(boxId, items, cur, onPick) {
  var box = el(boxId); box.innerHTML = '';
  items.forEach(function (it) {
    var b = mkEl('button', 'tab' + (it[0] === cur ? ' on' : ''), it[1]); b.type = 'button';
    b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', it[0] === cur ? 'true' : 'false');
    b.addEventListener('click', function () { if (it[0] !== cur) onPick(it[0]); });
    box.appendChild(b);
  });
}
function buildChartTabs() {
  var sites = SITE_IDS.map(function (s) { return [s, CONFIG.sites[s].short + ' ' + CONFIG.sites[s].elevFt.toLocaleString() + ' ft']; });
  segButtons('site-seg', sites, chartState.site, function (v) { chartState.site = v; store.set('jay.charts', chartState); buildChartTabs(); renderCharts(); });
  var ms = CONFIG.models.map(function (m) { return [m.id, m.label]; });
  segButtons('model-seg', ms, chartState.model, function (v) { chartState.model = v; store.set('jay.charts', chartState); buildChartTabs(); renderCharts(); });
  segButtons('inv-seg', ms, chartState.invModel, function (v) { chartState.invModel = v; store.set('jay.charts', chartState); buildChartTabs(); renderCharts(); });
}

// ---------------------------------------------------------------- 1. wet-bulb, every model
function renderWb() {
  var S = DATA.sites[chartState.site]; if (!S) return;
  var w = window14(), now = nowSec(), lines = [];
  CONFIG.models.forEach(function (m) { var s = S.models[m.id]; if (s) lines.push({ ser: s, key: 'Tw', color: m.color, width: 1.5, from: now - HOUR, label: m.label }); });
  if (S.past) lines.push({ ser: S.past, key: 'Tw', color: cssVar('--text', '#123'), width: 2.4, to: now, label: chartState.site === 'village' && DATA.station ? 'IJAY3' : 'Past (Euro)' });
  drawTimeChart({
    cv: el('wb-chart'), H: 220, t0: w.t0, t1: w.t1, lines: lines, bands: wbBands(), keep: [CONFIG.wetBulbWeights[0][0]],
    ref: [[CONFIG.freezeF, 'rgba(0,170,210,.9)', '32°']], hoverT: hover.wb,
    readout: function (t) {
      var out = [fmtHour(t)];
      lines.forEach(function (l) { var v = at(l.ser, 'Tw', t); if (ok(v) && !(l.to && t > l.to) && !(l.from && t < l.from)) out.push([l.color, l.label + ': ' + v.toFixed(1) + '°']); });
      return out;
    }
  });
  el('wb-leg').innerHTML = lines.map(function (l) { return '<span><i style="background:' + l.color + '"></i>' + esc(l.label) + '</span>'; }).join('') +
    '<span><i class="band-k"></i>under ' + CONFIG.wetBulbWeights[3][0] + '° full rate</span>';
}

// ---------------------------------------------------------------- 2. one model in detail
function renderDetail() {
  var S = DATA.sites[chartState.site]; if (!S) return;
  var m = modelById(chartState.model), s = S.models[m.id], w = window14(), note = el('det-note');
  if (!s) { drawTimeChart({ cv: el('det-chart'), t0: w.t0, t1: w.t1, lines: [] }); note.textContent = m.label + ' is not available right now.'; return; }
  var lines = [
    { ser: s, key: 'T', color: '#f59e42', width: 2, label: 'Temperature' },
    { ser: s, key: 'Td', color: '#3fa34d', width: 1.4, label: 'Dew point' },
    { ser: s, key: 'Tw', color: '#3b6fe0', width: 2, label: 'Wet-bulb' }
  ];
  drawTimeChart({
    cv: el('det-chart'), H: 230, t0: w.t0, t1: w.t1, lines: lines, bands: wbBands(), ref: [[CONFIG.freezeF, 'rgba(0,170,210,.9)', '32°']], hoverT: hover.det,
    bars: { ser: s, key: 'pr', colorFn: function (i) { return rateColor(s.pr[i], (s.sn[i] || 0) > 0 || s.T[i] <= 32); } },
    readout: function (t) {
      at(s, 'T', t); var i = s._ix[t]; if (i === undefined) return [fmtHour(t)];
      return [fmtHour(t), ['#f59e42', 'Temp ' + fmt(s.T[i], 1) + '°F'], ['#3fa34d', 'Dew point ' + fmt(s.Td[i], 1) + '°'], ['#3b6fe0', 'Wet-bulb ' + fmt(s.Tw[i], 1) + '°'],
        [rateColor(s.pr[i] || 0, (s.sn[i] || 0) > 0), 'Precip ' + fmt(s.pr[i], 2) + ' in/hr' + ((s.sn[i] || 0) > 0 ? ' (snow)' : '')],
        ['#8899aa', 'Wind ' + fmt(s.wind[i], 0) + ' mph' + (ok(s.gust[i]) ? ', gusts ' + fmt(s.gust[i], 0) : '')],
        ['#1f9d4a', 'Snowmaking ' + (ok(s.w[i]) ? Math.round(s.w[i] * 60) + ' min' : '–')]];
    }
  });
  el('det-leg').innerHTML = lines.map(function (l) { return '<span><i style="background:' + l.color + '"></i>' + l.label + '</span>'; }).join('') +
    '<span><i style="background:' + RATE_C[3] + '"></i>rain</span><span><i style="background:' + SNOWR_C[4] + '"></i>snow (in/hr)</span>';
  note.textContent = m.name + ' at ' + CONFIG.sites[chartState.site].elevFt.toLocaleString() + ' ft.' + (m.sixHourly ? ' This model has 6-hour steps; the hours between are filled in by Open-Meteo.' : '') +
    (s.rhFromLevels ? ' It has no 2 m humidity, so humidity comes from its 1000, 925 and 850 hPa levels at the site\'s pressure.' : '') +
    ' Past days are the start of each recent run.';
}

// ---------------------------------------------------------------- 3. inversion
function renderInv() {
  var m = modelById(chartState.invModel), v = DATA.sites.village && DATA.sites.village.models[m.id], s = DATA.sites.summit && DATA.sites.summit.models[m.id], w = window14();
  var lines = [
    { ser: v, key: 'T', color: '#e8553e', width: 2, label: 'Village ' + CONFIG.sites.village.elevFt.toLocaleString() + ' ft' },
    { ser: s, key: 'T', color: '#3b6fe0', width: 2, label: 'Summit ' + CONFIG.sites.summit.elevFt.toLocaleString() + ' ft' },
    { ser: s, key: 't925', color: '#9a7b4f', width: 1.2, dash: [4, 3], label: '925 hPa (~2,500 ft)' },
    { ser: s, key: 't850', color: '#7a5ac8', width: 1.2, dash: [4, 3], label: '850 hPa (~4,800 ft)' }
  ];
  var invHours = 0, nowT = nowSec();
  function isInv(t) { var a = at(v, 'T', t), b = at(s, 'T', t); return ok(a) && ok(b) && b > a; }
  if (v && s) v.t.forEach(function (t) { if (t >= nowT && t < nowT + 7 * DAY && isInv(t)) invHours++; });
  drawTimeChart({
    cv: el('inv-chart'), H: 210, t0: w.t0, t1: w.t1, lines: lines, ref: [[CONFIG.freezeF, 'rgba(0,170,210,.9)', '32°']], hoverT: hover.inv,
    shade: function (t) { return isInv(t) ? 'rgba(232,85,62,.13)' : null; },
    readout: function (t) {
      var out = [fmtHour(t)];
      lines.forEach(function (l) { var x = at(l.ser, l.key, t); if (ok(x)) out.push([l.color, l.label + ': ' + x.toFixed(1) + '°']); });
      if (isInv(t)) out.push(['#e8553e', 'Inversion: summit warmer']);
      return out;
    }
  });
  el('inv-leg').innerHTML = lines.map(function (l) { return '<span><i style="background:' + l.color + '"></i>' + l.label + '</span>'; }).join('') + '<span><i style="background:rgba(232,85,62,.3)"></i>summit warmer than village</span>';
  el('inv-note').textContent = !v || !s ? m.label + ' is not available right now.' :
    m.name + ': ' + (invHours ? invHours + ' hours in the next 7 days with the summit warmer than the village (cold air pooled in the valley).' : 'no hours in the next 7 days with the summit warmer than the village.') +
    ' Both elevations come from the same model grid cell, corrected for height, so a shallow valley inversion can be missed; the 925 and 850 hPa lines are the free air above Jay.';
}

function renderCharts() { if (!DATA.sites.summit) return; renderWb(); renderDetail(); renderInv(); }
function initCharts() {
  buildChartTabs();
  hookHover(el('wb-chart'), 'wb', renderWb); hookHover(el('det-chart'), 'det', renderDetail); hookHover(el('inv-chart'), 'inv', renderInv);
}
