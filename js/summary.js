/* Jay Snow & Weather: the main screen. Right-now wet-bulbs, snowmaking hours for the last 7 and next 7 days
   against the opening target, water (acre-feet) and the pond, a per-model table, and a day-by-day table. */
'use strict';

// trail-sign symbols for snowmaking status: green circle = full rate, blue square = part rate, red bar = too warm
var SYM = {
  full: '<svg class="sym" viewBox="0 0 16 16" aria-label="full rate"><circle cx="8" cy="8" r="6.5" fill="#1f9d4a"/></svg>',
  part: '<svg class="sym" viewBox="0 0 16 16" aria-label="part rate"><rect x="2" y="2" width="12" height="12" fill="#1f5fd1"/></svg>',
  none: '<svg class="sym" viewBox="0 0 16 16" aria-label="too warm"><circle cx="8" cy="8" r="6.5" fill="#d23b2f"/><rect x="4" y="6.8" width="8" height="2.4" fill="#fff"/></svg>',
  na: '<svg class="sym" viewBox="0 0 16 16" aria-label="no data"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".5"/></svg>'
};
var STATUS_TEXT = { full: 'Full-rate snowmaking', part: 'Marginal: part rate', none: 'Too warm to make snow', na: 'No reading' };

function fmtH(v) { return ok(v) ? (v >= 99.5 ? Math.round(v) : v.toFixed(v < 10 ? 1 : 0)) : '–'; }
function hoursFor(site, which) {
  var S = DATA.sites[site]; if (!S) return null;
  var now = Math.floor(nowSec() / HOUR) * HOUR;
  if (which === 'past') return sumHours(S.past, now - 7 * DAY, now + 1);
  var ser = which === 'avg' ? S.avg : S.models[which];
  return sumHours(ser, now, now + 7 * DAY);
}
function mountainHours(which) {
  var now = Math.floor(nowSec() / HOUR) * HOUR, v = DATA.sites.village, s = DATA.sites.summit; if (!v || !s) return null;
  var a = which === 'past' ? v.past : which === 'avg' ? v.avg : v.models[which];
  var b = which === 'past' ? s.past : which === 'avg' ? s.avg : s.models[which];
  var c = combineSites(a, b); if (!c) return null;
  return which === 'past' ? sumHours(c, now - 7 * DAY, now + 1) : sumHours(c, now, now + 7 * DAY);
}

// latest reading at a site: IJAY3 if it reported in the last 2 hours (village), otherwise the Euro for this hour
function nowAt(site) {
  var now = nowSec(), st = DATA.station;
  if (site === 'village' && st && st.t.length && now - st.t[st.t.length - 1] < 2 * HOUR) {
    var k = st.t.length - 1;
    return { src: 'IJAY3 at ' + fmtClock(st.t[k] * 1000), T: st.T[k], Tw: st.Tw[k], RH: st.RH[k], wind: st.wind[k], w: st.w[k] };
  }
  var M = DATA.sites[site] && DATA.sites[site].models[CONFIG.pastSource]; if (!M) return null;
  var best = -1, bd = Infinity;
  M.t.forEach(function (t, i) { var d = Math.abs(t - now); if (d < bd) { bd = d; best = i; } });
  if (best < 0 || bd > 2 * HOUR) return null;
  return { src: modelById(CONFIG.pastSource).label + ' model, this hour', T: M.T[best], Tw: M.Tw[best], RH: M.RH[best], wind: M.wind[best], w: M.w[best] };
}

function nowTile(site) {
  var n = nowAt(site), S = CONFIG.sites[site];
  if (!n) return '<div class="tile now-tile"><div class="k">' + S.short + '</div><div class="v">–</div></div>';
  var cls = hourClass(n.w), windy = CONFIG.windAppliesTo.indexOf(site) >= 0 && ok(n.wind) && n.wind > CONFIG.windCutMph;
  return '<div class="tile now-tile st-' + cls + '">' +
    '<div class="k">' + S.short + ' <span class="muted">' + S.elevFt.toLocaleString() + ' ft</span></div>' +
    '<div class="v">' + fmt(n.Tw, 0) + '°<small> wet-bulb</small></div>' +
    '<div class="nt">' + fmt(n.T, 0) + '°F air · ' + fmt(n.RH, 0) + '% RH' + (ok(n.wind) ? ' · ' + fmt(n.wind, 0) + ' mph' : '') + '</div>' +
    '<div class="status">' + SYM[cls] + ' ' + STATUS_TEXT[cls] + (windy ? ' (wind cuts it)' : '') + '</div>' +
    '<div class="nt muted">' + esc(n.src) + '</div></div>';
}

// a horizontal gauge: 0 .. max, the target band shaded, a pond line at ~108 h, and the hours as a filled bar
function gauge(h) {
  var pond = pondHours(), max = Math.max(pond * 1.15, (h || 0) * 1.05), pc = function (v) { return clamp(v / max * 100, 0, 100).toFixed(2) + '%'; };
  var lo = CONFIG.targetLow, hi = CONFIG.targetHigh, state = !ok(h) ? '' : h >= hi ? 'met' : h >= lo ? 'close' : 'short';
  return '<div class="gauge ' + state + '" role="img" aria-label="' + fmtH(h) + ' of ' + lo + ' to ' + hi + ' hours">' +
    '<div class="g-band" style="left:' + pc(lo) + ';width:calc(' + pc(hi) + ' - ' + pc(lo) + ')"></div>' +
    '<div class="g-fill" style="width:' + pc(h || 0) + '"></div>' +
    '<div class="g-pond" style="left:' + pc(pond) + '" title="pond empties"></div>' +
    '</div><div class="g-scale"><span>0</span><span style="left:' + pc(lo) + '">' + lo + '</span><span style="left:' + pc(hi) + '">' + hi + '</span><span class="pond-lbl" style="left:' + pc(pond) + '">pond</span></div>';
}

function windowBlock(title, which, sub) {
  var m = mountainHours(which), v = hoursFor('village', which), s = hoursFor('summit', which), h = m ? m.hours : null, wtr = water(h);
  var lo = CONFIG.targetLow, hi = CONFIG.targetHigh;
  var verdict = !ok(h) ? 'No data yet.' : h >= hi ? 'Enough for a minimal opening (' + lo + '–' + hi + ' h).' :
    h >= lo ? 'In the range for a minimal opening (' + lo + '–' + hi + ' h).' : Math.ceil(lo - h) + ' h short of the ' + lo + '–' + hi + ' h opening target.';
  var cover = m && m.have < m.of * 0.9 ? '<p class="small warn">Only ' + m.have + ' of ' + m.of + ' hours have data.</p>' : '';
  var pondWarn = ok(h) && h >= pondHours() ? '<p class="pond-warn">' + SYM.none + ' Over ' + Math.round(pondHours()) + ' hours at full flow: the 13-million-gallon pond would need to refill.</p>' : '';
  return '<div class="win">' +
    '<div class="win-h"><span>' + title + '</span><span class="muted small">' + sub + '</span></div>' +
    '<div class="win-big"><span class="big">' + fmtH(h) + '</span><span class="unit">hours</span>' +
    '<span class="af">' + (wtr ? '≈ ' + wtr.acreFeet.toFixed(0) + ' acre-ft' : '') + '</span></div>' +
    gauge(h) +
    '<div class="win-sites"><span>Village <b>' + fmtH(v && v.hours) + ' h</b></span><span>Summit <b>' + fmtH(s && s.hours) + ' h</b></span>' +
    (wtr ? '<span>' + (wtr.gallons / 1e6).toFixed(1) + 'M gal</span>' : '') + '</div>' +
    '<p class="small verdict">' + verdict + '</p>' + pondWarn + cover + '</div>';
}

function modelTable() {
  var rows = [['avg', 'Model average', null]].concat(CONFIG.models.map(function (m) { return [m.id, m.label + (m.short ? ' <span class="muted">(' + m.hours + ' h)</span>' : ''), m.color]; }));
  var body = rows.map(function (r) {
    var v = hoursFor('village', r[0]), s = hoursFor('summit', r[0]), m = mountainHours(r[0]), w = water(m && m.hours);
    if (r[0] !== 'avg' && !(DATA.sites.summit && DATA.sites.summit.models[r[0]])) return '';
    return '<tr' + (r[0] === 'avg' ? ' class="avg"' : '') + '><td>' + (r[2] ? '<i class="sw" style="background:' + r[2] + '"></i>' : '') + r[1] + '</td><td>' + fmtH(v && v.hours) + '</td><td>' + fmtH(s && s.hours) + '</td><td>' + fmtH(m && m.hours) + '</td><td>' + (w ? w.acreFeet.toFixed(0) : '–') + '</td></tr>';
  }).join('');
  return '<table class="mt"><thead><tr><th>Next 7 days</th><th>Village</th><th>Summit</th><th>Mountain</th><th>Acre-ft</th></tr></thead><tbody>' + body + '</tbody></table>' +
    '<p class="small muted">Hours are weighted: under ' + CONFIG.wetBulbWeights[3][0] + '°F wet-bulb counts a full hour, about ' + CONFIG.wetBulbWeights[2][0] + '°F two thirds, about ' + CONFIG.wetBulbWeights[1][0] + '°F a third, ' + CONFIG.wetBulbWeights[0][0] + '°F or warmer none. ' +
    'Summit wind over ' + CONFIG.windCutMph + ' mph cuts its hours, to none at ' + CONFIG.windStopMph + ' mph. "Mountain" counts an hour when either elevation can make snow (the pumps run either way). RRFS runs only ' + modelById('rrfs').hours + ' hours, so its total covers less time.</p>';
}

function dayTable() {
  var v = DATA.sites.village, s = DATA.sites.summit; if (!v || !s) return '';
  var today = localDayStart(nowSec()), now = nowSec(), rows = [];
  function day(ser, a, b) { // hours and lowest wet-bulb for one day
    if (!ser) return null; var h = 0, n = 0, lo = Infinity;
    for (var i = 0; i < ser.t.length; i++) { var t = ser.t[i]; if (t < a || t >= b || !ok(ser.w[i])) continue; h += ser.w[i]; n++; if (ok(ser.Tw[i])) lo = Math.min(lo, ser.Tw[i]); }
    return n ? { h: h, lo: lo === Infinity ? null : lo, n: n } : null;
  }
  function cell(d) {
    if (!d) return '<td class="muted">–</td>';
    var cls = d.h >= 12 ? 'full' : d.h > 0.05 ? 'part' : 'none', a = clamp(d.h / 24, 0, 1);
    return '<td><span class="dh" style="--a:' + a.toFixed(2) + '">' + SYM[cls] + fmtH(d.h) + '</span>' +
      (ok(d.lo) ? '<span class="lo" style="background:' + tempColor(d.lo) + '">' + Math.round(d.lo) + '°</span>' : '') + '</td>';
  }
  for (var n = -7; n < 7; n++) {
    var a = today + n * DAY, b = a + DAY, past = b <= now, isToday = n === 0;
    // today: the part already gone from what happened, the rest from the model average
    var vd, sd;
    if (isToday) {
      vd = merge(day(v.past, a, now), day(v.avg, now, b)); sd = merge(day(s.past, a, now), day(s.avg, now, b));
    } else { vd = day(past ? v.past : v.avg, a, b); sd = day(past ? s.past : s.avg, a, b); }
    rows.push('<tr class="' + (past ? 'past' : isToday ? 'today' : 'fut') + '"><td>' + (isToday ? 'Today' : new Date(a * 1000).toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' })) + '</td>' + cell(vd) + cell(sd) + '</tr>');
    if (n === -1) rows.push('<tr class="divider"><td colspan="3">Forecast (model average) ↓</td></tr>');
  }
  function merge(x, y) { if (!x) return y; if (!y) return x; return { h: x.h + y.h, lo: Math.min(ok(x.lo) ? x.lo : Infinity, ok(y.lo) ? y.lo : Infinity), n: x.n + y.n }; }
  return '<table class="days"><thead><tr><th></th><th>Village</th><th>Summit</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>' +
    '<p class="small muted legend-row">' + SYM.full + ' 12 h or more ' + SYM.part + ' some ' + SYM.none + ' none. The colored chip is the day\'s lowest wet-bulb (Tropical Tidbits temperature colors).</p>';
}

function renderSummary() {
  var box = el('summary-body');
  if (!DATA.sites.summit) { box.innerHTML = '<p class="muted">' + esc(DATA.modelMsg || 'Loading…') + '</p>'; return; }
  var pastNote = DATA.station ? 'Village: IJAY3 readings (Euro where it has gaps). Summit: Euro.' : 'From the Euro model at each elevation.';
  box.innerHTML =
    (DATA.modelMsg ? '<p class="small warn">' + esc(DATA.modelMsg) + '</p>' : '') +
    '<div class="tiles now-tiles">' + nowTile('village') + nowTile('summit') + '</div>' +
    '<div class="wins">' + windowBlock('Last 7 days', 'past', pastNote) + windowBlock('Next 7 days', 'avg', 'Average of Euro, GFS, Euro AI and GFS AI') + '</div>' +
    (DATA.stationMsg ? '<p class="small muted">' + esc(DATA.stationMsg) + '</p>' : '');
  el('models-body').innerHTML = modelTable();
  el('days-body').innerHTML = dayTable();
  el('updated').textContent = DATA.fetchedAt ? 'Updated ' + fmtClock(DATA.fetchedAt) : '';
}
