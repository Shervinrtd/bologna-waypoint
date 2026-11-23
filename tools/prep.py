"""Builds assets/bologna.json (map + street graph geometry) and assets/terrain.jpg
from the Comune di Bologna open data + OSM extracts in tools/data.

Usage (from the repo root):
    pip install numpy scipy shapely pillow
    python3 tools/prep.py
"""
import sys, os, json, math, io, base64
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
os.chdir(HERE)
sys.path.insert(0, HERE)
sys.argv = ['render.py', 'wide']
import render  # reuses the illustrated map's palette, zones, terrain painter
from shapely.geometry import Polygon
from PIL import Image

D = render.D
LON_C, LAT_C = 11.3315, 44.4885
KX, KY = render.KX, render.KY


def km(p):
    return ((p[0] - LON_C) * KX, (p[1] - LAT_C) * KY)


def enc(line):
    """delta-encoded metres: [x0,y0,dx1,dy1,...]"""
    out = []; px = py = 0
    for p in line:
        x, y = km(p); x = round(x * 1000); y = round(y * 1000)
        out += [x - px, y - py]; px, py = x, y
    return out


# ------------------------------------------------------------------ terrain raster
comune = D['osm']['comune'][0]
xs = [km(p)[0] for p in comune]; ys = [km(p)[1] for p in comune]
M = 1.5
X0, X1, Y0, Y1 = min(xs) - M, max(xs) + M, min(ys) - M, max(ys) + M
PX = 80  # px per km
render.W = int((X1 - X0) * PX); render.H = int((Y1 - Y0) * PX)
render.PXKM = PX


def P(lon, lat):
    x, y = km((lon, lat))
    return ((x - X0) * PX, (Y1 - y) * PX)


render.P = P
b64 = render.terrain_png()
im = Image.open(io.BytesIO(base64.b64decode(b64))).convert('RGB')
im.save(os.path.join(ROOT, 'assets', 'terrain.jpg'), 'JPEG', quality=82, optimize=True, progressive=True)
print('terrain', im.size)

# ------------------------------------------------------------------ vector data
names = sorted(set(n for n, _ in D['streets']))
nidx = {n: i for i, n in enumerate(names)}
CLS = {'st': 0, 'art': 1, 'ring': 2, 'mw': 3}
streets = [[nidx[n], CLS[render.road_class(n)], enc(l)] for n, l in D['streets']]

zones = []
for props, rings in D['zones']:
    n = props['nomezona']
    tint, label = render.ZONES.get(n, ('#d0c090', n))
    poly = Polygon(max((r for r in rings if len(r) > 3), key=lambda r: Polygon(r).buffer(0).area)).buffer(0)
    c = poly.representative_point() if not poly.contains(poly.centroid) else poly.centroid
    dx, dy = render.NUDGE.get(n, (0, 0))
    lx, ly = km((c.x, c.y))
    zones.append(dict(name=n, label=label, tint=tint, centro=n in render.CENTRO,
                      lp=[round(lx + dx, 3), round(ly + dy, 3)], rings=[enc(r) for r in rings]))

contours = [[q, enc(l)] for q, l in D['contours'] if q >= 80]

data = dict(
    center=[LON_C, LAT_C], kx=KX, ky=KY,
    terrain=dict(x0=round(X0, 4), x1=round(X1, 4), y0=round(Y0, 4), y1=round(Y1, 4)),
    names=names, streets=streets, zones=zones,
    rail=[enc(r) for r in D['rail']],
    contours=contours,
    osm={k: [enc(r) for r in v] for k, v in D['osm'].items()},
)
js = json.dumps(data, separators=(',', ':'))
open(os.path.join(ROOT, 'assets', 'bologna.json'), 'w').write(js)
print('bologna.json', len(js) // 1024, 'KB', len(streets), 'arcs', len(names), 'names')
