/* Jay Snow & Weather: wet-bulb and snowmaking math. No page code here, so it can be checked on its own
   (node tests/snow.test.js). All thresholds come from CONFIG in config.js. */
'use strict';

function fToC(f) { return (f - 32) * 5 / 9; }
function cToF(c) { return c * 9 / 5 + 32; }
// standard-atmosphere pressure (hPa) at an elevation (m); used when a source gives no pressure
function stdPressure(m) { return 1013.25 * Math.pow(1 - 2.25577e-5 * m, 5.25588); }
// saturation vapour pressure over water (hPa), Magnus / Bolton
function satVp(c) { return 6.112 * Math.exp(17.67 * c / (c + 243.5)); }
function dewPointF(tF, rh) {
  if (!ok(tF) || !ok(rh) || rh <= 0) return null;
  var c = fToC(tF), g = Math.log(Math.min(rh, 100) / 100) + 17.67 * c / (c + 243.5);
  return cToF(243.5 * g / (17.67 - g));
}
function rhFromDew(tF, dF) {
  if (!ok(tF) || !ok(dF)) return null;
  return clamp(100 * satVp(fToC(dF)) / satVp(fToC(tF)), 1, 100);
}

// Wet-bulb temperature (°F) from air temperature (°F), relative humidity (%) and pressure (hPa).
// Solves the psychrometric equation e = es(Tw) - A·p·(T - Tw) by bisection, so it accounts for the lower pressure
// on the summit (about 875 hPa), which makes the wet-bulb a little lower than at sea level for the same air.
function wetBulbF(tF, rh, p) {
  if (!ok(tF) || !ok(rh)) return null;
  if (!ok(p)) p = 1013.25;
  var T = fToC(tF), e = clamp(rh, 1, 100) / 100 * satVp(T);
  var lo = -80, hi = T;
  for (var i = 0; i < 40; i++) {
    var tw = (lo + hi) / 2;
    var f = satVp(tw) - 6.6e-4 * (1 + 0.00115 * tw) * p * (T - tw) - e;
    if (f > 0) hi = tw; else lo = tw;
  }
  return cToF((lo + hi) / 2);
}

// Relative humidity at a site's pressure from the model's pressure levels (for GFS AI, which has no 2 m humidity).
// levels: [[hPa, RH], ...]; interpolated in log-pressure, held at the end levels.
function rhAtPressure(p, levels) {
  var L = levels.filter(function (l) { return ok(l[1]); }).sort(function (a, b) { return b[0] - a[0]; });
  if (!L.length) return null;
  if (p >= L[0][0]) return L[0][1];
  for (var i = 0; i < L.length - 1; i++) {
    var a = L[i], b = L[i + 1];
    if (p <= a[0] && p >= b[0]) { var f = Math.log(a[0] / p) / Math.log(a[0] / b[0]); return a[1] + (b[1] - a[1]) * f; }
  }
  return L[L.length - 1][1];
}

// Weight of one hour of snowmaking (0 to 1) from the wet-bulb (°F), following CONFIG.wetBulbWeights.
function hourWeight(tw) {
  if (!ok(tw)) return null;
  var P = CONFIG.wetBulbWeights; // warmest first
  if (tw >= P[0][0]) return P[0][1];
  for (var i = 0; i < P.length - 1; i++) {
    var a = P[i], b = P[i + 1];
    if (tw <= a[0] && tw >= b[0]) return a[1] + (b[1] - a[1]) * (a[0] - tw) / (a[0] - b[0]);
  }
  return P[P.length - 1][1];
}
// Share of the hour left after wind (1 = no cut).
function windFactor(mph) {
  if (!ok(mph) || mph <= CONFIG.windCutMph) return 1;
  if (mph >= CONFIG.windStopMph) return 0;
  return 1 - (mph - CONFIG.windCutMph) / (CONFIG.windStopMph - CONFIG.windCutMph);
}
function siteHourWeight(site, tw, windMph) {
  var w = hourWeight(tw); if (w === null) return null;
  if (CONFIG.windAppliesTo.indexOf(site) >= 0) w *= windFactor(windMph);
  return w;
}
// status for one hour, shown with ski-trail symbols: full = green circle, partial = blue square, none = closed
function hourClass(w) { return !ok(w) ? 'na' : w >= 0.999 ? 'full' : w > 0 ? 'part' : 'none'; }

// Sum of weights for hours a <= t < b. Returns { hours, have, of }: have/of = hours with data out of hours asked for.
function sumHours(series, a, b) {
  var s = 0, have = 0, of = Math.round((b - a) / HOUR);
  if (!series) return { hours: null, have: 0, of: of };
  for (var i = 0; i < series.t.length; i++) {
    var t = series.t[i]; if (t < a || t >= b) continue;
    var w = series.w[i]; if (!ok(w)) continue;
    s += w; have++;
  }
  return { hours: have ? s : null, have: have, of: of };
}
// Hours for water use: per hour, the larger / the average / one site, per CONFIG.waterHoursFrom.
function combineSites(v, s) {
  if (!v && !s) return null;
  var mode = CONFIG.waterHoursFrom, t = (v || s).t, out = { t: [], w: [] }, si = {};
  if (s) s.t.forEach(function (tt, i) { si[tt] = i; });
  var vi = {}; if (v) v.t.forEach(function (tt, i) { vi[tt] = i; });
  var all = Object.keys(Object.assign({}, vi, si)).map(Number).sort(function (a, b) { return a - b; });
  all.forEach(function (tt) {
    var a = v && vi[tt] !== undefined ? v.w[vi[tt]] : null, b = s && si[tt] !== undefined ? s.w[si[tt]] : null, w;
    if (mode === 'summit') w = b; else if (mode === 'village') w = a;
    else if (!ok(a) || !ok(b)) w = ok(a) ? a : b;  // one site missing: use the other
    else w = mode === 'average' ? (a + b) / 2 : Math.max(a, b);
    out.t.push(tt); out.w.push(ok(w) ? w : null);
  });
  return out;
}
// Water from weighted hours: gallons, acre-feet, and the pond share.
function water(hours) {
  if (!ok(hours)) return null;
  var gal = hours * 60 * CONFIG.fullGpm;
  return { gallons: gal, acreFeet: gal / CONFIG.gallonsPerAcreFoot, pondShare: gal / CONFIG.pondGallons };
}
function pondHours() { return CONFIG.pondGallons / (CONFIG.fullGpm * 60); }

if (typeof module !== 'undefined') module.exports = { wetBulbF: wetBulbF, dewPointF: dewPointF, rhFromDew: rhFromDew, rhAtPressure: rhAtPressure, hourWeight: hourWeight, windFactor: windFactor, siteHourWeight: siteHourWeight, sumHours: sumHours, combineSites: combineSites, water: water, pondHours: pondHours, stdPressure: stdPressure };
