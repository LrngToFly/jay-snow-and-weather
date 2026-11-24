/* Jay Snow & Weather: every place, threshold and link in one file.
   Change a number here, push to GitHub, and the app picks it up on the next open (tap Reload on the update bar).
   Tune the snowmaking numbers against Jay's snow reports. */
'use strict';

var CONFIG = {
  // ------------------------------------------------------------------ places
  // Elevations are in feet. Open-Meteo runs the same model at each point but corrects it to this elevation,
  // so the summit and the village are the same model grid cell (about 25 km wide), adjusted for height.
  sites: {
    village: { name: 'Village / base', short: 'Village', lat: 44.933, lon: -72.503, elevFt: 1982, note: 'At the IJAY3 station, 1,982 ft' },
    summit:  { name: 'Summit', short: 'Summit', lat: 44.924, lon: -72.526, elevFt: 3968, note: 'Jay Peak summit, 3,968 ft' }
  },
  tz: 'America/New_York',

  // ------------------------------------------------------------------ station (village history)
  stationId: 'IJAY3',
  // Written every hour by the GitHub Action (.github/workflows/ijay3.yml) to the repo's "data" branch.
  // The page reads it from there, so no API key is ever in the page.
  stationUrl: 'https://raw.githubusercontent.com/LrngToFly/jay-snow-and-weather/data/ijay3.json',
  stationUrlLocal: 'data/ijay3.json',   // used when testing on localhost, if present

  // ------------------------------------------------------------------ snowmaking
  // Weight of one hour by wet-bulb temperature (°F). Between the points the weight is blended in a straight line;
  // at or above the warmest point it is 0, at or below the coldest it is 1.
  wetBulbWeights: [
    [27, 0],       // 27°F or warmer: no snowmaking
    [26, 1 / 3],   // about 26°F: marginal, a third of an hour
    [22, 2 / 3],   // about 22°F: two thirds
    [20, 1]        // under 20°F: a full hour
  ],
  // Summit wind: sustained 10 m wind above windCutMph starts cutting summit hours, down to none at windStopMph.
  // Models smooth the summit's wind (the grid cell is a mix of peak and valley), so they often read low.
  windCutMph: 25,
  windStopMph: 40,
  windAppliesTo: ['summit'],

  // Target for a minimal opening, in weighted hours.
  targetLow: 50,
  targetHigh: 75,

  // Water: Jay's full snowmaking capacity and the pond.
  fullGpm: 2000,
  gallonsPerAcreFoot: 175000,      // snow-gun water per acre-foot of made snow (rule of thumb)
  pondGallons: 13000000,           // 13 million gallons; at full flow that is about 108 hours
  // Which hours count for water use. The pumps run whenever any part of the mountain can make snow,
  // so "best" takes the larger of the two elevations each hour. Other choices: 'summit', 'village', 'average'.
  waterHoursFrom: 'best',

  // ------------------------------------------------------------------ models
  // om = Open-Meteo model name. hours = how far ahead it runs.
  // pastSource: the model used for "what happened" at the summit (Open-Meteo keeps the first hours of each run).
  models: [
    { id: 'ecmwf', label: 'Euro', name: 'Euro (ECMWF IFS 0.25°)', om: 'ecmwf_ifs025', color: '#e8553e', hours: 168 },
    { id: 'gfs', label: 'GFS', name: 'GFS', om: 'gfs_seamless', color: '#2f7fe0', hours: 168 },
    { id: 'aifs', label: 'Euro AI', name: 'Euro AI (ECMWF AIFS, 6-hourly)', om: 'ecmwf_aifs025_single', color: '#f2a531', hours: 168, sixHourly: true },
    { id: 'aigfs', label: 'GFS AI', name: 'GFS AI (NOAA AIGFS)', om: 'ncep_aigfs025', color: '#3fb8a8', hours: 168, noRh: true },
    { id: 'rrfs', label: 'RRFS', name: 'RRFS (3 km, about 84 hours)', om: 'ncep_rrfs_conus', color: '#a35bd6', hours: 84, short: true }
  ],
  consensus: ['ecmwf', 'gfs', 'aifs', 'aigfs'],   // the "model average" (RRFS is left out: it stops at 84 hours)
  pastSource: 'ecmwf',
  freezeF: 32,

  // ------------------------------------------------------------------ links (Jay's site won't open inside another page, so these open in Safari)
  links: [
    { label: 'Weather by Tim Kelley', url: 'https://jaypeakresort.com/skiing-riding/snow-report-maps/weather-tim-kelley', sub: 'Jay Peak\'s own forecast' },
    { label: 'Snow Report', url: 'https://jaypeakresort.com/skiing-riding/snow-report-maps/snow-report', sub: 'Trails, lifts and snowmaking' },
    { label: 'A Look Around', url: 'https://jaypeakresort.com/resort/photo-day', sub: 'Mountain cams and recent photos' }
  ]
};
