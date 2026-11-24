# Jay Snow & Weather

A personal iPhone and iPad web app for snowmaking weather at Jay Peak, VT: wet-bulb temperatures and weighted snowmaking hours at the village/base (IJAY3, 1,982 ft) and the summit (3,968 ft), for the past 7 days and the next 7, from five forecast models. Same style as [Backyard Weather](https://github.com/LrngToFly/backyard-weather).

Live copy: https://lrngtofly.github.io/jay-snow-and-weather/

Not affiliated with Jay Peak Resort. Snowmaking hours are an estimate from the weather, not Jay's actual operations.

## What's in it

- **Right now**: wet-bulb, air temperature, humidity and wind at the village (IJAY3 when it has reported in the last 2 hours, otherwise the Euro) and the summit (Euro), with a trail-sign status: green circle full rate, blue square part rate, red too warm.
- **Snowmaking hours** for the last 7 days and the next 7 (model average), on a gauge against the 50–75 hour target for a minimal opening, with acre-feet and gallons at Jay's 2,000 gpm, and a pond warning past about 108 hours at full flow (13 million gallons).
- **By model**: next-7-day hours at each elevation for Euro, GFS, Euro AI, GFS AI and RRFS (84 hours).
- **Day by day**: hours per day at each elevation, with the day's lowest wet-bulb in Tropical Tidbits temperature colors.
- **Charts** (tap to read): wet-bulb from every model at either elevation; one model up close with temperature, dew point, wet-bulb and precipitation in in/hr (Tropical Tidbits rain and snow colors); and inversions (village, summit, 925 and 850 hPa).
- **Jay Peak links**: Weather by Tim Kelley, Snow Report and A Look Around. Jay's site refuses to be shown inside another page, so they open in Safari.
- Phone, iPad portrait and iPad landscape layouts. Works offline with the last download.

## How the numbers work

- Both elevations come from the same Open-Meteo model grid cell, corrected to each elevation (Open-Meteo's `elevation` setting). The models' grids are about 25 km (RRFS 3 km), so they can't tell the village from the summit by themselves.
- Wet-bulb is solved from temperature, humidity and the pressure at each elevation (about 940 hPa at the village, 875 hPa at the summit). GFS AI has no 2 m humidity, so its humidity comes from its 1000, 925 and 850 hPa levels at the site's pressure.
- Each hour is weighted by wet-bulb: 27°F or warmer 0, about 26°F a third, about 22°F two thirds, under 20°F a full hour, blended in between. Summit wind over 25 mph cuts the summit's hours, to none at 40 mph.
- "Mountain" hours count an hour when either elevation can make snow (the pumps run either way); water and the pond use those.
- The past 7 days use IJAY3's hourly readings at the village (the Euro fills gaps) and the Euro's recent runs at the summit (there's no summit station history to pull).

**Every threshold is in [`js/config.js`](js/config.js)**: the wet-bulb weights, wind cut, target, gallons per minute, gallons per acre-foot, pond size, the two locations, the models and the links. Change it on GitHub and the app updates on its next open.

## Set up

### 1. GitHub Pages (once)

Repository **Settings → Pages → Deploy from a branch → `main`, `/ (root)`**. The site is live at the address above in a minute or two.

### 2. IJAY3 readings (once)

The page never holds the Weather Underground key. A GitHub Action ([`.github/workflows/ijay3.yml`](.github/workflows/ijay3.yml)) runs every hour, downloads IJAY3's last 7 days of hourly readings with the key, and saves them to the `data` branch, which the page reads. It also keeps a growing history in `ijay3-archive.json`.

1. Copy your key from https://www.wunderground.com/member/api-keys.
2. Repository **Settings → Secrets and variables → Actions → New repository secret**: name `WU_API_KEY`, paste the key. (Or in Terminal: `gh secret set WU_API_KEY --repo LrngToFly/jay-snow-and-weather`, then paste.)
3. **Actions → Save IJAY3 readings → Run workflow** to fill it right away. After that it runs on its own each hour.

Until then, the village's past 7 days use the Euro, and the page says so.

### 3. Each iPhone and iPad

Open the live address in Safari, tap Share, then **Add to Home Screen**.

## Files

Plain HTML, CSS and JavaScript, no build step.

| File | What's in it |
|---|---|
| `index.html`, `style.css` | Page and styles |
| `js/config.js` | Places, snowmaking thresholds, water numbers, models, links |
| `js/core.js` | Helpers, storage, chart helpers, Tropical Tidbits colors |
| `js/snow.js` | Wet-bulb and snowmaking math |
| `js/data.js` | Open-Meteo and IJAY3 downloads |
| `js/summary.js` | Main screen: right now, hours, water, tables |
| `js/charts.js` | Wet-bulb, model detail and inversion charts |
| `js/app.js` | Layout, links panel, settings, refresh, falling snow, start-up |
| `sw.js` | Offline copy and update check |
| `scripts/fetch_ijay3.py`, `.github/workflows/ijay3.yml` | Hourly IJAY3 download |
| `tests/snow.test.js` | Checks for the math: `node tests/snow.test.js` |

To test locally: `python3 -m http.server 8765` in the folder, then open http://localhost:8765/. If you add a file to the app, add it to `SHELL` in `sw.js`.

Forecast data: [Open-Meteo](https://open-meteo.com/) (ECMWF, NOAA GFS, AIFS, AIGFS, RRFS), CC BY 4.0. Free for non-commercial use.
