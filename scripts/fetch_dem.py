# Fetch LINZ NZ 8 m DEM elevations around Bag End via OpenTopoData (rate-limited: 1 req/s, 100 pts).
# Writes data/dem_<name>.json: { x0, y0, step, nx, ny, z: [...] } in local meters (+x E, +y N).
import json, math, sys, time, urllib.request
LAT0, LON0 = -37.857559, 175.679879
KX = 111320 * math.cos(math.radians(LAT0)); KY = 110574
def ll(x, y): return (LAT0 + y / KY, LON0 + x / KX)
def grid(name, x0, y0, x1, y1, step):
    xs = [x0 + i * step for i in range(int((x1 - x0) / step) + 1)]
    ys = [y0 + j * step for j in range(int((y1 - y0) / step) + 1)]
    pts = [(x, y) for y in ys for x in xs]
    z = []
    for k in range(0, len(pts), 100):
        chunk = pts[k:k + 100]
        locs = '|'.join('%.7f,%.7f' % ll(x, y) for x, y in chunk)
        url = 'https://api.opentopodata.org/v1/nzdem8m?locations=' + locs
        for attempt in range(5):
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'shire-recreation/0.1'})
                res = json.load(urllib.request.urlopen(req, timeout=60))
                if res.get('status') != 'OK': raise RuntimeError(res)
                z += [r['elevation'] if r['elevation'] is not None else float('nan') for r in res['results']]
                break
            except Exception as e:
                print('retry', k, e, file=sys.stderr); time.sleep(3 + attempt * 3)
        else:
            raise SystemExit('failed')
        time.sleep(1.05)
        print(f'{name}: {len(z)}/{len(pts)}', end='\r', flush=True)
    json.dump({'x0': x0, 'y0': y0, 'step': step, 'nx': len(xs), 'ny': len(ys), 'z': z}, open(f'data/dem_{name}.json', 'w'))
    print(f'\n{name}: min {min(z):.1f} max {max(z):.1f}')
which = sys.argv[1]
if which == 'set': grid('set', -320, -460, 400, 280, 8)
if which == 'wide': grid('wide', -2560, -2660, 2640, 2480, 80)
