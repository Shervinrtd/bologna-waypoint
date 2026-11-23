"""Bologna open-world style map renderer.
Builds an SVG (fonts + terrain embedded) from Comune di Bologna open data + OSM extracts.
Usage: python3 render.py portrait|wide
"""
import sys, json, math, base64, io, os
import numpy as np
from scipy.interpolate import griddata
from scipy.ndimage import gaussian_filter
from PIL import Image
from shapely.geometry import Polygon, LineString, Point
from decode import load

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(os.path.dirname(HERE), 'assets', 'fonts')
D = load()

LAT0 = 44.49
KX = math.cos(math.radians(LAT0)) * 111.32  # km per deg lon
KY = 111.13                                  # km per deg lat

# ---------------------------------------------------------------- layout
MODE = sys.argv[1] if len(sys.argv) > 1 else 'portrait'
if MODE == 'portrait':
    W, H = 2160, 2700
    PXKM = 113.0
    CX, CY = 1110, 1255          # where the map centre lands
elif MODE == 'square':
    W, H = 2160, 2160
    PXKM = 112.0
    CX, CY = 1080, 1130
else:
    W, H = 3840, 2160
    PXKM = 124.0
    CX, CY = 1500, 1110
LON_C, LAT_C = 11.3315, 44.4885   # centre of comune bbox

def P(lon, lat):
    return (CX + (lon - LON_C) * KX * PXKM, CY - (lat - LAT_C) * KY * PXKM)

def path(pts, close=False):
    if not pts: return ''
    s = 'M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in (P(*p) for p in pts))
    return s + ('Z' if close else '')

def font_face(name, file, weight=400):
    b = base64.b64encode(open(os.path.join(FONTS, file), 'rb').read()).decode()
    return f"@font-face{{font-family:'{name}';font-weight:{weight};src:url(data:font/woff2;base64,{b}) format('woff2');}}"

FONT_CSS = ''.join([
    font_face('Bungee', 'bungee-latin-400-normal.woff2'),
    font_face('Anton', 'anton-latin-400-normal.woff2'),
    font_face('Oswald', 'oswald-latin-700-normal.woff2', 700),
    font_face('Barlow Condensed', 'barlow-condensed-latin-700-normal.woff2', 700),
    font_face('Barlow Condensed', 'barlow-condensed-latin-400-normal.woff2', 400),
    font_face('Pacifico', 'pacifico-latin-400-normal.woff2'),
])

# ---------------------------------------------------------------- palette
C = dict(
    sea0='#0e3b52', sea1='#071f33', sealine='#2a6f8a',
    sand='#f3d9a4', land='#d9cfa6', plain='#cfc79a',
    water='#36c5d6', water_edge='#e8fbff',
    centro='#c9573d', centro2='#b4442f',
    park='#7fb35a', park2='#5b9443',
    road='#fff8e8', road_case='#a89a78',
    art='#ffe08a', art_case='#8a6d2f',
    ring='#ffcf3f', ring_case='#7a4b12',
    mw='#ff8a3d', mw_case='#6e2a10',
    rail='#5a5a66',
    route='#ff3fa4', route_glow='#ff9ad2',
    ink='#1b1b24', white='#ffffff',
)

# zone styling: tint + playful in-game label
ZONES = {
    'Galvani':        ('#c9573d', 'PIAZZA\nDISTRICT'),
    'Irnerio':        ('#c45a3f', 'STUDENT\nQUARTER'),
    'Malpighi':       ('#c75a40', 'MALPIGHI\nMILE'),
    'Marconi':        ('#c35239', 'MARCONI\nROW'),
    'Bolognina':      ('#d7b98a', 'BOLOGNINA\nHEIGHTS'),
    'Corticella':     ('#c9c48b', 'CORTICELLA\nFLATS'),
    'S. Viola':       ('#d1c08f', 'SANTA VIOLA\nYARDS'),
    'Saffi':          ('#dcbf93', 'SAFFI\nSTRIP'),
    'Mazzini':        ('#d6c495', 'MAZZINI\nPARKWAY'),
    'Lame':           ('#cdbf86', 'THE\nLAME'),
    'S. Ruffillo':    ('#bfc98e', 'RUFFILLO\nRIDGE'),
    'Borgo Panigale': ('#cbbd8a', 'PANIGALE\nMOTOR CITY'),
    'Colli':          ('#b9c98a', 'THE COLLI'),
    'San Donato':     ('#d3bc8c', 'SAN DONATO\nEXPO'),
    'S. Vitale':      ('#d9c398', 'SAN VITALE\nGATE'),
    'Costa Saragozza':('#c8c58f', 'SARAGOZZA\nHEIGHTS'),
    'Murri':          ('#d2c596', 'MURRI\nGARDENS'),
    'Barca':          ('#d0bd88', 'BARCA\nBLOCKS'),
}
CENTRO = {'Galvani', 'Irnerio', 'Malpighi', 'Marconi'}
# label nudges in km (dx east, dy north) where the centroid is awkward
NUDGE = {'Colli': (0.4, -1.6), 'Borgo Panigale': (-0.6, 0.0), 'Corticella': (0.6, 0.4),
         'Galvani': (-0.05, 0.05), 'Bolognina': (0, 0.2), 'S. Ruffillo': (0.5, -0.6),
         'Costa Saragozza': (0.2, -0.3), 'Murri': (0.3, -0.2), 'San Donato': (0.9, 0.3),
         'S. Viola': (0.7, 0.05), 'Barca': (-0.55, -0.35), 'Lame': (0.3, 0.0), 'S. Vitale': (0.6, -0.1),
         'Saffi': (-0.1, -0.15), 'Mazzini': (0.15, 0.0)}

RING = {"VIALE PIETRO PIETRAMELLARA", "VIALE ANGELO MASINI", "VIALE CARLO BERTI PICHAT",
        "VIALE GIAMBATTISTA ERCOLANI", "VIALE QUIRICO FILOPANTI", "VIALE GIOVANNI GOZZADINI",
        "VIALE GIOSUE' CARDUCCI", "VIALE ENRICO PANZACCHI", "VIALE DODICI GIUGNO",
        "VIALE ANTONIO ALDINI", "VIALE CARLO PEPOLI", "VIALE GIOVANNI VICINI", "VIALE ANTONIO SILVANI",
        "PIAZZA DI PORTA SARAGOZZA"}
ART = {"VIA EMILIA PONENTE", "VIA EMILIA LEVANTE", "STRADA MAGGIORE", "VIA SARAGOZZA", "VIA AUGUSTO MURRI",
       "VIA GIUSEPPE MAZZINI", "VIA GIUSEPPE MASSARENTI", "VIA SAN DONATO", "VIA STALINGRADO",
       "VIA DI CORTICELLA", "VIA DELL'ARCOVEGGIO", "VIA DELLE LAME", "VIA MARCO EMILIO LEPIDO",
       "VIA PORRETTANA", "VIA ANDREA COSTA", "VIA TOSCANA", "VIA DELL'INDIPENDENZA", "VIA UGO BASSI",
       "VIA FRANCESCO RIZZOLI", "VIA GUGLIELMO MARCONI", "VIA IRNERIO", "VIA DEL TRIUMVIRATO",
       "VIA DELL'AEROPORTO", "VIA FERRARESE", "VIA SAN MAMOLO", "VIA CASTIGLIONE", "VIA SAN VITALE",
       "VIA SANTO STEFANO", "VIA DEI COLLI", "VIA DELLA BEVERARA", "VIA GIACOMO MATTEOTTI",
       "VIA DE' CARRACCI", "VIA ALCIDE DE GASPERI", "VIA DEL GOMITO", "VIA GENUZIO BENTINI",
       "VIA LUIGI ZAMBONI", "VIA DI CASAGLIA", "VIA DELL'OSSERVANZA"}
def road_class(n):
    if n.startswith(('AUTOSTRADA', 'TANGENZIALE', 'RACCORDO', 'RAMPA')): return 'mw'
    if n in RING: return 'ring'
    if n in ART or n.startswith('VIALE'): return 'art'
    return 'st'

# ---------------------------------------------------------------- geometry helpers
comune = D['osm']['comune'][0]
comune_poly = Polygon(comune).buffer(0)

def in_view(pts, m=200):
    for p in pts:
        x, y = P(*p)
        if -m < x < W + m and -m < y < H + m: return True
    return False

# ---------------------------------------------------------------- terrain raster
def terrain_png():
    S = 4  # raster downscale
    gw, gh = W // S, H // S
    pts, vals = [], []
    for q, line in D['contours']:
        for lon, lat in line:
            x, y = P(lon, lat); pts.append((x / S, y / S)); vals.append(q)
    # anchor the plain to the north so interpolation doesn't invent hills there
    for lon in np.linspace(11.18, 11.48, 40):
        for lat in (44.53, 44.56, 44.60):
            x, y = P(lon, lat); pts.append((x / S, y / S)); vals.append(30 if lat > 44.55 else 38)
    for lon in np.linspace(11.18, 11.48, 30):   # extend hills to the south edge
        x, y = P(lon, 44.40); pts.append((x / S, y / S)); vals.append(260)
    pts = np.array(pts); vals = np.array(vals, float)
    gx, gy = np.meshgrid(np.arange(gw), np.arange(gh))
    z = griddata(pts, vals, (gx, gy), method='linear')
    zn = griddata(pts, vals, (gx, gy), method='nearest')
    z = np.where(np.isnan(z), zn, z)
    z = gaussian_filter(z, 3)
    # hillshade
    dy, dx = np.gradient(z)
    az, alt = math.radians(315), math.radians(40)
    slope = np.arctan(np.hypot(dx, dy) * 0.9)
    aspect = np.arctan2(-dx, dy)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    shade = np.clip(shade, 0, 1)
    # hypsometric tint: plain -> meadow -> forest -> ochre crest
    stops = [(0, (214, 205, 160)), (60, (205, 200, 150)), (90, (160, 190, 110)),
             (150, (104, 160, 86)), (230, (70, 130, 70)), (320, (126, 140, 80)), (420, (180, 160, 110))]
    r = np.zeros_like(z); g = np.zeros_like(z); b = np.zeros_like(z)
    for (z0, c0), (z1, c1) in zip(stops, stops[1:]):
        m = (z >= z0) & (z < z1) if z1 != stops[-1][0] else (z >= z0)
        t = np.clip((z - z0) / (z1 - z0), 0, 1)
        r = np.where(m, c0[0] + (c1[0] - c0[0]) * t, r)
        g = np.where(m, c0[1] + (c1[1] - c0[1]) * t, g)
        b = np.where(m, c0[2] + (c1[2] - c0[2]) * t, b)
    # urban density from the street network -> warm city tone; elsewhere farmland patchwork
    dens = np.zeros((gh, gw))
    for n, line in D['streets']:
        for (a0, a1), (b0, b1) in zip(line, line[1:]):
            xa, ya = P(a0, a1); xb, yb = P(b0, b1)
            k_ = max(2, int(math.hypot(xb - xa, yb - ya) / S / 2))
            for t_ in np.linspace(0, 1, k_):
                xi = int((xa + (xb - xa) * t_) / S); yi = int((ya + (yb - ya) * t_) / S)
                if 0 <= xi < gw and 0 <= yi < gh: dens[yi, xi] += 1
    dens = gaussian_filter(dens, 5)
    urb = np.clip((dens - 0.10) / 0.25, 0, 1)
    rng = np.random.default_rng(7)
    ang = math.radians(22)
    u_ = (gx * math.cos(ang) + gy * math.sin(ang)) // 13
    v_ = (-gx * math.sin(ang) + gy * math.cos(ang)) // 8
    h_ = ((u_ * 73856093).astype(np.int64) ^ (v_ * 19349663).astype(np.int64)) % 997 / 997.0
    fpal = np.array([(188, 204, 120), (206, 206, 132), (170, 196, 112), (214, 196, 128), (160, 186, 104), (198, 214, 140)])
    fc = fpal[(h_ * len(fpal)).astype(int) % len(fpal)]
    edge = ((gx * math.cos(ang) + gy * math.sin(ang)) % 13 < 0.9) | ((-gx * math.sin(ang) + gy * math.cos(ang)) % 8 < 0.9)
    fc = np.where(edge[..., None], fc * 0.86, fc)
    city = np.array([224, 214, 186])
    plain_w = 1 - np.clip((z - 60) / 30, 0, 1)        # only on the plain
    mix = (1 - urb)[..., None] * plain_w[..., None]
    base = np.dstack([r, g, b])
    base = base * (1 - plain_w[..., None]) + (city * urb[..., None] + fc * (1 - urb[..., None])) * plain_w[..., None]
    r, g, b = base[..., 0], base[..., 1], base[..., 2]
    k = 0.55 + 0.6 * shade
    hill = np.clip((z - 55) / 40, 0, 1)        # apply shading only on slopes
    k = 1 + (k - 1) * hill
    rgb = np.dstack([r * k, g * k, b * k]).clip(0, 255).astype(np.uint8)
    im = Image.fromarray(rgb).resize((W, H), Image.BICUBIC)
    buf = io.BytesIO(); im.save(buf, 'PNG', optimize=True)
    return base64.b64encode(buf.getvalue()).decode()

# ---------------------------------------------------------------- icons (original, simple glyphs on 0..100 box)
ICON = {
    'towers': '<path d="M34 86V22l8-8 8 8v64z M56 86V34l6-6 6 6v52z" fill="#fff"/><rect x="38" y="30" width="8" height="5" fill="{bg}"/><rect x="59" y="42" width="6" height="5" fill="{bg}"/>',
    'piazza': '<path d="M50 14 L54 30 H46z M47 30h6v26h-6z M30 38c2 10 8 16 20 18c12-2 18-8 20-18" stroke="#fff" stroke-width="6" fill="none"/><rect x="28" y="62" width="44" height="8" fill="#fff"/><rect x="34" y="72" width="32" height="12" fill="#fff"/>',
    'church': '<path d="M50 12v14 M43 19h14" stroke="#fff" stroke-width="6"/><path d="M22 86V52l28-22 28 22v34z" fill="#fff"/><path d="M42 86V68a8 8 0 0 1 16 0v18z" fill="{bg}"/>',
    'arch': '<path d="M14 84V44h72v40h-12V62a10 10 0 0 0-20 0v22h-8V62a10 10 0 0 0-20 0v22z" fill="#fff"/><rect x="10" y="34" width="80" height="8" fill="#fff"/>',
    'plane': '<path d="M50 10c5 0 7 6 7 12v18l30 16v9l-30-8v18l9 7v7l-16-4-16 4v-7l9-7V57l-30 8v-9l30-16V22c0-6 2-12 7-12z" fill="#fff"/>',
    'train': '<rect x="26" y="14" width="48" height="58" rx="10" fill="#fff"/><rect x="33" y="22" width="34" height="20" rx="3" fill="{bg}"/><circle cx="38" cy="58" r="5" fill="{bg}"/><circle cx="62" cy="58" r="5" fill="{bg}"/><path d="M34 74l-8 14 M66 74l8 14" stroke="#fff" stroke-width="6"/>',
    'ball': '<circle cx="50" cy="50" r="32" fill="#fff"/><path d="M50 32l14 10-5 17H41l-5-17z" fill="{bg}"/><path d="M50 18v14 M64 42l15-5 M59 59l9 13 M41 59l-9 13 M36 42l-15-5" stroke="{bg}" stroke-width="4"/>',
    'cap': '<path d="M50 20 92 38 50 56 8 38z" fill="#fff"/><path d="M26 47v18c8 8 40 8 48 0V47L50 58z" fill="#fff"/><path d="M84 42v24" stroke="#fff" stroke-width="5"/><circle cx="84" cy="70" r="5" fill="#fff"/>',
    'tree': '<circle cx="50" cy="38" r="22" fill="#fff"/><circle cx="34" cy="52" r="15" fill="#fff"/><circle cx="66" cy="52" r="15" fill="#fff"/><rect x="45" y="56" width="10" height="30" fill="#fff"/>',
    'expo': '<path d="M14 82V40l36-22 36 22v42z" fill="#fff"/><rect x="26" y="50" width="12" height="32" fill="{bg}"/><rect x="44" y="50" width="12" height="32" fill="{bg}"/><rect x="62" y="50" width="12" height="32" fill="{bg}"/>',
    'food': '<ellipse cx="50" cy="52" rx="34" ry="24" fill="#fff"/><circle cx="38" cy="46" r="4" fill="{bg}"/><circle cx="56" cy="58" r="4" fill="{bg}"/><circle cx="62" cy="42" r="3" fill="{bg}"/><circle cx="44" cy="62" r="3" fill="{bg}"/><path d="M84 48l10-8" stroke="#fff" stroke-width="5"/>',
    'hospital': '<path d="M40 16h20v24h24v20H60v24H40V60H16V40h24z" fill="#fff"/>',
    'tower': '<path d="M38 88V26l16-12v74z" fill="#fff"/><path d="M58 88V30l6 4v54z" fill="#fff"/>',
    'moto': '<circle cx="24" cy="66" r="14" stroke="#fff" stroke-width="7" fill="none"/><circle cx="76" cy="66" r="14" stroke="#fff" stroke-width="7" fill="none"/><path d="M24 66l18-22h22l12 22 M42 44l-6-10h-10 M58 44l8-14h10" stroke="#fff" stroke-width="7" fill="none" stroke-linejoin="round"/>',
    'eye': '<path d="M8 50c18-26 66-26 84 0-18 26-66 26-84 0z" fill="#fff"/><circle cx="50" cy="50" r="14" fill="{bg}"/><circle cx="50" cy="50" r="6" fill="#fff"/>',
    'star': '<path d="M50 10l11 26 28 2-21 18 7 28-25-15-25 15 7-28-21-18 28-2z" fill="#fff"/>',
}
def blip(kind, x, y, bg, r=30):
    g = ICON[kind].replace('{bg}', bg)
    s = r * 2 / 100 * 0.72
    return (f'<g transform="translate({x:.1f},{y:.1f})" filter="url(#drop)">'
            f'<circle r="{r+5}" fill="#fff"/><circle r="{r}" fill="{bg}"/>'
            f'<g transform="scale({s:.3f}) translate(-50,-50)">{g}</g></g>')

SEA_LABELS = {
    'portrait': [('CASTEL MAGGIORE CHANNEL', 11.40, 44.566, 0), ('SAN LAZZARO STRAIT', 11.408, 44.438, 0)],
    'wide': [('CASTEL MAGGIORE CHANNEL', 11.40, 44.566, 0), ('SAN LAZZARO STRAIT', 11.425, 44.438, 0),
             ('PIANURA PADANA BAY', 11.20, 44.53, -90), ('CASALECCHIO SOUND', 11.235, 44.44, 0)],
    'square': [],
}
# landmarks: (icon, lon, lat, color, label, label side)
LANDMARKS = [
    ('towers', 11.3466, 44.4943, '#e0452f', '', 'e'),


    ('train', 11.3426, 44.5058, '#4b4f63', 'CENTRALE', 'n'),
    ('church', 11.2981, 44.4790, '#8a3fd1', 'SAN LUCA', 'w'),
    ('arch', 11.3168, 44.4917, '#ff3fa4', 'MELONCELLO\nARCH', 'n'),
    ('plane', 11.2887, 44.5350, '#2f9ad6', 'MARCONI AIRPORT', 'n'),
    ('ball', 11.3099, 44.4923, '#2fa35a', 'STADIUM', 'w'),
    ('expo', 11.3660, 44.5122, '#e0a21b', 'FIERA', 'e'),
    ('tree', 11.3532, 44.4822, '#3f9a3a', 'GIARDINI\nMARGHERITA', 's'),
    ('tree', 11.3468, 44.5023, '#3f9a3a', 'MONTAGNOLA', 'w'),
    ('hospital', 11.3712, 44.4936, '#d93a3a', '', 'e'),
    ('hospital', 11.3078, 44.5003, '#d93a3a', '', 'e'),
    ('tower', 11.3797, 44.5064, '#5b6bd6', 'SKYLINE TOWER', 'e'),
    ('moto', 11.2930, 44.5142, '#c8102e', 'MOTOR MUSEUM', 'w'),
    ('eye', 11.3452, 44.4842, '#6b56c9', 'SAN MICHELE\nVIEWPOINT', 'w'),
]

def text(x, y, s, size, fill='#fff', font='Oswald', weight=700, anchor='middle', ls=0.06,
         halo='#1b1b24', hw=None, extra=''):
    hw = size * 0.22 if hw is None else hw
    lines = s.split('\n'); out = []
    lh = size * 1.02
    y0 = y - (len(lines) - 1) * lh / 2
    for i, l in enumerate(lines):
        out.append(f'<text x="{x:.1f}" y="{y0 + i*lh:.1f}" font-family="{font}" font-weight="{weight}" '
                   f'font-size="{size}" fill="{fill}" text-anchor="{anchor}" dominant-baseline="central" '
                   f'letter-spacing="{ls}em" stroke="{halo}" stroke-width="{hw:.1f}" stroke-linejoin="round" '
                   f'paint-order="stroke" {extra}>{l}</text>')
    return ''.join(out)

# ---------------------------------------------------------------- build
def build():
    o = []
    o.append(f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
             f'width="{W}" height="{H}" viewBox="0 0 {W} {H}">')
    o.append(f'<style>{FONT_CSS}</style>')
    land_d = path(comune, True)
    o.append('<defs>')
    o.append(f'<clipPath id="land"><path d="{land_d}"/></clipPath>')
    o.append(f'<radialGradient id="sea" cx="45%" cy="50%" r="75%"><stop offset="0" stop-color="{C["sea0"]}"/><stop offset="1" stop-color="{C["sea1"]}"/></radialGradient>')
    o.append('<filter id="drop" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity=".45"/></filter>')
    o.append('<filter id="landshadow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="22"/></filter>')
    o.append('<filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter>')
    o.append('<pattern id="waves" width="90" height="46" patternUnits="userSpaceOnUse"><path d="M0 23 q22 -14 45 0 t45 0" stroke="#2c7896" stroke-width="2" fill="none" opacity=".35"/></pattern>')
    o.append('<pattern id="roofs2" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><rect width="22" height="22" fill="#cf6046"/><rect width="11" height="22" fill="#c25239"/></pattern><pattern id="roofs" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><rect width="14" height="14" fill="#c9573d"/><rect width="7" height="14" fill="#bd4b33"/></pattern>')
    o.append('<linearGradient id="title" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe37a"/><stop offset=".5" stop-color="#ff8a3d"/><stop offset="1" stop-color="#ff3f7f"/></linearGradient>')
    o.append('<linearGradient id="panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1622" stop-opacity=".86"/><stop offset="1" stop-color="#0b1622" stop-opacity=".94"/></linearGradient>')
    o.append('</defs>')

    # sea
    o.append(f'<rect width="{W}" height="{H}" fill="url(#sea)"/>')
    o.append(f'<rect width="{W}" height="{H}" fill="url(#waves)"/>')
    # neighbour "islands" hint: faint shelf ring
    o.append(f'<path d="{land_d}" fill="none" stroke="#2f7f9a" stroke-width="120" opacity=".18" stroke-linejoin="round"/>')
    o.append(f'<path d="{land_d}" fill="none" stroke="#3c93ad" stroke-width="56" opacity=".25" stroke-linejoin="round"/>')
    o.append(f'<path d="{land_d}" fill="#000" opacity=".55" filter="url(#landshadow)" transform="translate(10,18)"/>')
    # beach + land
    o.append(f'<path d="{land_d}" fill="{C["sand"]}" stroke="{C["sand"]}" stroke-width="22" stroke-linejoin="round"/>')
    o.append(f'<path d="{land_d}" fill="none" stroke="#fff6dc" stroke-width="5" stroke-linejoin="round" opacity=".9"/>')

    # terrain raster, clipped
    o.append(f'<g clip-path="url(#land)">')
    o.append(f'<image x="0" y="0" width="{W}" height="{H}" xlink:href="data:image/png;base64,{terrain_png()}"/>')

    # zones: subtle tint over plains, terracotta in centro
    for props, rings in D['zones']:
        n = props['nomezona']; col = ZONES.get(n, ('#d0c090', n))[0]
        d = ''.join(path(r, True) for r in rings)
        if n in CENTRO:
            o.append(f'<path d="{d}" fill="url(#roofs)" opacity=".95"/>')
        else:
            o.append(f'<path d="{d}" fill="{col}" opacity=".38"/>')
    for props, rings in D['zones']:
        d = ''.join(path(r, True) for r in rings)
        o.append(f'<path d="{d}" fill="none" stroke="#fff7e0" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round" opacity=".8"/>')

    # parks + special areas
    for k in ('montagnola', 'margherita'):
        o.append(f'<path d="{path(D["osm"][k][0], True)}" fill="{C["park"]}" stroke="{C["park2"]}" stroke-width="3"/>')
    o.append(f'<path d="{path(D["osm"]["stadio"][0], True)}" fill="#6fbf5a" stroke="#fff" stroke-width="4"/>')
    o.append(f'<path d="{path(D["osm"]["fiera"][0], True)}" fill="#e7d3a8" stroke="#a88a52" stroke-width="3"/>')
    ap = D['osm']['airport'][0]
    o.append(f'<path d="{path(ap, True)}" fill="#c9c7bd" stroke="#8d8b80" stroke-width="3" opacity=".95"/>')
    # runway along the airport's long axis
    xy = np.array([P(*p) for p in ap]); m = xy.mean(0); u, s, vt = np.linalg.svd(xy - m); ax = vt[0]
    proj = (xy - m) @ ax; a = m + ax * proj.min() * 0.86; b = m + ax * proj.max() * 0.86
    o.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="#3b3d44" stroke-width="26" stroke-linecap="butt"/>')
    o.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="#fff" stroke-width="2.5" stroke-dasharray="18 14"/>')

    # contour lines in the hills
    cl = []
    for q, line in D['contours']:
        if q < 80 or not in_view(line): continue
        w = 1.6 if q % 100 else 2.6
        cl.append(f'<path d="{path(line)}" stroke-width="{w}"/>')
    o.append('<g fill="none" stroke="#2f5a2a" opacity=".22">' + ''.join(cl) + '</g>')

    # water
    def river(lines, w):
        d = ''.join(path(l) for l in lines)
        return (f'<path d="{d}" fill="none" stroke="{C["water_edge"]}" stroke-width="{w+7}" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>'
                f'<path d="{d}" fill="none" stroke="{C["water"]}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>')
    o.append(river(D['osm']['reno'], 16))
    o.append(river(D['osm']['savena'], 10))
    o.append(river(D['osm']['canalereno'], 5))

    # rail
    rl = ''.join(path(l) for l in D['rail'] if in_view(l))
    o.append(f'<path d="{rl}" fill="none" stroke="{C["rail"]}" stroke-width="3.2" opacity=".75"/>')

    # streets by class
    groups = {'st': [], 'art': [], 'ring': [], 'mw': []}
    for n, l in D['streets']:
        if in_view(l): groups[road_class(n)].append(path(l))
    spec = {'st': (C['road_case'], C['road'], 3.4, 1.9), 'art': (C['art_case'], C['art'], 8, 5),
            'ring': (C['ring_case'], C['ring'], 14, 9), 'mw': (C['mw_case'], C['mw'], 15, 10)}
    for k in ('st', 'art', 'ring', 'mw'):
        case, fill, wc, wf = spec[k]; d = ''.join(groups[k])
        o.append(f'<path d="{d}" fill="none" stroke="{case}" stroke-width="{wc}" stroke-linecap="round" stroke-linejoin="round" opacity="{.55 if k=="st" else 1}"/>')
    for k in ('st', 'art', 'ring', 'mw'):
        case, fill, wc, wf = spec[k]; d = ''.join(groups[k])
        o.append(f'<path d="{d}" fill="none" stroke="{fill}" stroke-width="{wf}" stroke-linecap="round" stroke-linejoin="round"/>')

    # the portico route (Porta Saragozza -> Meloncello -> San Luca) as a GPS waypoint line
    route = [l for n, l in D['streets'] if n in ('VIA SARAGOZZA', 'VIA DI SAN LUCA')]
    route = [l for l in route if any(p[0] < 11.331 for p in l)]
    rd = ''.join(path(l) for l in route)
    o.append(f'<path d="{rd}" fill="none" stroke="{C["route_glow"]}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" opacity=".55" filter="url(#glow)"/>')
    o.append(f'<path d="{rd}" fill="none" stroke="{C["route"]}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>')
    o.append(f'<path d="{rd}" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="1 14" stroke-linecap="round"/>')
    o.append('</g>')  # end land clip

    # zone labels
    for props, rings in D['zones']:
        n = props['nomezona']
        if n in CENTRO: continue
        poly = Polygon(max((r for r in rings if len(r) > 3), key=lambda r: Polygon(r).buffer(0).area)).buffer(0)
        c = poly.representative_point() if not poly.contains(poly.centroid) else poly.centroid
        dx, dy = NUDGE.get(n, (0, 0))
        x, y = P(c.x + dx / KX, c.y + dy / KY)
        o.append(text(x, y, ZONES[n][1], 36, fill='#fffaf0', font='Oswald', ls=0.12, halo='#3b2f1f', hw=9,
                      extra='opacity=".93"'))
    # centro storico label
    x, y = P(11.3395, 44.4985)
    o.append(text(x, y, 'OLD TOWN', 34, fill='#fff', font='Bungee', weight=400, ls=0.08, halo='#5a1a10', hw=8))

    # hills label + outside areas
    x, y = P(11.326, 44.455); o.append(text(x, y, 'APENNINE FOOTHILLS', 36, fill='#efffe0', ls=0.3, halo='#23401f', hw=8, extra='font-style="italic"'))
    x, y = P(11.385, 44.462); o.append(text(x, y, 'MONTE DONATO', 26, fill='#efffe0', ls=0.2, halo='#23401f', hw=6))
    # road / ring callouts
    x, y = P(11.358, 44.5012); o.append(text(x, y, 'THE VIALI LOOP', 22, fill='#ffe27a', font='Barlow Condensed', ls=0.15, halo='#4a2a06', hw=6, extra=f'transform="rotate(38 {x:.0f} {y:.0f})"'))
    x, y = P(11.352, 44.5285); o.append(text(x, y, 'TANGENZIALE', 26, fill='#ffd2b0', font='Barlow Condensed', ls=0.3, halo='#4a1806', hw=6))
    x, y = P(11.3068, 44.5245); o.append(text(x, y, 'RENO RIVER', 26, fill='#dffbff', font='Barlow Condensed', ls=0.3, halo='#0b4a5a', hw=6, extra=f'transform="rotate(-68 {x:.0f} {y:.0f})"'))
    x, y = P(11.392, 44.4845); o.append(text(x, y, 'SAVENA', 22, fill='#dffbff', font='Barlow Condensed', ls=0.3, halo='#0b4a5a', hw=6, extra=f'transform="rotate(-62 {x:.0f} {y:.0f})"'))
    x, y = P(11.3025, 44.4855); o.append(text(x, y, 'PORTICO TRAIL\n666 ARCHES', 22, fill='#ffd6ef', font='Barlow Condensed', ls=0.12, halo='#6a0f43', hw=6))

    # sea labels (neighbouring towns as 'off-map')
    sea = SEA_LABELS[MODE]
    for s, lon, lat, rot in sea:
        x, y = P(lon, lat)
        if 40 < x < W - 40 and 40 < y < H - 40:
            o.append(text(x, y, s, 30, fill='#7fc3d8', font='Barlow Condensed', weight=400, ls=0.45, halo='none', hw=0,
                          extra=f'font-style="italic" transform="rotate({rot} {x:.0f} {y:.0f})"'))

    # landmark blips
    for kind, lon, lat, col, lab, side in LANDMARKS:
        x, y = P(lon, lat)
        o.append(blip(kind, x, y, col, 23))
    for kind, lon, lat, col, lab, side in LANDMARKS:
        if not lab: continue
        x, y = P(lon, lat)
        off = {'e': (38, 0, 'start'), 'w': (-38, 0, 'end'), 'n': (0, -50, 'middle'), 's': (0, 52, 'middle')}[side]
        nl = lab.count('\n')
        yy = y + off[1] + (nl * 12 if side == 's' else -nl * 12 if side == 'n' else 0)
        o.append(text(x + off[0], yy, lab, 22, fill='#fff', font='Barlow Condensed', ls=0.08, anchor=off[2], halo='#14141c', hw=6))

    if MODE == 'portrait':
        x, y = P(11.3355, 44.4900)
        o.append(f'<path d="M{x:.0f},{y:.0f} L640,1530" stroke="#ffcf3f" stroke-width="4" stroke-dasharray="12 9" fill="none" opacity=".9"/>')
        o.extend(inset(64, 1530, 620, 600, PXKM * 1.7))
    elif MODE == 'wide':
        o.extend(inset(2700, 1230, 1060, 700, PXKM * 1.9))
    o.extend(chrome())
    o.append('</svg>')
    return '\n'.join(o)


INSET_MARKS = [
    ('towers', 11.3466, 44.4943, '#e0452f', 'DUE TORRI', 'e'),
    ('piazza', 11.3428, 44.4940, '#e0452f', 'PIAZZA\nMAGGIORE', 'w'),
    ('food', 11.3447, 44.4928, '#f08a24', 'QUADRILATERO', 's'),
    ('church', 11.3482, 44.4918, '#8a3fd1', 'SANTO STEFANO', 'e'),
    ('cap', 11.3527, 44.4967, '#3f6fd8', 'UNIVERSITY', 'n'),
    ('train', 11.3426, 44.5058, '#4b4f63', 'CENTRALE', 'e'),
    ('tree', 11.3468, 44.5021, '#3f9a3a', 'MONTAGNOLA', 'e'),
    ('arch', 11.3297, 44.4906, '#ff3fa4', 'PORTA SARAGOZZA', 's'),
    ('star', 11.3352, 44.4987, '#e0a21b', 'CANALE DELLE MOLINE', 'n'),
]

def inset(x0, y0, w, h, pxkm):
    """zoomed 'OLD TOWN' panel"""
    global CX, CY, PXKM
    save = (CX, CY, PXKM)
    PXKM = pxkm; CX = x0 + w / 2; CY = y0 + h / 2 + 18
    lonc, latc = 11.3425, 44.4972
    # shift so the old-town centre lands in the panel middle
    CX -= (lonc - LON_C) * KX * PXKM; CY += (latc - LAT_C) * KY * PXKM
    o = [f'<clipPath id="insclip"><rect x="{x0}" y="{y0}" width="{w}" height="{h}" rx="22"/></clipPath>',
         f'<g filter="url(#drop)"><rect x="{x0-6}" y="{y0-6}" width="{w+12}" height="{h+12}" rx="26" fill="#ffcf3f"/></g>',
         f'<g clip-path="url(#insclip)"><rect x="{x0}" y="{y0}" width="{w}" height="{h}" fill="#e2d6b4"/>']
    for props, rings in D['zones']:
        n = props['nomezona']; d = ''.join(path(r, True) for r in rings)
        o.append(f'<path d="{d}" fill="{"url(#roofs2)" if n in CENTRO else "#e2d6b4"}"/>')
    for k in ('montagnola',):
        o.append(f'<path d="{path(D["osm"][k][0], True)}" fill="{C["park"]}" stroke="{C["park2"]}" stroke-width="3"/>')
    o.append(f'<path d="{"".join(path(l) for l in D["rail"] if in_view(l))}" fill="none" stroke="{C["rail"]}" stroke-width="4"/>')
    o.append(f'<path d="{"".join(path(l) for l in D["osm"]["canalereno"])}" fill="none" stroke="{C["water"]}" stroke-width="7"/>')
    groups = {'st': [], 'art': [], 'ring': [], 'mw': []}
    for n, l in D['streets']:
        if in_view(l, 50): groups[road_class(n)].append(path(l))
    spec = {'st': ('#7a3a28', '#fff3dc', 9, 5.5), 'art': (C['art_case'], C['art'], 15, 10),
            'ring': (C['ring_case'], C['ring'], 24, 17), 'mw': (C['mw_case'], C['mw'], 20, 14)}
    for pas in (0, 1):
        for k in ('st', 'art', 'ring'):
            cse, fill, wc, wf = spec[k]
            o.append(f'<path d="{"".join(groups[k])}" fill="none" stroke="{cse if pas == 0 else fill}" stroke-width="{wc if pas == 0 else wf}" stroke-linecap="round" stroke-linejoin="round"/>')
    # piazza maggiore plaza
    for kind, lon, lat, col, lab, side in INSET_MARKS:
        x, y = P(lon, lat); o.append(blip(kind, x, y, col, 27))
    for kind, lon, lat, col, lab, side in INSET_MARKS:
        x, y = P(lon, lat)
        off = {'e': (40, 0, 'start'), 'w': (-40, 0, 'end'), 'n': (0, -50, 'middle'), 's': (0, 50, 'middle')}[side]
        o.append(text(x + off[0], y + off[1], lab, 25, fill='#fff', font='Barlow Condensed', ls=0.06, anchor=off[2], halo='#14141c', hw=6))
    # header bar
    o.append(f'<rect x="{x0}" y="{y0}" width="{w}" height="70" fill="#0b1622" fill-opacity=".9"/>')
    o.append(text(x0 + 26, y0 + 36, 'OLD TOWN', 34, fill='#ffcf3f', font='Bungee', weight=400, anchor='start', ls=0.06, halo='none', hw=0))
    o.append(text(x0 + w - 24, y0 + 38, 'ZOOM ×1.7', 24, fill='#9fc3d3', font='Barlow Condensed', anchor='end', ls=0.2, halo='none', hw=0))
    o.append('</g>')
    CX, CY, PXKM = save
    return o

# ---------------------------------------------------------------- title, legend, compass, credits
LEGEND = [('towers', '#e0452f', 'Landmark'), ('food', '#f08a24', 'Food & market'), ('cap', '#3f6fd8', 'University'),
          ('train', '#4b4f63', 'Station'), ('plane', '#2f9ad6', 'Airport'), ('church', '#8a3fd1', 'Sanctuary'),
          ('ball', '#2fa35a', 'Stadium'), ('expo', '#e0a21b', 'Trade fair'), ('tree', '#3f9a3a', 'Park'),
          ('hospital', '#d93a3a', 'Hospital'), ('moto', '#c8102e', 'Motor museum'), ('eye', '#6b56c9', 'Viewpoint')]

def chrome():
    o = []
    if MODE == 'wide':
        tx, ty, tsize = 2700, 250, 215
        lx, ly, lw, cols = 2700, 560, 1060, 3
        comp = (380, 200); cred = (W - 50, H - 34, 'end')
    elif MODE == 'square':
        tx, ty, tsize = 70, 150, 170
        lx, ly, lw, cols = 1470, 1610, 640, 2
        comp = (2060, 120); cred = (W - 40, H - 28, 'end')
    else:
        tx, ty, tsize = 80, 200, 210
        lx, ly, lw, cols = 70, 2190, 2020, 4
        comp = (2030, 150); cred = (W / 2, H - 28, 'middle')
    # title block
    o.append(f'<text x="{tx}" y="{ty}" font-family="Bungee" font-size="{tsize}" fill="url(#title)" stroke="#2a0d1d" stroke-width="{tsize*0.07:.0f}" paint-order="stroke" stroke-linejoin="round" letter-spacing="0.02em">BOLOGNA</text>')
    o.append(f'<text x="{tx + 12}" y="{ty + tsize*0.52:.0f}" font-family="Pacifico" font-size="{tsize*0.36:.0f}" fill="#fff" stroke="#2a0d1d" stroke-width="10" paint-order="stroke" stroke-linejoin="round">la Dotta · la Grassa · la Rossa</text>')
    if MODE == 'wide':
        o.append(text(tx + 10, ty + tsize * 0.95, 'OPEN-WORLD CITY MAP  ·  EMILIA-ROMAGNA, ITALY', 34, fill='#ffd88a', font='Barlow Condensed', anchor='start', ls=0.25, halo='#0b1622', hw=6))
    # legend panel
    rows = math.ceil(len(LEGEND) / cols); rh = 74
    ph = 110 + rows * rh + (130 if cols >= 4 else 190)
    o.append(f'<rect x="{lx}" y="{ly}" width="{lw}" height="{ph}" rx="22" fill="url(#panel)" stroke="#ffcf3f" stroke-opacity=".55" stroke-width="3"/>')
    o.append(text(lx + 36, ly + 52, 'MAP LEGEND', 36, fill='#ffcf3f', font='Bungee', weight=400, anchor='start', ls=0.08, halo='none', hw=0))
    cw = (lw - 60) / cols
    for i, (k, col, lab) in enumerate(LEGEND):
        cx = lx + 60 + (i % cols) * cw; cy = ly + 130 + (i // cols) * rh
        o.append(blip(k, cx, cy, col, 24))
        o.append(text(cx + 44, cy, lab, 32, fill='#f4f1ea', font='Barlow Condensed', weight=700, anchor='start', ls=0.04, halo='none', hw=0))
    # line legend
    yy = ly + 130 + rows * rh + 10
    items = [(C['mw'], C['mw_case'], 'Motorway / Tangenziale', None), (C['ring'], C['ring_case'], 'The Viali loop', None),
             (C['water'], C['water_edge'], 'River', None), (C['route'], C['route_glow'], 'Portico trail to San Luca', 'dash'),
             ('#c9573d', '#5a1a10', 'Old Town (ZTL: ★★★ wanted level)', 'box')]
    cw2 = (lw - 60) / (2 if cols < 4 else 3)
    for i, (f, cse, lab, kind) in enumerate(items):
        per = 2 if cols < 4 else 3
        cx = lx + 40 + (i % per) * cw2; cy = yy + (i // per) * 56
        if kind == 'box':
            o.append(f'<rect x="{cx}" y="{cy-14}" width="52" height="28" rx="5" fill="url(#roofs)" stroke="#fff" stroke-width="2"/>')
        else:
            o.append(f'<line x1="{cx}" y1="{cy}" x2="{cx+52}" y2="{cy}" stroke="{cse}" stroke-width="16" stroke-linecap="round"/>')
            o.append(f'<line x1="{cx}" y1="{cy}" x2="{cx+52}" y2="{cy}" stroke="{f}" stroke-width="9" stroke-linecap="round"/>')
        o.append(text(cx + 70, cy, lab, 28, fill='#f4f1ea', font='Barlow Condensed', weight=400, anchor='start', ls=0.03, halo='none', hw=0))
    # compass
    x, y = comp
    o.append(f'<g transform="translate({x},{y})" filter="url(#drop)"><circle r="62" fill="#0b1622" fill-opacity=".85" stroke="#ffcf3f" stroke-width="4"/>'
             f'<path d="M0 -48 L16 6 L0 -4 L-16 6z" fill="#ff3f7f"/><path d="M0 48 L16 -6 L0 4 L-16 -6z" fill="#e8e2d0"/>'
             f'<text y="-70" text-anchor="middle" font-family="Bungee" font-size="34" fill="#fff" stroke="#0b1622" stroke-width="8" paint-order="stroke">N</text></g>')
    # scale bar (2 km)
    sx, sy = (lx + lw - 330, ly + 52)
    L = 2 * PXKM
    o.append(f'<rect x="{sx}" y="{sy-8}" width="{L/2:.0f}" height="14" fill="#fff"/><rect x="{sx+L/2:.0f}" y="{sy-8}" width="{L/2:.0f}" height="14" fill="#ffcf3f"/>')
    o.append(text(sx + L / 2, sy + 34, '0 ─ 1 ─ 2 KM', 24, fill='#fff', font='Barlow Condensed', ls=0.2, halo='none', hw=0))
    # credits
    x, y, a = cred
    o.append(text(x, y, 'Data: Comune di Bologna Open Data (CC BY 4.0) · © OpenStreetMap contributors (ODbL) · Fan-made illustrated map, not affiliated with any game publisher',
                  20, fill='#9fc3d3', font='Barlow Condensed', weight=400, anchor=a, ls=0.04, halo='none', hw=0))
    return o

if __name__ == '__main__':
    svg = build()
    out = os.path.join(HERE, 'out', f'bologna-map-{MODE}.svg')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, 'w').write(svg)
    print(out, len(svg) // 1024, 'KB')
