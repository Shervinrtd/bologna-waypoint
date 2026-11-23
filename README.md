# Bologna Waypoint

A client demo of a route finder for Bologna, styled like an open-world game map. You search a start and a
destination (or click the map), pick Drive, Ride or Walk, and get a route with travel time, distance and
turn-by-turn steps. **Start GPS** plays a simulated drive along the route with a next-turn banner.

It is an original design in the open-world map genre and uses no logos, fonts or icons from any game.

## Run it

Everything runs in the browser. There is no server, no API key, and nothing is sent to a third party.

- **Quickest:** open `dist/bologna-waypoint-standalone.html` in a browser. It is one file of about 1 MB with all data inlined.
- **As a website:** upload the three files in `dist/site/` to any static host (Netlify, Vercel, GitHub Pages, S3, nginx).
  To try it locally: `cd dist/site && python3 -m http.server 8000`, then open http://localhost:8000.

## How it works

| Part | How |
|---|---|
| Map | Custom Canvas 2D renderer (`src/app.js`): sea, island coastline, hillshaded terrain, districts, roads by class, rivers, rail, landmark blips, street labels. Pan, wheel/pinch zoom, double-click zoom. |
| Routing | A* on the Comune di Bologna street graph (8,048 street arcs, one connected network), run in the browser. Speeds per road class and mode. Driving can avoid the Old Town ZTL (limited-traffic zone). Start and end snap to the nearest point on a street, not just the nearest junction. |
| Search | Offline index of 1,970 street names, 20 landmarks and the 18 districts. Accent- and apostrophe-insensitive, prefix matching, house numbers ignored. |
| Directions | Steps are merged by street name, with left/right/slight/sharp from the turn angle. |
| Game layer | Mission card, "wanted level" stars when a car route enters the ZTL, waypoint toasts, simulated GPS drive. |

## Rebuild

```
pip install numpy scipy shapely pillow
python3 tools/prep.py     # data → assets/bologna.json + assets/terrain.jpg
python3 tools/build.py    # src + assets → dist/
```

`tools/render.py` and `tools/decode.py` come from the illustrated poster map and supply the palette, the
district names and the terrain painter.

## Limits of the demo, and how to go further

- **No one-way streets or turn restrictions.** The open street dataset has no direction data, so car routes can
  use a one-way street the wrong way. For production, swap `route()` for OSRM, GraphHopper or Valhalla on
  OpenStreetMap data; the rest of the app keeps working with any list of points.
- **Search finds streets and places, not house numbers.** To add addresses, call a geocoder such as Nominatim
  (on submit only, max 1 request per second, with attribution, per its usage policy) or a self-hosted Photon.
- **Times are estimates** from average speeds per road class, with no live traffic.
- **Coverage is the Comune di Bologna** (the "island"). Neighbouring towns are drawn as sea.

## Data and credits

- Streets, districts, railway, 10 m contours: Comune di Bologna Open Data (opendata.comune.bologna.it), CC BY 4.0
- Rivers, airport, parks, stadium, Fiera, city boundary: © OpenStreetMap contributors, ODbL
- Fonts (SIL Open Font License): Bungee, Oswald, Barlow Condensed, Pacifico

Fan-made map in the open-world game style; not affiliated with any game publisher.
