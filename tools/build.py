"""Bundles src/ into deployable outputs.

    python3 tools/build.py

dist/site/        static site: index.html + bologna.json + terrain.jpg (host anywhere)
dist/bologna-waypoint-standalone.html   one file with everything inlined (double-click to open)
dist/artifact/    page body for a claude.ai Artifact (served next to dist/site data files)
"""
import os, base64, json, shutil
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda *p: os.path.join(ROOT, *p)

FONTS = [('Bungee', 400, 'bungee-latin-400-normal.woff2'), ('Oswald', 700, 'oswald-latin-700-normal.woff2'),
         ('Barlow Condensed', 400, 'barlow-condensed-latin-400-normal.woff2'),
         ('Barlow Condensed', 700, 'barlow-condensed-latin-700-normal.woff2'),
         ('Pacifico', 400, 'pacifico-latin-400-normal.woff2')]


def b64(path):
    return base64.b64encode(open(path, 'rb').read()).decode()


font_css = ''.join(
    f"@font-face{{font-family:'{n}';font-weight:{w};font-display:swap;src:url(data:font/woff2;base64,{b64(A('assets', 'fonts', f))}) format('woff2');}}"
    for n, w, f in FONTS)
html = open(A('src', 'index.html')).read().replace('/*FONTS*/', font_css)
app = open(A('src', 'app.js')).read()

HEAD = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n')
page = lambda body: HEAD + body.replace('<canvas id="map"', '</head>\n<body>\n<canvas id="map"', 1) + '\n</body>\n</html>\n'

# static site (full HTML document)
site = A('dist', 'site')
os.makedirs(site, exist_ok=True)
open(os.path.join(site, 'index.html'), 'w').write(page(html.replace('<!--APP-->', f'<script>\n{app}\n</script>')))
shutil.copy(A('assets', 'bologna.json'), site)
shutil.copy(A('assets', 'terrain.jpg'), site)
# claude.ai Artifact build (the host adds the document skeleton)
art = A('dist', 'artifact')
os.makedirs(art, exist_ok=True)
open(os.path.join(art, 'index.html'), 'w').write(html.replace('<!--APP-->', f'<script>\n{app}\n</script>'))

data = open(A('assets', 'bologna.json')).read()
boot = (f"<script>window.BOLOGNA_DATA={data};window.BW_TERRAIN_URL='data:image/jpeg;base64,{b64(A('assets', 'terrain.jpg'))}';</script>\n"
        f"<script>\n{app}\n</script>")
open(A('dist', 'bologna-waypoint-standalone.html'), 'w').write(page(html.replace('<!--APP-->', boot)))
for p in ('site/index.html', 'site/bologna.json', 'site/terrain.jpg', 'bologna-waypoint-standalone.html'):
    print(p, os.path.getsize(A('dist', p)) // 1024, 'KB')
