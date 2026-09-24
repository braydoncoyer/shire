# Convert the OSM extract and LINZ DEM grids into src/data/hobbiton.json, in world space:
#   world x = east - OX, world z = -(north - OY), world y = elevation - Y0   (meters)
# so the set sits near the origin and the lake surface (140.0 m) lands at y = 1.55.
# Data: © OpenStreetMap contributors (ODbL); LINZ NZ 8 m DEM (CC BY 4.0) via OpenTopoData.
import json, math
LAT0, LON0 = -37.857559, 175.679879          # OSM "Bag End"
KX = 111320 * math.cos(math.radians(LAT0)); KY = 110574
OX, OY, Y0 = 60.0, -100.0, 138.45
def local(g): return ((g['lon'] - LON0) * KX, (g['lat'] - LAT0) * KY)
def W(x, y): return [round(x - OX, 2), round(-(y - OY), 2)]

osm = json.load(open('data/osm_raw.json'))
out = {'origin': {'lat': LAT0, 'lon': LON0, 'OX': OX, 'OY': OY, 'Y0': Y0},
       'paths': [], 'hedges': [], 'fences': [], 'streams': [], 'buildings': [], 'trees': [],
       'woods': [], 'gardens': [], 'wetlands': [], 'water': [], 'piers': [], 'bridge': None, 'places': []}
WIDTH = {'footway': 2.6, 'path': 1.5, 'steps': 1.6, 'track': 3.2, 'service': 4.0}
for e in osm['elements']:
    t = e.get('tags', {})
    if e['type'] == 'node':
        x, y = local(e)
        if t.get('natural') == 'tree' or t.get('tourism') == 'artwork' or t.get('place') or t.get('tourism') == 'attraction':
            out['places' if t.get('place') else 'trees'].append({'name': t.get('name', ''), 'kind': t.get('natural') or t.get('tourism') or t.get('place'), 'p': W(x, y)})
        continue
    if 'geometry' not in e: continue
    pts = [W(*local(g)) for g in e['geometry']]
    closed = e['nodes'][0] == e['nodes'][-1]
    hw = t.get('highway')
    if t.get('man_made') == 'bridge': out['bridge'] = {'name': t.get('name', ''), 'poly': pts}
    elif hw in WIDTH:
        if t.get('bridge'): out['bridgeLine'] = pts
        out['paths'].append({'name': t.get('name', ''), 'kind': hw, 'width': WIDTH[hw], 'pts': pts,
                             'tunnel': t.get('tunnel') == 'yes', 'bridge': bool(t.get('bridge')), 'cutting': t.get('cutting') == 'yes'})
    elif t.get('barrier') == 'hedge': out['hedges'].append(pts)
    elif t.get('barrier') == 'fence': out['fences'].append(pts)
    elif 'waterway' in t: out['streams'].append({'name': t.get('name', ''), 'pts': pts, 'culvert': t.get('tunnel') == 'culvert'})
    elif t.get('natural') == 'water': out['water'].append({'name': t.get('name', ''), 'poly': pts})
    elif t.get('natural') == 'wood': out['woods'].append(pts)
    elif t.get('natural') == 'wetland': out['wetlands'].append(pts)
    elif t.get('leisure') == 'garden': out['gardens'].append({'name': t.get('name', ''), 'poly': pts})
    elif t.get('man_made') == 'pier': out['piers'].append(pts)
    elif 'building' in t and not t.get('man_made'):
        out['buildings'].append({'name': t.get('name', ''), 'kind': t['building'], 'poly': pts})

def dem(name):
    d = json.load(open(f'data/dem_{name}.json'))
    # Grid rows run south→north in local y; store as world z ascending (north first is -z), flipping rows.
    nx, ny = d['nx'], d['ny']
    z = d['z']
    rows = [z[j * nx:(j + 1) * nx] for j in range(ny)][::-1]
    x0w = d['x0'] - OX
    z0w = -((d['y0'] + (ny - 1) * d['step']) - OY)
    return {'x0': x0w, 'z0': z0w, 'step': d['step'], 'nx': nx, 'nz': ny,
            'h': [round(v - Y0, 2) for r in rows for v in r]}
out['demSet'] = dem('set')
try: out['demWide'] = dem('wide')
except FileNotFoundError: out['demWide'] = None
json.dump(out, open('src/data/hobbiton.json', 'w'), separators=(',', ':'))
print({k: len(v) if isinstance(v, list) else ('ok' if v else None) for k, v in out.items()})
