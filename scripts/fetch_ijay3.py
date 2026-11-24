#!/usr/bin/env python3
"""Save IJAY3's hourly readings for the app.

Run by .github/workflows/ijay3.yml every hour. Reads the Weather Underground API key from the WU_API_KEY
environment variable (a GitHub secret, never in the repo), downloads the last 7 days of hourly readings,
merges them with what was saved before, and writes:

  <out>/ijay3.json          the last 14 days, which the app reads
  <out>/ijay3-archive.json  every hour saved since the Action started (a growing history)

Each reading is [epoch, temp °F, dew point °F, humidity %, wind mph, gust mph, precip rate in/hr, precip total in].
Usage: fetch_ijay3.py <out dir> [previous archive file]
"""
import json, os, sys, time, urllib.request, urllib.error

STATION = os.environ.get('STATION_ID', 'IJAY3')
URL = 'https://api.weather.com/v2/pws/observations/hourly/7day?stationId={}&format=json&units=e&numericPrecision=decimal&apiKey={}'
KEEP_DAYS = 14


def num(v):
    try:
        return None if v is None else round(float(v), 2)
    except (TypeError, ValueError):
        return None


def main():
    out_dir = sys.argv[1]
    prev_path = sys.argv[2] if len(sys.argv) > 2 else None
    key = os.environ.get('WU_API_KEY', '').strip()
    if not key:
        sys.exit('WU_API_KEY is not set. Add it under the repo Settings > Secrets and variables > Actions.')

    archive = {'station': STATION, 'obs': []}
    if prev_path and os.path.exists(prev_path):
        try:
            with open(prev_path) as f:
                archive = json.load(f)
        except ValueError:
            print('Previous archive unreadable; starting fresh')

    req = urllib.request.Request(URL.format(STATION, key), headers={'User-Agent': 'jay-snow-and-weather'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
    except urllib.error.HTTPError as e:
        sys.exit('Weather Underground HTTP {} (401/403: check the key; 204: the station has no recent data)'.format(e.code))
    if not body:
        sys.exit('Weather Underground returned no data (the station may be offline)')
    obs = json.loads(body).get('observations') or []

    rows = {int(r[0]): r for r in archive.get('obs', [])}
    lat = lon = None
    for o in obs:
        im = o.get('imperial') or {}
        t = o.get('epoch')
        if not t:
            continue
        lat, lon = o.get('lat', lat), o.get('lon', lon)
        rows[int(t)] = [int(t), num(im.get('tempAvg')), num(im.get('dewptAvg')), num(o.get('humidityAvg')),
                        num(im.get('windspeedAvg')), num(im.get('windgustHigh')), num(im.get('precipRate')), num(im.get('precipTotal'))]

    all_rows = [rows[k] for k in sorted(rows)]
    now = int(time.time())
    meta = {'station': STATION, 'updated': now, 'lat': lat or archive.get('lat'), 'lon': lon or archive.get('lon'),
            'fields': ['epoch', 'tempF', 'dewF', 'rh', 'windMph', 'gustMph', 'rateInHr', 'totalIn']}
    recent = [r for r in all_rows if r[0] >= now - KEEP_DAYS * 86400]

    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, 'ijay3.json'), 'w') as f:
        json.dump(dict(meta, obs=recent), f, separators=(',', ':'))
    with open(os.path.join(out_dir, 'ijay3-archive.json'), 'w') as f:
        json.dump(dict(meta, obs=all_rows), f, separators=(',', ':'))
    print('Saved {} new readings; {} in the last {} days, {} in the archive'.format(len(obs), len(recent), KEEP_DAYS, len(all_rows)))


if __name__ == '__main__':
    main()
