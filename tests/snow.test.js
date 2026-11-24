// node tests/snow.test.js : checks the wet-bulb and snowmaking math
global.CONFIG = require('vm').runInNewContext(require('fs').readFileSync(__dirname + '/../js/config.js', 'utf8') + ';CONFIG');
global.ok = function (v) { return v !== null && v !== undefined && !isNaN(v); };
global.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
global.HOUR = 3600;
var S = require('../js/snow.js'), fails = 0;
function near(name, got, want, tol) { var g = Math.abs(got - want) <= tol; if (!g) fails++; console.log((g ? 'ok   ' : 'FAIL ') + name + ': ' + got.toFixed(2) + ' (want ' + want + ' ±' + tol + ')'); }
// psychrometric chart / NWS calculator values, sea level
near('Tw 30F 50% 1013', S.wetBulbF(30, 50, 1013.25), 25.3, 0.7);
near('Tw 32F 100%', S.wetBulbF(32, 100, 1013.25), 32, 0.05);
near('Tw 40F 30% 1013', S.wetBulbF(40, 30, 1013.25), 31.0, 0.8);
near('Tw 28F 80% 1013', S.wetBulbF(28, 80, 1013.25), 26.2, 0.4);
near('summit pressure lowers Tw', S.wetBulbF(30, 50, 875) - S.wetBulbF(30, 50, 1013.25), -0.3, 0.3);
near('dew point 30F 50%', S.dewPointF(30, 50), 13.6, 0.8);
near('weight 27', S.hourWeight(27), 0, 1e-9);
near('weight 30', S.hourWeight(30), 0, 1e-9);
near('weight 26', S.hourWeight(26), 1 / 3, 1e-9);
near('weight 22', S.hourWeight(22), 2 / 3, 1e-9);
near('weight 24', S.hourWeight(24), 0.5, 1e-9);
near('weight 19', S.hourWeight(19), 1, 1e-9);
near('wind 20', S.windFactor(20), 1, 1e-9);
near('wind 32.5', S.windFactor(32.5), 0.5, 1e-9);
near('wind 45', S.windFactor(45), 0, 1e-9);
near('summit cold but windy', S.siteHourWeight('summit', 15, 32.5), 0.5, 1e-9);
near('village ignores wind', S.siteHourWeight('village', 15, 32.5), 1, 1e-9);
near('pond hours', S.pondHours(), 108.3, 0.1);
near('acre-ft for 50 h', S.water(50).acreFeet, 34.3, 0.1);
near('RH at 890 hPa', S.rhAtPressure(890, [[1000, 90], [925, 80], [850, 60]]), 70.4, 1);
var ser = { t: [0, 3600, 7200, 10800], w: [1, 0.5, null, 0] }, r = S.sumHours(ser, 0, 4 * 3600);
near('sumHours', r.hours, 1.5, 1e-9); near('sumHours have', r.have, 3, 0);
var c = S.combineSites({ t: [0, 3600], w: [0, 1] }, { t: [0, 3600], w: [1, 0.5] });
near('best of both', c.w[0] + c.w[1], 2, 1e-9);
console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
