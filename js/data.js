/* Jay Snow & Weather: downloads. One Open-Meteo request per elevation carries all five models, the past 7 days
   and the next 7. IJAY3's readings come from the file the GitHub Action keeps on the "data" branch. */
'use strict';

var OM_VARS = ['temperature_2m', 'relative_humidity_2m', 'dew_point_2m', 'precipitation', 'snowfall', 'wind_speed_10m', 'wind_gusts_10m',
  'temperature_925hPa', 'temperature_850hPa', 'relative_humidity_1000hPa', 'relative_humidity_925hPa', 'relative_humidity_850hPa', 'surface_pressure'];
var SITE_IDS = ['village', 'summit'];
var DATA = { sites: {}, fetchedAt: 0, station: null, stationMsg: '' };
var omRaw = store.get('jay.om', null);   // last good Open-Meteo answers, so the app opens with something while offline

function omUrl(site) {
  var S = CONFIG.sites[site];
  return OM_BASE + '?latitude=' + S.lat + '&longitude=' + S.lon + '&elevation=' + Math.round(S.elevFt * FT2M) +
    '&hourly=' + OM_VARS.join(',') + '&models=' + CONFIG.models.map(function (m) { return m.om; }).join(',') +
    '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timeformat=unixtime&timezone=GMT&past_days=7&forecast_days=8';
}

// one model's hourly series at one site, with wet-bulb and snowmaking weight worked out
function buildSeries(site, h, om, noRh) {
  function g(v) { return h[v + '_' + om] || h[v] || null; }
  var T = g('temperature_2m'); if (!T || !T.some(ok)) return null;
  var elevM = CONFIG.sites[site].elevFt * FT2M, P = g('surface_pressure') || [], RH = g('relative_humidity_2m') || [], TD = g('dew_point_2m') || [];
  var r1000 = g('relative_humidity_1000hPa') || [], r925 = g('relative_humidity_925hPa') || [], r850 = g('relative_humidity_850hPa') || [];
  var s = { t: [], T: [], RH: [], Td: [], Tw: [], pr: [], sn: [], wind: [], gust: [], t925: [], t850: [], p: [], w: [], rhFromLevels: false };
  var pr = g('precipitation') || [], sn = g('snowfall') || [], ws = g('wind_speed_10m') || [], wg = g('wind_gusts_10m') || [], a925 = g('temperature_925hPa') || [], a850 = g('temperature_850hPa') || [];
  for (var i = 0; i < h.time.length; i++) {
    var t = T[i]; if (!ok(t)) continue;
    var p = ok(P[i]) ? P[i] : stdPressure(elevM), rh = RH[i];
    if (!ok(rh) && ok(TD[i])) rh = rhFromDew(t, TD[i]);
    if (!ok(rh)) { rh = rhAtPressure(p, [[1000, r1000[i]], [925, r925[i]], [850, r850[i]]]); if (ok(rh)) s.rhFromLevels = true; }
    var tw = wetBulbF(t, rh, p);
    s.t.push(h.time[i]); s.T.push(t); s.RH.push(ok(rh) ? rh : null); s.Td.push(ok(TD[i]) ? TD[i] : dewPointF(t, rh)); s.Tw.push(tw);
    s.pr.push(num(pr[i])); s.sn.push(num(sn[i])); s.wind.push(num(ws[i])); s.gust.push(num(wg[i]));
    s.t925.push(num(a925[i])); s.t850.push(num(a850[i])); s.p.push(p);
    s.w.push(siteHourWeight(site, tw, ws[i]));
  }
  return s.t.length ? s : null;
}

// IJAY3 readings (from the Action's file) as an hourly series. Each reading covers the hour before its time.
function stationSeries(j) {
  var s = { t: [], T: [], RH: [], Td: [], Tw: [], pr: [], wind: [], gust: [], w: [] }, seen = {};
  var p = stdPressure(CONFIG.sites.village.elevFt * FT2M);
  (j.obs || []).forEach(function (o) {
    var t = Math.round(o[0] / HOUR) * HOUR; if (seen[t]) return; seen[t] = 1;
    var T = num(o[1]), Td = num(o[2]), rh = num(o[3]); if (!ok(T)) return;
    if (!ok(rh) && ok(Td)) rh = rhFromDew(T, Td);
    var tw = wetBulbF(T, rh, p);
    s.t.push(t); s.T.push(T); s.Td.push(ok(Td) ? Td : dewPointF(T, rh)); s.RH.push(rh); s.Tw.push(tw);
    s.wind.push(num(o[4])); s.gust.push(num(o[5])); s.pr.push(num(o[6]));
    s.w.push(siteHourWeight('village', tw, o[4]));
  });
  var idx = s.t.map(function (_, i) { return i; }).sort(function (a, b) { return s.t[a] - s.t[b]; });
  Object.keys(s).forEach(function (k) { var arr = s[k]; s[k] = idx.map(function (i) { return arr[i]; }); });
  return s.t.length ? s : null;
}

// "what happened" for the last 7 days: IJAY3 where it reported, otherwise the past model
function pastSeries(site) {
  var P = DATA.sites[site] && DATA.sites[site].models[CONFIG.pastSource], obs = site === 'village' ? DATA.station : null;
  if (!P && !obs) return null;
  var now = nowSec(), a = Math.floor(now / HOUR) * HOUR - 7 * DAY, out = { t: [], Tw: [], T: [], w: [], src: [] }, oi = {};
  if (obs) obs.t.forEach(function (t, i) { oi[t] = i; });
  var pi = {}; if (P) P.t.forEach(function (t, i) { pi[t] = i; });
  for (var t = a; t < now; t += HOUR) {
    if (oi[t] !== undefined && ok(obs.w[oi[t]])) { var k = oi[t]; out.t.push(t); out.Tw.push(obs.Tw[k]); out.T.push(obs.T[k]); out.w.push(obs.w[k]); out.src.push('obs'); }
    else if (pi[t] !== undefined) { var j = pi[t]; out.t.push(t); out.Tw.push(P.Tw[j]); out.T.push(P.T[j]); out.w.push(P.w[j]); out.src.push('model'); }
  }
  return out.t.length ? out : null;
}
// the model average (CONFIG.consensus), hour by hour, for the hours most of them cover
function consensusSeries(site) {
  var ms = CONFIG.consensus.map(function (id) { return DATA.sites[site] && DATA.sites[site].models[id]; }).filter(Boolean);
  if (!ms.length) return null;
  var acc = {};
  ms.forEach(function (m) { m.t.forEach(function (t, i) { var a = acc[t] || (acc[t] = { w: 0, tw: 0, n: 0 }); if (ok(m.w[i])) { a.w += m.w[i]; a.tw += m.Tw[i]; a.n++; } }); });
  var need = Math.ceil(ms.length / 2), out = { t: [], w: [], Tw: [], n: ms.length };
  Object.keys(acc).map(Number).sort(function (a, b) { return a - b; }).forEach(function (t) {
    var a = acc[t]; if (a.n < need) return; out.t.push(t); out.w.push(a.w / a.n); out.Tw.push(a.tw / a.n);
  });
  return out;
}

function applyOm(raw) {
  SITE_IDS.forEach(function (site) {
    var j = raw[site]; if (!j || !j.hourly) return;
    var models = {};
    CONFIG.models.forEach(function (m) { var s = buildSeries(site, j.hourly, m.om, m.noRh); if (s) models[m.id] = s; });
    DATA.sites[site] = { models: models };
  });
  DATA.fetchedAt = raw.at || 0;
}
function deriveAll() {
  SITE_IDS.forEach(function (site) {
    var S = DATA.sites[site]; if (!S) return;
    S.past = pastSeries(site); S.avg = consensusSeries(site);
  });
}

async function loadModels(force) {
  if (!force && omRaw && Date.now() - omRaw.at < 30 * 60000) { applyOm(omRaw); return true; }
  try {
    var both = await Promise.all(SITE_IDS.map(function (s) { return omFetch(omUrl(s)); }));
    omRaw = { at: Date.now(), village: both[0], summit: both[1] };
    store.set('jay.om', omRaw);
    applyOm(omRaw); DATA.modelMsg = '';
    log('Open-Meteo OK (' + Object.keys(DATA.sites.summit.models).join(', ') + ')');
    return true;
  } catch (e) {
    log('Open-Meteo failed: ' + friendlyError(e));
    if (omRaw) applyOm(omRaw);
    DATA.modelMsg = 'Could not load the forecasts: ' + friendlyError(e) + (omRaw ? ' Showing the copy from ' + fmtClock(omRaw.at) + '.' : '');
    return false;
  }
}
async function loadStation() {
  var urls = isLocal ? [CONFIG.stationUrlLocal, CONFIG.stationUrl] : [CONFIG.stationUrl];
  for (var i = 0; i < urls.length; i++) {
    try {
      var r = await fetch(urls[i] + '?t=' + Math.floor(Date.now() / 300000), { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var j = await r.json();
      DATA.station = stationSeries(j); DATA.stationInfo = j;
      var age = j.updated ? (Date.now() / 1000 - j.updated) / 3600 : null;
      DATA.stationMsg = !DATA.station ? 'IJAY3 has no readings in the saved file yet.' :
        age !== null && age > 3 ? 'IJAY3 readings were last saved ' + Math.round(age) + ' hours ago; check the GitHub Action.' : '';
      log('IJAY3 file OK from ' + urls[i] + ' (' + (DATA.station ? DATA.station.t.length : 0) + ' hours)');
      return;
    } catch (e) { log('IJAY3 file ' + urls[i] + ': ' + friendlyError(e)); }
  }
  DATA.station = null;
  DATA.stationMsg = 'IJAY3 readings aren\'t available yet (the GitHub Action saves them once its API key is set up), so the village\'s past 7 days use the Euro instead.';
}
async function loadAll(force) {
  await Promise.all([loadModels(force), loadStation()]);
  deriveAll();
}
