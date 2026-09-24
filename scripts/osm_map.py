# Project the OSM extract to local meters around Bag End and draw an SVG map for inspection.
import json, math, sys
LAT0, LON0 = -37.857559, 175.679879
KX = 111320 * math.cos(math.radians(LAT0)); KY = 110574
def P(lat, lon): return ((lon - LON0) * KX, (lat - LAT0) * KY)
d = json.load(open('osm_raw.json'))
S = 1.6; W = 1200; H = 1200; CX = 600 - 40 * S; CY = 600 - 110 * S  # view center near (40,-110)
def sx(x): return CX + x * S
def sy(y): return CY - y * S
out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" style="background:#eef2e6;font:10px sans-serif">']
style = {
  'water': 'fill:#8ec3e6;stroke:#4a8ab8', 'building': 'fill:#c98a5a;stroke:#6a3f20', 'hedge': 'fill:none;stroke:#2f7a2f;stroke-width:3',
  'fence': 'fill:none;stroke:#9a7a5a;stroke-width:1;stroke-dasharray:3 2', 'footway': 'fill:none;stroke:#b08a50;stroke-width:2.5',
  'path': 'fill:none;stroke:#b08a50;stroke-width:1.5;stroke-dasharray:4 2', 'track': 'fill:none;stroke:#888;stroke-width:3',
  'service': 'fill:none;stroke:#555;stroke-width:4', 'stream': 'fill:none;stroke:#4a8ab8;stroke-width:2', 'garden': 'fill:#cfe8b8;stroke:#8ab870',
  'wood': 'fill:#a8cc98;stroke:none', 'grass': 'fill:#dff0c8;stroke:none', 'other': 'fill:none;stroke:#bbb', 'steps': 'fill:none;stroke:#c33;stroke-width:3',
  'bridge': 'fill:#999;stroke:#333', 'wetland': 'fill:#bcd8c8;stroke:none', 'farmland': 'fill:#f2ecd6;stroke:#ddd',
}
def kind(t):
  if t.get('natural') == 'water': return 'water'
  if 'building' in t: return 'building'
  if t.get('barrier') == 'hedge': return 'hedge'
  if t.get('barrier') == 'fence': return 'fence'
  if t.get('highway') == 'steps': return 'steps'
  if t.get('highway') == 'footway': return 'bridge' if t.get('bridge') else 'footway'
  if t.get('highway') == 'path': return 'path'
  if t.get('highway') == 'track': return 'track'
  if t.get('highway') == 'service': return 'service'
  if t.get('waterway'): return 'stream'
  if t.get('leisure') == 'garden': return 'garden'
  if t.get('natural') == 'wood': return 'wood'
  if t.get('landuse') in ('grass', 'meadow'): return 'grass'
  if t.get('natural') == 'wetland': return 'wetland'
  if t.get('landuse') == 'farmland': return 'farmland'
  if t.get('man_made') == 'bridge': return 'bridge'
  return 'other'
order = ['farmland', 'grass', 'wood', 'garden', 'wetland', 'water', 'stream', 'track', 'service', 'path', 'footway', 'bridge', 'steps', 'fence', 'hedge', 'building', 'other']
ways = [e for e in d['elements'] if e['type'] == 'way' and 'geometry' in e]
ways.sort(key=lambda e: order.index(kind(e.get('tags', {}))))
labels = []
for e in ways:
  t = e.get('tags', {}); k = kind(t)
  pts = [P(g['lat'], g['lon']) for g in e['geometry']]
  closed = e['nodes'][0] == e['nodes'][-1] and k in ('water', 'building', 'garden', 'wood', 'grass', 'wetland', 'farmland', 'bridge')
  ps = ' '.join(f'{sx(x):.1f},{sy(y):.1f}' for x, y in pts)
  out.append(f'<{"polygon" if closed else "polyline"} points="{ps}" style="{style[k]}"/>')
  if t.get('name') and k in ('footway', 'building', 'path', 'track', 'water'):
    x, y = pts[len(pts) // 2]; labels.append((sx(x), sy(y), t['name']))
for e in d['elements']:
  if e['type'] != 'node': continue
  t = e.get('tags', {}); x, y = P(e['lat'], e['lon'])
  c = '#1a5a1a' if t.get('natural') == 'tree' else '#c00'
  out.append(f'<circle cx="{sx(x):.1f}" cy="{sy(y):.1f}" r="{4 if t.get("natural") == "tree" else 3}" fill="{c}"/>')
  if t.get('name'): labels.append((sx(x) + 5, sy(y), t['name']))
for x, y, n in labels: out.append(f'<text x="{x:.0f}" y="{y:.0f}" fill="#222">{n}</text>')
# 50 m grid
for g in range(-400, 401, 50):
  out.append(f'<line x1="{sx(g)}" y1="0" x2="{sx(g)}" y2="{H}" stroke="#0001"/><line x1="0" y1="{sy(g)}" x2="{W}" y2="{sy(g)}" stroke="#0001"/>')
  out.append(f'<text x="{sx(g)+2}" y="12" fill="#999">{g}</text><text x="2" y="{sy(g)-2}" fill="#999">{g}</text>')
out.append('</svg>')
open('osm_map.svg', 'w').write('\n'.join(out))
print('ok')
