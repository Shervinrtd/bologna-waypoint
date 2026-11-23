"""Turns the OpenStreetMap place extract (tools/data/osm_places.json) into assets/places.json.

The extract is a dict  osm_id -> [category=type, name, lat, lon, cuisine, road, query]
collected from Nominatim category searches over the Comune di Bologna (see README).

Usage: python3 tools/places.py
"""
import os, sys, json, re
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE); os.chdir(HERE)
from decode import load
from shapely.geometry import Polygon, Point

D = load()
LON_C, LAT_C = 11.3315, 44.4885
import math
KX = math.cos(math.radians(44.49)) * 111.32; KY = 111.13
city = Polygon(D['osm']['comune'][0]).buffer(0)

GYM = re.compile(r'palestr|fitness|gym|crossfit|wellness|body|boxe|yoga|pilates|sport club', re.I)
PIZZA = re.compile(r'pizz', re.I)


def classify(t, name, cuisine, q):
    pizza = 'pizza' in (cuisine or '') or bool(PIZZA.search(name or ''))
    if t == 'amenity=restaurant': return 'pizza' if pizza else 'food'
    if t == 'amenity=fast_food': return 'pizza' if pizza else 'burger'
    if t == 'amenity=cafe': return 'cafe'
    if t in ('amenity=bar', 'amenity=pub', 'amenity=biergarten'): return 'bar'
    if t == 'amenity=ice_cream': return 'gelato'
    if t in ('shop=supermarket', 'shop=convenience'): return 'shop'
    if t in ('shop=clothes', 'shop=boutique', 'shop=fashion'): return 'clothes'
    if t == 'leisure=fitness_centre': return 'gym'
    if t in ('leisure=sports_centre', 'leisure=sports_hall', 'building=sports_hall') and GYM.search(name or '') and not re.search(r'scolastic', name or '', re.I): return 'gym'
    if t in ('shop=hairdresser', 'shop=barber'): return 'barber'
    if t == 'shop=tattoo': return 'tattoo'
    if t == 'amenity=pharmacy': return 'pharmacy'
    if t in ('amenity=hospital', 'amenity=clinic'): return 'hospital'
    if t == 'amenity=police': return 'police'
    if t in ('amenity=bank', 'amenity=atm'): return 'bank'
    if t in ('tourism=hotel', 'tourism=hostel', 'tourism=guest_house', 'tourism=motel'): return 'hotel'
    if t == 'amenity=fuel': return 'fuel'
    if t == 'shop=car_repair': return 'mechanic'
    if t == 'amenity=car_wash': return 'carwash'
    if t in ('amenity=parking', 'amenity=parking_entrance'): return 'parking'
    if t == 'amenity=cinema': return 'cinema'
    if t == 'amenity=nightclub': return 'club'
    if t == 'tourism=museum': return 'museum'
    return None


raw = json.load(open(os.path.join(HERE, 'data', 'osm_places.json')))
cats, items, seen = [], [], set()
for k, (t, name, lat, lon, cuisine, road, q) in raw.items():
    c = classify(t, name, cuisine, q)
    if not c or not city.contains(Point(lon, lat)): continue
    x = round((lon - LON_C) * KX * 1000); y = round((lat - LAT_C) * KY * 1000)
    key = (c, round(x / 15), round(y / 15))  # drop near-duplicates (node + building of the same place)
    if key in seen: continue
    seen.add(key)
    if c not in cats: cats.append(c)
    items.append([cats.index(c), name.strip(), x, y, road])
out = dict(cats=cats, items=items)
js = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
open(os.path.join(ROOT, 'assets', 'places.json'), 'w').write(js)
from collections import Counter
print(len(items), 'places', len(js) // 1024, 'KB', dict(Counter(cats[i[0]] for i in items)))
