/* Bologna Waypoint: game-style city map with offline search and routing.
   Map + street graph: Comune di Bologna Open Data (CC BY 4.0) and OpenStreetMap (ODbL).
   World units are kilometres east (x) and north (y) of the map centre. */
(() => {
'use strict';

// ------------------------------------------------------------------ config
const DATA_URL = window.BW_DATA_URL || 'bologna.json';
const TERRAIN_URL = window.BW_TERRAIN_URL || 'terrain.jpg';
const PLACES_URL = window.BW_PLACES_URL || 'places.json';

const C = {
  seaA: '#0e3b52', seaB: '#071f33', shelf: '#2f7f9a', shelf2: '#3c93ad',
  sand: '#f3d9a4', sandLine: '#fff6dc',
  water: '#36c5d6', waterEdge: '#e8fbff',
  park: '#7fb35a', park2: '#5b9443',
  rail: '#5a5a66',
  route: '#ff3fa4', routeGlow: '#ff9ad2', routeCase: '#6a0f43',
};
const ROAD = [ // [casing, fill] per class: street, arterial, ring, motorway
  ['#a89a78', '#fff8e8'], ['#8a6d2f', '#ffe08a'], ['#7a4b12', '#ffcf3f'], ['#6e2a10', '#ff8a3d'],
];
// road width (casing px, fill px) by zoom (px per km), interpolated on log scale
const ROAD_W = [
  [[20, .7, .35], [60, 1.4, .8], [200, 3, 1.8], [600, 7, 4.6], [2000, 16, 12], [6000, 38, 31]],
  [[20, 1.6, 1], [60, 3, 2], [200, 6, 4], [600, 11, 7.6], [2000, 22, 17], [6000, 50, 42]],
  [[20, 2.6, 1.6], [60, 4.6, 3], [200, 9, 6], [600, 15, 10.6], [2000, 26, 20], [6000, 58, 48]],
  [[20, 3, 2], [60, 5, 3.4], [200, 10, 6.6], [600, 16, 11], [2000, 26, 20], [6000, 58, 48]],
];
const MODES = {
  drive: { name: 'Drive', speed: [28, 40, 42, 85], perArc: 4 / 3600, verb: 'Drive' },
  bike: { name: 'Ride', speed: [15, 16, 16, 0], perArc: 1.5 / 3600, verb: 'Ride' },
  walk: { name: 'Walk', speed: [4.8, 4.8, 4.8, 0], perArc: 0, verb: 'Walk' },
};
const NO_CARS = /^(GALLERIA|VOLTONE|PASSAGGIO|GIARDINO|CORTE) /;

// Icon glyphs on a 0..100 box (original, simple shapes; same set as the illustrated map)
const ICON = {
  towers: '<path d="M34 86V22l8-8 8 8v64z M56 86V34l6-6 6 6v52z" fill="#fff"/><rect x="38" y="30" width="8" height="5" fill="{bg}"/><rect x="59" y="42" width="6" height="5" fill="{bg}"/>',
  piazza: '<path d="M50 14 L54 30 H46z M47 30h6v26h-6z M30 38c2 10 8 16 20 18c12-2 18-8 20-18" stroke="#fff" stroke-width="6" fill="none"/><rect x="28" y="62" width="44" height="8" fill="#fff"/><rect x="34" y="72" width="32" height="12" fill="#fff"/>',
  church: '<path d="M50 12v14 M43 19h14" stroke="#fff" stroke-width="6"/><path d="M22 86V52l28-22 28 22v34z" fill="#fff"/><path d="M42 86V68a8 8 0 0 1 16 0v18z" fill="{bg}"/>',
  arch: '<path d="M14 84V44h72v40h-12V62a10 10 0 0 0-20 0v22h-8V62a10 10 0 0 0-20 0v22z" fill="#fff"/><rect x="10" y="34" width="80" height="8" fill="#fff"/>',
  plane: '<path d="M50 10c5 0 7 6 7 12v18l30 16v9l-30-8v18l9 7v7l-16-4-16 4v-7l9-7V57l-30 8v-9l30-16V22c0-6 2-12 7-12z" fill="#fff"/>',
  train: '<rect x="26" y="14" width="48" height="58" rx="10" fill="#fff"/><rect x="33" y="22" width="34" height="20" rx="3" fill="{bg}"/><circle cx="38" cy="58" r="5" fill="{bg}"/><circle cx="62" cy="58" r="5" fill="{bg}"/><path d="M34 74l-8 14 M66 74l8 14" stroke="#fff" stroke-width="6"/>',
  ball: '<circle cx="50" cy="50" r="32" fill="#fff"/><path d="M50 32l14 10-5 17H41l-5-17z" fill="{bg}"/><path d="M50 18v14 M64 42l15-5 M59 59l9 13 M41 59l-9 13 M36 42l-15-5" stroke="{bg}" stroke-width="4"/>',
  cap: '<path d="M50 20 92 38 50 56 8 38z" fill="#fff"/><path d="M26 47v18c8 8 40 8 48 0V47L50 58z" fill="#fff"/><path d="M84 42v24" stroke="#fff" stroke-width="5"/><circle cx="84" cy="70" r="5" fill="#fff"/>',
  tree: '<circle cx="50" cy="38" r="22" fill="#fff"/><circle cx="34" cy="52" r="15" fill="#fff"/><circle cx="66" cy="52" r="15" fill="#fff"/><rect x="45" y="56" width="10" height="30" fill="#fff"/>',
  expo: '<path d="M14 82V40l36-22 36 22v42z" fill="#fff"/><rect x="26" y="50" width="12" height="32" fill="{bg}"/><rect x="44" y="50" width="12" height="32" fill="{bg}"/><rect x="62" y="50" width="12" height="32" fill="{bg}"/>',
  food: '<ellipse cx="50" cy="52" rx="34" ry="24" fill="#fff"/><circle cx="38" cy="46" r="4" fill="{bg}"/><circle cx="56" cy="58" r="4" fill="{bg}"/><circle cx="62" cy="42" r="3" fill="{bg}"/><circle cx="44" cy="62" r="3" fill="{bg}"/><path d="M84 48l10-8" stroke="#fff" stroke-width="5"/>',
  hospital: '<path d="M40 16h20v24h24v20H60v24H40V60H16V40h24z" fill="#fff"/>',
  tower: '<path d="M38 88V26l16-12v74z" fill="#fff"/><path d="M58 88V30l6 4v54z" fill="#fff"/>',
  moto: '<circle cx="24" cy="66" r="14" stroke="#fff" stroke-width="7" fill="none"/><circle cx="76" cy="66" r="14" stroke="#fff" stroke-width="7" fill="none"/><path d="M24 66l18-22h22l12 22 M42 44l-6-10h-10 M58 44l8-14h10" stroke="#fff" stroke-width="7" fill="none" stroke-linejoin="round"/>',
  eye: '<path d="M8 50c18-26 66-26 84 0-18 26-66 26-84 0z" fill="#fff"/><circle cx="50" cy="50" r="14" fill="{bg}"/><circle cx="50" cy="50" r="6" fill="#fff"/>',
  star: '<path d="M50 10l11 26 28 2-21 18 7 28-25-15-25 15 7-28-21-18 28-2z" fill="#fff"/>',
  flag: '<path d="M30 88V12" stroke="#fff" stroke-width="8" stroke-linecap="round"/><path d="M34 14h44l-10 16 10 16H34z" fill="#fff"/>',
  player: '<path d="M50 14 78 82 50 66 22 82z" fill="#fff"/>',
};

// Places people search for (lon, lat). label = short map label; major = shown at city zoom.
const POIS = [
  { icon: 'towers', color: '#e0452f', name: 'Due Torri', label: 'DUE TORRI', alt: 'two towers asinelli garisenda torre', lon: 11.3466, lat: 44.4943, major: 1 },
  { icon: 'piazza', color: '#e0452f', name: 'Piazza Maggiore', label: 'PIAZZA MAGGIORE', alt: 'san petronio nettuno neptune main square centro', lon: 11.3428, lat: 44.4937, major: 1 },
  { icon: 'food', color: '#f08a24', name: 'Quadrilatero', label: 'QUADRILATERO', alt: 'food market mercato di mezzo pescherie vecchie', lon: 11.3447, lat: 44.4928 },
  { icon: 'church', color: '#8a3fd1', name: 'Santo Stefano', label: 'SANTO STEFANO', alt: 'sette chiese seven churches basilica', lon: 11.3482, lat: 44.4918 },
  { icon: 'cap', color: '#3f6fd8', name: 'University District', label: 'UNIVERSITY', alt: 'universita unibo alma mater zamboni', lon: 11.3527, lat: 44.4967 },
  { icon: 'train', color: '#4b4f63', name: 'Bologna Centrale', label: 'CENTRALE', alt: 'stazione centrale train station railway', lon: 11.3426, lat: 44.5058, major: 1 },
  { icon: 'church', color: '#8a3fd1', name: 'Sanctuary of San Luca', label: 'SAN LUCA', alt: 'santuario madonna di san luca basilica hill', lon: 11.2981, lat: 44.4790, major: 1 },
  { icon: 'arch', color: '#ff3fa4', name: 'Arco del Meloncello', label: 'MELONCELLO ARCH', alt: 'portico arch meloncello', lon: 11.3168, lat: 44.4917 },
  { icon: 'arch', color: '#ff3fa4', name: 'Porta Saragozza', label: 'PORTA SARAGOZZA', alt: 'gate porta', lon: 11.3297, lat: 44.4906 },
  { icon: 'plane', color: '#2f9ad6', name: 'Marconi Airport', label: 'MARCONI AIRPORT', alt: 'aeroporto airport blq guglielmo marconi', lon: 11.2887, lat: 44.5350, major: 1 },
  { icon: 'ball', color: '#2fa35a', name: "Stadio Dall'Ara", label: 'STADIUM', alt: 'stadium stadio football calcio renato dall ara', lon: 11.3099, lat: 44.4923, major: 1 },
  { icon: 'expo', color: '#e0a21b', name: 'Bologna Fiera', label: 'FIERA', alt: 'fiera trade fair expo fiere', lon: 11.3660, lat: 44.5122, major: 1 },
  { icon: 'tree', color: '#3f9a3a', name: 'Giardini Margherita', label: 'GIARDINI MARGHERITA', alt: 'park parco gardens', lon: 11.3532, lat: 44.4822, major: 1 },
  { icon: 'tree', color: '#3f9a3a', name: 'Parco della Montagnola', label: 'MONTAGNOLA', alt: 'park parco', lon: 11.3468, lat: 44.5023 },
  { icon: 'hospital', color: '#d93a3a', name: "Sant'Orsola Hospital", label: "SANT'ORSOLA", alt: 'hospital ospedale policlinico', lon: 11.3712, lat: 44.4936 },
  { icon: 'hospital', color: '#d93a3a', name: 'Ospedale Maggiore', label: 'OSP. MAGGIORE', alt: 'hospital ospedale', lon: 11.3078, lat: 44.5003 },
  { icon: 'tower', color: '#5b6bd6', name: 'Skyline Tower', label: 'SKYLINE TOWER', alt: 'unipol tower skyscraper torre', lon: 11.3797, lat: 44.5064, major: 1 },
  { icon: 'moto', color: '#c8102e', name: 'Motorcycle Museum', label: 'MOTOR MUSEUM', alt: 'museo moto borgo panigale motorbike', lon: 11.2930, lat: 44.5142 },
  { icon: 'eye', color: '#6b56c9', name: 'San Michele in Bosco', label: 'SAN MICHELE VIEWPOINT', alt: 'viewpoint panorama belvedere', lon: 11.3452, lat: 44.4842 },
  { icon: 'star', color: '#e0a21b', name: 'Finestrella di Via Piella', label: 'CANAL WINDOW', alt: 'canale delle moline little venice canal window', lon: 11.3437, lat: 44.4985 },
];

const MISSIONS = [
  { from: 'Marconi Airport', to: 'Due Torri', mode: 'drive', label: 'Airport → Due Torri' },
  { from: 'Bologna Centrale', to: 'Piazza Maggiore', mode: 'walk', label: 'Centrale → Piazza Maggiore' },
  { from: 'Porta Saragozza', to: 'Sanctuary of San Luca', mode: 'walk', label: 'Portico trail to San Luca' },
  { from: 'Bologna Fiera', to: "Stadio Dall'Ara", mode: 'bike', label: 'Fiera → Stadium' },
];
// Everyday places from OpenStreetMap, one original glyph per category (0..100 box, white on the blip colour).
// group: legend section. alias: extra words people search with.
const CATS = {
  pizza: { name: 'Pizza', group: 'Food & drink', color: '#e8502f', alias: 'pizzeria pizza food eat', g: '<path d="M16 26Q50 6 84 26L50 92Z" fill="#fff"/><path d="M20 29Q50 13 80 29" stroke="{bg}" stroke-width="5" fill="none"/><circle cx="40" cy="40" r="6.5" fill="{bg}"/><circle cx="60" cy="44" r="5.5" fill="{bg}"/><circle cx="49" cy="62" r="5.5" fill="{bg}"/>' },
  food: { name: 'Restaurants', group: 'Food & drink', color: '#f08a24', alias: 'restaurant ristorante trattoria osteria food eat', g: '<path d="M24 10v28c0 7 4 11 9 12v40h9V50c5-1 9-5 9-12V10h-6v26h-4V10h-6v26h-3V10z" fill="#fff"/><path d="M64 10c12 6 14 24 12 40h-4v40h-9V10z" fill="#fff"/>' },
  burger: { name: 'Fast food', group: 'Food & drink', color: '#e9a514', alias: 'fast food burger kebab piadina', g: '<path d="M16 46c0-18 15-28 34-28s34 10 34 28z" fill="#fff"/><rect x="12" y="52" width="76" height="9" rx="4.5" fill="#fff"/><path d="M16 67h68v5c0 9-6 13-14 13H30c-8 0-14-4-14-13z" fill="#fff"/>' },
  cafe: { name: 'Cafés', group: 'Food & drink', color: '#8b5a3c', alias: 'cafe caffe coffee espresso bar colazione', g: '<path d="M16 38h54v18c0 17-12 28-27 28S16 73 16 56z" fill="#fff"/><path d="M70 43h6a10 10 0 0 1 0 20h-8" stroke="#fff" stroke-width="7" fill="none"/><path d="M32 12c-5 7 5 11 0 18M48 12c-5 7 5 11 0 18" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>' },
  bar: { name: 'Bars & pubs', group: 'Food & drink', color: '#c2367a', alias: 'bar pub drinks cocktail aperitivo spritz beer', g: '<path d="M12 14h76L50 54z" fill="#fff"/><circle cx="38" cy="24" r="6" fill="{bg}"/><rect x="45.5" y="50" width="9" height="28" fill="#fff"/><rect x="28" y="78" width="44" height="9" rx="4" fill="#fff"/>' },
  gelato: { name: 'Gelato', group: 'Food & drink', color: '#ff6fae', alias: 'gelato gelateria ice cream', g: '<path d="M30 48h40L50 94z" fill="#fff"/><circle cx="38" cy="38" r="14" fill="#fff"/><circle cx="62" cy="38" r="14" fill="#fff"/><circle cx="50" cy="22" r="14" fill="#fff"/>' },
  shop: { name: 'Supermarkets', group: 'Shopping', color: '#2f9e6a', alias: 'supermarket supermercato groceries grocery coop conad', g: '<path d="M6 18h14l10 44h46l10-32H26" stroke="#fff" stroke-width="8" fill="none" stroke-linejoin="round" stroke-linecap="round"/><circle cx="38" cy="78" r="7.5" fill="#fff"/><circle cx="70" cy="78" r="7.5" fill="#fff"/>' },
  clothes: { name: 'Clothes', group: 'Shopping', color: '#8e44c9', alias: 'clothes clothing fashion abbigliamento boutique shop', g: '<path d="M36 12 12 26l9 20 9-5v45h40V41l9 5 9-20-24-14c-3 9-25 9-28 0z" fill="#fff"/>' },
  gym: { name: 'Gyms', group: 'Services', color: '#e0452f', alias: 'gym palestra fitness workout', g: '<rect x="28" y="45" width="44" height="10" fill="#fff"/><rect x="15" y="27" width="14" height="46" rx="4" fill="#fff"/><rect x="71" y="27" width="14" height="46" rx="4" fill="#fff"/><rect x="5" y="37" width="11" height="26" rx="3" fill="#fff"/><rect x="84" y="37" width="11" height="26" rx="3" fill="#fff"/>' },
  barber: { name: 'Barbers', group: 'Services', color: '#3f6fd8', alias: 'barber hairdresser parrucchiere barbiere haircut salon', g: '<circle cx="28" cy="72" r="12" stroke="#fff" stroke-width="7" fill="none"/><circle cx="72" cy="72" r="12" stroke="#fff" stroke-width="7" fill="none"/><path d="M35 62 72 10M65 62 28 10" stroke="#fff" stroke-width="8" stroke-linecap="round"/>' },
  tattoo: { name: 'Tattoo', group: 'Services', color: '#2b2b38', alias: 'tattoo tatuaggi piercing ink', g: '<path d="M50 88C20 66 10 50 10 34a20 20 0 0 1 40-6 20 20 0 0 1 40 6c0 16-10 32-40 54z" fill="#fff"/><path d="M22 44h56v14H22z" fill="{bg}"/><path d="M28 48h44v6H28z" fill="#fff"/>' },
  pharmacy: { name: 'Pharmacies', group: 'Services', color: '#1f9d55', alias: 'pharmacy farmacia chemist medicine', g: '<g transform="rotate(-45 50 50)"><rect x="12" y="33" width="76" height="34" rx="17" fill="#fff"/><path d="M50 38h21a12 12 0 0 1 0 24H50z" fill="{bg}"/></g>' },
  hospital: { name: 'Hospitals', group: 'Services', color: '#d93a3a', alias: 'hospital ospedale emergency pronto soccorso clinic', g: '<path d="M40 16h20v24h24v20H60v24H40V60H16V40h24z" fill="#fff"/>' },
  police: { name: 'Police', group: 'Services', color: '#1f3c88', alias: 'police polizia carabinieri questura', g: '<path d="M50 8 84 20v26c0 22-14 38-34 46C30 84 16 68 16 46V20z" fill="#fff"/><path d="M50 28l6 12 13 1-10 9 3 13-12-7-12 7 3-13-10-9 13-1z" fill="{bg}"/>' },
  bank: { name: 'Banks & ATMs', group: 'Services', color: '#2c8a4a', alias: 'bank banca atm bancomat cash money', g: '<path d="M76 24a30 30 0 1 0 0 52" stroke="#fff" stroke-width="11" fill="none"/><path d="M12 42h46M12 58h46" stroke="#fff" stroke-width="8"/>' },
  hotel: { name: 'Hotels', group: 'Services', color: '#5b56c9', alias: 'hotel albergo hostel b&b sleep', g: '<rect x="8" y="26" width="9" height="60" fill="#fff"/><rect x="8" y="60" width="84" height="12" fill="#fff"/><rect x="83" y="60" width="9" height="26" fill="#fff"/><circle cx="30" cy="48" r="9" fill="#fff"/><path d="M44 39h36a12 12 0 0 1 12 12v6H44z" fill="#fff"/>' },
  fuel: { name: 'Fuel', group: 'Car', color: '#c8102e', alias: 'fuel petrol gas station benzina distributore', g: '<rect x="18" y="12" width="42" height="76" rx="6" fill="#fff"/><rect x="26" y="20" width="26" height="20" rx="2" fill="{bg}"/><path d="M60 28h9l11 12v34a6 6 0 0 1-12 0V58h-8" stroke="#fff" stroke-width="6" fill="none" stroke-linejoin="round"/>' },
  mechanic: { name: 'Car repair', group: 'Car', color: '#56626f', alias: 'car repair mechanic officina meccanico garage', g: '<path d="M72 8a22 22 0 0 0-24 28L10 74l16 16 38-38a22 22 0 0 0 28-24L78 42l-14-4-4-14z" fill="#fff"/>' },
  carwash: { name: 'Car wash', group: 'Car', color: '#1f9fc4', alias: 'car wash autolavaggio', g: '<path d="M14 64l9-20h54l9 20v14H14z" fill="#fff"/><circle cx="30" cy="80" r="7.5" fill="#fff"/><circle cx="70" cy="80" r="7.5" fill="#fff"/><path d="M30 10c-7 11-7 18 0 18s7-7 0-18zM50 6c-7 11-7 18 0 18s7-7 0-18zM70 10c-7 11-7 18 0 18s7-7 0-18z" fill="#fff"/>' },
  parking: { name: 'Parking', group: 'Car', color: '#2f6fd6', alias: 'parking parcheggio car park garage', g: '<path d="M28 88V12h26a22 22 0 0 1 0 44H42v32zM42 25v18h12a9 9 0 0 0 0-18z" fill="#fff" fill-rule="evenodd"/>' },
  cinema: { name: 'Cinemas', group: 'Fun', color: '#b3122e', alias: 'cinema movies film theatre', g: '<rect x="12" y="40" width="76" height="46" rx="5" fill="#fff"/><path d="M12 24 80 12l3 16-68 12z" fill="#fff"/><path d="M27 21l8 15M47 17l8 15M67 14l8 15" stroke="{bg}" stroke-width="6"/>' },
  club: { name: 'Nightclubs', group: 'Fun', color: '#7b2ff7', alias: 'nightclub club disco discoteca dance party', g: '<circle cx="50" cy="56" r="32" fill="#fff"/><path d="M18 56h64M50 24v64M24 40h52M24 72h52M38 26c-7 17-7 43 0 60M62 26c7 17 7 43 0 60" stroke="{bg}" stroke-width="3.5" fill="none"/><path d="M50 4v20" stroke="#fff" stroke-width="5"/>' },
  museum: { name: 'Museums', group: 'Fun', color: '#a06a1f', alias: 'museum museo gallery art exhibition', g: '<path d="M50 8 92 30H8z" fill="#fff"/><rect x="16" y="36" width="11" height="38" fill="#fff"/><rect x="36" y="36" width="11" height="38" fill="#fff"/><rect x="54" y="36" width="11" height="38" fill="#fff"/><rect x="73" y="36" width="11" height="38" fill="#fff"/><rect x="8" y="78" width="84" height="12" fill="#fff"/>' },
};
const CAT_KEYS = Object.keys(CATS);
const placeR = (s) => (s < 600 ? 10 : s < 1500 ? 12 : 14); // icon radius in px by zoom
const PLACE_MIN_S = 230; // px per km: category icons appear from neighbourhood zoom

const SEA_LABELS = [
  ['CASTEL MAGGIORE CHANNEL', 11.40, 44.566, 0], ['SAN LAZZARO STRAIT', 11.425, 44.438, 0],
  ['PIANURA PADANA BAY', 11.20, 44.53, -90], ['CASALECCHIO SOUND', 11.235, 44.44, 0],
];

// ------------------------------------------------------------------ helpers
const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
let D, KX, KY, LON0, LAT0;
const ll2w = (lon, lat) => [(lon - LON0) * KX, (lat - LAT0) * KY];

function dec(a) {
  const f = new Float64Array(a.length); let x = 0, y = 0;
  for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; f[i] = x / 1000; f[i + 1] = y / 1000; }
  return f;
}
function addLine(p, f, close) {
  p.moveTo(f[0], f[1]);
  for (let i = 2; i < f.length; i += 2) p.lineTo(f[i], f[i + 1]);
  if (close) p.closePath();
}
function bbox(f) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < f.length; i += 2) { const x = f[i], y = f[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}
function pointInRing(x, y, f) {
  let inside = false;
  for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) {
    const xi = f[i], yi = f[i + 1], xj = f[j], yj = f[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const SMALL = new Set(['di', 'del', 'della', 'dei', 'degli', 'delle', 'dello', 'de', 'da', 'e', 'in', 'al', 'alla', 'sul', 'sulla']);
function titleCase(s) {
  return s.toLowerCase().split(' ').map((w, i) => {
    if (i > 0 && SMALL.has(w)) return w;
    if (/^(dell|dall|sull|nell|all|d|de|l)'/.test(w) && i > 0) { const k = w.indexOf("'"); return w.slice(0, k + 1) + w.charAt(k + 1).toUpperCase() + w.slice(k + 2); }
    if (/^[ivxl]+$/.test(w) && w.length < 5 && i > 0) return w.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ').replace(/-([a-z])/g, (m, c) => '-' + c.toUpperCase());
}
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’`]/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
function fmtKm(k) { return k < 1 ? `${Math.max(10, Math.round(k * 100) * 10)} m` : `${k.toFixed(k < 10 ? 1 : 0)} km`; }
function fmtMin(h) { return Math.max(1, Math.round(h * 60)); }
function fmtClock(d) { return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

// ------------------------------------------------------------------ canvas + camera
const canvas = $('#map'), ctx = canvas.getContext('2d');
// The static map is drawn once into an oversized #base canvas. Panning and zooming only move it with a
// CSS transform (GPU), and it is redrawn when the gesture settles or the view runs past its margin.
// The #map canvas on top holds only the moving parts: route, markers, GPS car.
const base = $('#base'), bctx = base.getContext('2d');
let M = 220; // overscan margin in CSS px around the viewport (set in resize)
let W = 0, H = 0, DPR = 1, baseCam = null, lastMove = 0;
const cam = { x: 0, y: 0, s: 40 };
let baseDirty = true, needFrame = true;
const S_MIN = 18, S_MAX = 5000;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  M = Math.round(clamp(Math.max(W, H) * .12, 100, 180));
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  base.width = Math.round((W + 2 * M) * DPR); base.height = Math.round((H + 2 * M) * DPR);
  base.style.width = (W + 2 * M) + 'px'; base.style.height = (H + 2 * M) + 'px';
  baseDirty = true; needFrame = true;
}
const toScreen = (x, y) => [W / 2 + (x - cam.x) * cam.s, H / 2 - (y - cam.y) * cam.s];
const toWorld = (sx, sy) => [cam.x + (sx - W / 2) / cam.s, cam.y - (sy - H / 2) / cam.s];
function worldT(c) { c.setTransform(DPR * cam.s, 0, 0, -DPR * cam.s, DPR * (W / 2 - cam.x * cam.s), DPR * (H / 2 + cam.y * cam.s)); }
function screenT(c) { c.setTransform(DPR, 0, 0, DPR, 0, 0); }
function viewBox(m = 0) { const [x0, y1] = toWorld(-m, -m), [x1, y0] = toWorld(W + m, H + m); return [x0, y0, x1, y1]; }
const boxHit = (b, v) => !(b[2] < v[0] || b[0] > v[2] || b[3] < v[1] || b[1] > v[3]);
function setCam(x, y, s) { cam.x = x; cam.y = y; cam.s = clamp(s, S_MIN, S_MAX); clampCam(); lastMove = performance.now(); needFrame = true; }
function clampCam() {
  if (!D) return;
  const [x0, y0, x1, y1] = G.landBox;
  cam.x = clamp(cam.x, x0 - 3, x1 + 3); cam.y = clamp(cam.y, y0 - 3, y1 + 3);
}
let flight = null;
function flyTo(x, y, s, ms = 900) {
  s = clamp(s, S_MIN, S_MAX);
  if (reduceMotion) { setCam(x, y, s); return; }
  flight = { t0: performance.now(), ms, a: { x: cam.x, y: cam.y, s: cam.s }, b: { x, y, s } };
  needFrame = true;
}
function stepFlight(now) {
  if (!flight) return;
  let t = clamp((now - flight.t0) / flight.ms, 0, 1);
  const e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const ls = lerp(Math.log(flight.a.s), Math.log(flight.b.s), e);
  setCam(lerp(flight.a.x, flight.b.x, e), lerp(flight.a.y, flight.b.y, e), Math.exp(ls));
  if (t >= 1) flight = null;
}
// padding the HUD takes on each side, so fitted content is not hidden behind it
function hudPad() {
  const mobile = W <= 760;
  const side = $('#side').getBoundingClientRect();
  if (mobile) {
    const trip = $('#trip');
    const bot = trip.hidden ? 40 : (H - trip.getBoundingClientRect().top) + 16;
    return { l: 30, r: 30, t: side.bottom + 30, b: bot + 30 };
  }
  return { l: side.right + 40, r: 90, t: 50, b: 60 };
}
function fitBox(b, ms = 900, maxS = 2600) {
  const p = hudPad();
  const w = Math.max(80, W - p.l - p.r), h = Math.max(80, H - p.t - p.b);
  const s = Math.min(w / Math.max(b[2] - b[0], .05), h / Math.max(b[3] - b[1], .05), maxS);
  const cxs = p.l + w / 2, cys = p.t + h / 2; // screen centre of the free area
  const x = (b[0] + b[2]) / 2 - (cxs - W / 2) / s, y = (b[1] + b[3]) / 2 + (cys - H / 2) / s;
  flyTo(x, y, s, ms);
}

function inPoly(f, x, y) { // even-odd point-in-ring test on a flat [x0,y0,x1,y1,...] ring
  let o = false;
  for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) {
    const ax = f[i], ay = f[i + 1], bx = f[j], by = f[j + 1];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) o = !o;
  }
  return o;
}
// ------------------------------------------------------------------ geometry build
const G = {};
function build() {
  KX = D.kx; KY = D.ky; LON0 = D.center[0]; LAT0 = D.center[1];
  const land = dec(D.osm.comune[0]);
  G.land = new Path2D(); addLine(G.land, land, true);
  G.landRing = land; G.landBox = bbox(land);
  G.zones = D.zones.map((z) => {
    const p = new Path2D(); const rings = z.rings.map(dec); rings.forEach((r) => addLine(p, r, true));
    return { ...z, path: p, rings };
  });
  G.centro = G.zones.filter((z) => z.centro);
  const poly = (k) => { const p = new Path2D(); (D.osm[k] || []).forEach((r) => addLine(p, dec(r), true)); return p; };
  const lines = (arr) => { const p = new Path2D(); arr.forEach((r) => addLine(p, dec(r), false)); return p; };
  G.zoneEdges = chunked(G.zones.flatMap((z) => z.rings));
  G.parks = poly('montagnola'); G.parks.addPath(poly('margherita'));
  G.stadio = poly('stadio'); G.fiera = poly('fiera'); G.airport = poly('airport');
  // runway along the airport's long axis
  const ap = dec(D.osm.airport[0]); let mx = 0, my = 0; const n = ap.length / 2;
  for (let i = 0; i < ap.length; i += 2) { mx += ap[i]; my += ap[i + 1]; } mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < ap.length; i += 2) { const dx = ap[i] - mx, dy = ap[i + 1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const ang = .5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(ang), uy = Math.sin(ang);
  let pmin = Infinity, pmax = -Infinity;
  for (let i = 0; i < ap.length; i += 2) { const pr = (ap[i] - mx) * ux + (ap[i + 1] - my) * uy; pmin = Math.min(pmin, pr); pmax = Math.max(pmax, pr); }
  G.runway = [mx + ux * pmin * .86, my + uy * pmin * .86, mx + ux * pmax * .86, my + uy * pmax * .86];
  G.reno = lines(D.osm.reno); G.savena = lines(D.osm.savena); G.canal = lines(D.osm.canalereno);
  G.aposa = lines(D.osm.aposa || []);
  G.rail = chunked(D.rail.map(dec));
  G.contour = chunked(D.contours.filter(([q]) => q % 100).map(([, l]) => dec(l)));
  G.contourMajor = chunked(D.contours.filter(([q]) => !(q % 100)).map(([, l]) => dec(l)));

  // streets → arcs, class paths, graph
  const nodeId = new Map(); const NX = [], NY = [];
  const node = (ix, iy, x, y) => {
    const k = ix * 1000003 + iy; let id = nodeId.get(k);
    if (id === undefined) { id = NX.length; nodeId.set(k, id); NX.push(x); NY.push(y); }
    return id;
  };
  G.arcs = D.streets.map(([ni, cls, enc]) => {
    const f = dec(enc);
    // integer metres for exact node keys
    let ix = 0, iy = 0, ex = 0, ey = 0;
    for (let i = 0; i < enc.length; i += 2) { ix += enc[i]; iy += enc[i + 1]; if (i === 0) { ex = ix; ey = iy; } }
    const a = node(ex, ey, f[0], f[1]), b = node(ix, iy, f[f.length - 2], f[f.length - 1]);
    const cum = new Float64Array(f.length / 2); let L = 0, best = -1, bi = 0;
    for (let i = 2; i < f.length; i += 2) {
      const sl = Math.hypot(f[i] - f[i - 2], f[i + 1] - f[i - 1]); L += sl; cum[i / 2] = L;
      if (sl > best) { best = sl; bi = i - 2; }
    }
    const raw = D.names[ni];
    const unnamed = /^NOME VIA/.test(raw);
    // both carriageways of the ring road read as one road in directions
    const name = unnamed ? '' : /^TANGENZIALE/.test(raw) ? 'TANGENZIALE' : raw;
    return { name, raw, unnamed, label: unnamed ? 'unnamed road' : /^TANGENZIALE/.test(raw) ? 'Tangenziale' : titleCase(raw), cls, f, a, b, len: L, cum, bb: bbox(f), lseg: bi, ztl: false, noCar: NO_CARS.test(name) };
  });
  // road chunks (1.5 km cells) so a redraw strokes only what is on screen
  const CH = 1.5, chunkMap = [new Map(), new Map(), new Map(), new Map()];
  for (const A of G.arcs) {
    const key = Math.floor((A.bb[0] + A.bb[2]) / 2 / CH) * 1000 + Math.floor((A.bb[1] + A.bb[3]) / 2 / CH);
    let ch = chunkMap[A.cls].get(key);
    if (!ch) chunkMap[A.cls].set(key, ch = { path: new Path2D(), bb: [Infinity, Infinity, -Infinity, -Infinity] });
    addLine(ch.path, A.f, false);
    ch.bb = [Math.min(ch.bb[0], A.bb[0]), Math.min(ch.bb[1], A.bb[1]), Math.max(ch.bb[2], A.bb[2]), Math.max(ch.bb[3], A.bb[3])];
  }
  G.chunks = chunkMap.map((m) => [...m.values()]);
  // island drop shadow, blurred once into a small image
  {
    const PX = 24, pad = 2.5, lb = G.landBox, b = [lb[0] - pad, lb[1] - pad, lb[2] + pad, lb[3] + pad];
    const sc = document.createElement('canvas'); sc.width = Math.ceil((b[2] - b[0]) * PX); sc.height = Math.ceil((b[3] - b[1]) * PX);
    const c = sc.getContext('2d');
    c.setTransform(PX, 0, 0, -PX, -b[0] * PX, b[3] * PX);
    c.fillStyle = 'rgba(0,0,0,.5)';
    if ('filter' in c) { c.filter = 'blur(9px)'; c.fill(G.land); }
    else { c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 18; c.fill(G.land); }
    G.shadow = sc; G.shadowBox = b;
  }
  G.NX = Float64Array.from(NX); G.NY = Float64Array.from(NY);
  G.adj = Array.from({ length: NX.length }, () => []);
  G.arcs.forEach((A, i) => { G.adj[A.a].push(i); if (A.b !== A.a) G.adj[A.b].push(i); });
  // ZTL flag: arc midpoint inside the old-town zones
  for (const A of G.arcs) {
    const m = pointAt(A, A.len / 2);
    A.ztl = G.centro.some((z) => z.rings.some((r) => pointInRing(m[0], m[1], r)));
  }
  G.ztlPath = new Path2D(); G.centro.forEach((z) => z.rings.forEach((r) => addLine(G.ztlPath, r, true)));
  // segment grid for snapping
  G.cell = .2; G.grid = new Map();
  G.arcs.forEach((A, ai) => {
    for (let i = 0; i < A.f.length - 2; i += 2) {
      const x0 = Math.min(A.f[i], A.f[i + 2]), x1 = Math.max(A.f[i], A.f[i + 2]);
      const y0 = Math.min(A.f[i + 1], A.f[i + 3]), y1 = Math.max(A.f[i + 1], A.f[i + 3]);
      for (let cx = Math.floor(x0 / G.cell); cx <= Math.floor(x1 / G.cell); cx++)
        for (let cy = Math.floor(y0 / G.cell); cy <= Math.floor(y1 / G.cell); cy++) {
          const k = cx * 10007 + cy; let c = G.grid.get(k); if (!c) G.grid.set(k, c = []); c.push(ai, i);
        }
    }
  });
  // label order: bigger roads and longer arcs first
  G.labelOrder = G.arcs.map((_, i) => i).sort((i, j) => (G.arcs[j].cls - G.arcs[i].cls) || (G.arcs[j].len - G.arcs[i].len));

  // POIs in world coords
  POIS.forEach((p) => { [p.x, p.y] = ll2w(p.lon, p.lat); p.img = blipImage(p.icon, p.color); });
  G.seaLabels = SEA_LABELS.map(([t, lon, lat, r]) => [t, ...ll2w(lon, lat), r]);
}
// Split polylines into short pieces grouped by 1.5 km cells, so a redraw strokes (and dashes) only what is in view.
function chunked(polys, CH = 1.5, maxPts = 48) {
  const m = new Map();
  for (const f of polys) {
    for (let i0 = 0; i0 < f.length - 2; i0 += (maxPts - 1) * 2) {
      const piece = f.subarray(i0, Math.min(f.length, i0 + maxPts * 2));
      const bb = bbox(piece), key = Math.floor((bb[0] + bb[2]) / 2 / CH) * 1000 + Math.floor((bb[1] + bb[3]) / 2 / CH);
      let ch = m.get(key); if (!ch) m.set(key, ch = { path: new Path2D(), bb: [Infinity, Infinity, -Infinity, -Infinity] });
      addLine(ch.path, piece, false);
      ch.bb = [Math.min(ch.bb[0], bb[0]), Math.min(ch.bb[1], bb[1]), Math.max(ch.bb[2], bb[2]), Math.max(ch.bb[3], bb[3])];
    }
  }
  return [...m.values()];
}
function strokeChunks(c, chunks, vb) { for (const ch of chunks) if (boxHit(ch.bb, vb)) c.stroke(ch.path); }
function pointAt(A, d) {
  const f = A.f, cum = A.cum; d = clamp(d, 0, A.len);
  let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
  const seg = cum[i] - cum[i - 1] || 1, t = (d - cum[i - 1]) / seg;
  return [lerp(f[2 * i - 2], f[2 * i], t), lerp(f[2 * i - 1], f[2 * i + 1], t)];
}
// polyline of arc A between distances d0 → d1 (either direction)
function subline(A, d0, d1) {
  const out = [pointAt(A, d0)]; const f = A.f, cum = A.cum;
  if (d1 >= d0) { for (let i = 0; i < cum.length; i++) if (cum[i] > d0 && cum[i] < d1) out.push([f[2 * i], f[2 * i + 1]]); }
  else { for (let i = cum.length - 1; i >= 0; i--) if (cum[i] < d0 && cum[i] > d1) out.push([f[2 * i], f[2 * i + 1]]); }
  out.push(pointAt(A, d1));
  return out;
}

// ------------------------------------------------------------------ blip images
const imgCache = new Map();
const CAT_IMG = {};
function catImage(k) {
  if (CAT_IMG[k]) return CAT_IMG[k];
  const C_ = CATS[k], g = C_.g.replace(/\{bg\}/g, C_.color);
  // shadow is baked into the image so drawing needs no live blur
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72"><circle cx="36" cy="39" r="31" fill="rgba(0,0,0,.32)"/><circle cx="36" cy="36" r="30" fill="#fff"/><circle cx="36" cy="36" r="25.5" fill="${C_.color}"/><g transform="translate(36 36) scale(.36) translate(-50 -50)">${g}</g></svg>`;
  const img = new Image(); img.onload = () => { baseDirty = true; needFrame = true; };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return (CAT_IMG[k] = img);
}
// Icons are SVG images; drawing SVG into a canvas re-rasterises it every time, so each icon is
// rasterised once per on-screen size into a small bitmap and reused.
function sprite(img, size, shadow = false) {
  if (!img.complete || !img.naturalWidth) return null;
  const px = Math.round(size * DPR), key = px + (shadow ? 's' : '');
  const m = img._sp || (img._sp = new Map());
  let cv = m.get(key);
  if (!cv) {
    const pad = shadow ? Math.round(DPR * 2) : 0;
    cv = document.createElement('canvas'); cv.width = px + pad; cv.height = px + pad * 2;
    const g = cv.getContext('2d');
    if (shadow) { g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(cv.width / 2, px / 2 + pad * 1.6, px / 2 * .96, 0, 7); g.fill(); }
    g.drawImage(img, pad / 2, pad / 2, px, px);
    m.set(key, cv);
  }
  return cv;
}
function buildPlaces(P) {
  G.places = [];
  if (!P) return;
  const cats = P.cats;
  for (const [ci, name, xm, ym, road] of P.items) {
    const c = cats[ci]; if (!CATS[c]) continue;
    // deterministic shuffle so overlap culling shows a mix of categories, stable across zooms
    let h = (xm * 73856093) ^ (ym * 19349663); h = ((h >>> 0) % 10007) / 10007;
    G.places.push({ c, n: name, x: xm / 1000, y: ym / 1000, road, h });
  }
  G.places.sort((a, b) => a.h - b.h);
  G.placeCount = {}; for (const p of G.places) G.placeCount[p.c] = (G.placeCount[p.c] || 0) + 1;
  CAT_KEYS.forEach(catImage);
}
function blipImage(icon, bg, ring = '#fff') {
  const key = icon + bg + ring; if (imgCache.has(key)) return imgCache.get(key);
  const g = ICON[icon].replace(/\{bg\}/g, bg);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="44" fill="${ring}"/><circle cx="48" cy="48" r="37" fill="${bg}"/><g transform="translate(48 48) scale(.54) translate(-50 -50)">${g}</g></svg>`;
  const img = new Image(); img.onload = () => { baseDirty = true; needFrame = true; };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  img.dataset.src = img.src;
  imgCache.set(key, img);
  return img;
}

// ------------------------------------------------------------------ patterns
let roofPat, wavePat, terrainImg;
function makePatterns() {
  const t = document.createElement('canvas'); t.width = t.height = 16; const c = t.getContext('2d');
  c.fillStyle = '#c9573d'; c.fillRect(0, 0, 16, 16); c.fillStyle = '#b8472f';
  c.beginPath(); c.moveTo(0, 0); c.lineTo(8, 0); c.lineTo(0, 8); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(16, 0); c.lineTo(16, 8); c.lineTo(8, 16); c.lineTo(0, 16); c.closePath(); c.fill();
  roofPat = ctx.createPattern(t, 'repeat');
  const w = document.createElement('canvas'); w.width = 90; w.height = 46; const d = w.getContext('2d');
  d.strokeStyle = 'rgba(44,120,150,.38)'; d.lineWidth = 2;
  d.beginPath(); d.moveTo(0, 23); d.quadraticCurveTo(22, 9, 45, 23); d.quadraticCurveTo(68, 37, 90, 23); d.stroke();
  wavePat = ctx.createPattern(w, 'repeat');
  base.style.backgroundImage = `url(${w.toDataURL()})`;
  document.body.style.background = `radial-gradient(circle at 45% 50%, ${C.seaA}, ${C.seaB} 80%)`;
}

// ------------------------------------------------------------------ base map render
function roadW(cls, s) {
  const T = ROAD_W[cls]; const ls = Math.log(s);
  if (s <= T[0][0]) return [T[0][1], T[0][2]];
  for (let i = 1; i < T.length; i++) if (s <= T[i][0]) {
    const t = (ls - Math.log(T[i - 1][0])) / (Math.log(T[i][0]) - Math.log(T[i - 1][0]));
    return [lerp(T[i - 1][1], T[i][1], t), lerp(T[i - 1][2], T[i][2], t)];
  }
  const L = T[T.length - 1]; return [L[1], L[2]];
}
function drawBase() {
  const w0 = W, h0 = H; W += 2 * M; H += 2 * M; // render the oversized view, centred on the camera
  try { paintBase(); } finally { W = w0; H = h0; }
  baseCam = { x: cam.x, y: cam.y, s: cam.s };
}
function paintBase() {
  const c = bctx, s = cam.s, px = 1 / s;
  screenT(c);
  // sea
  // sea: the page background (gradient) and the canvas' own CSS background (waves) show through,
  // so the canvas only clears here instead of filling ~10M pixels every redraw
  c.clearRect(0, 0, W, H);
  const [ox, oy] = toScreen(0, 0);
  base.style.backgroundPosition = `${(ox % 90).toFixed(1)}px ${(oy % 46).toFixed(1)}px`;
  if (!D) return;

  worldT(c);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const vbAll = viewBox(20);
  // when the whole view is inland, the coast (shelf, shadow, beach) is off screen: skip it
  const inland = s > 250 && [[vbAll[0], vbAll[1]], [vbAll[2], vbAll[1]], [vbAll[0], vbAll[3]], [vbAll[2], vbAll[3]], [(vbAll[0] + vbAll[2]) / 2, vbAll[1]], [(vbAll[0] + vbAll[2]) / 2, vbAll[3]], [vbAll[0], (vbAll[1] + vbAll[3]) / 2], [vbAll[2], (vbAll[1] + vbAll[3]) / 2]]
    .every(([x, y]) => inPoly(G.landRing, x, y));
  if (!inland) {
  // shelf + shadow + beach
  c.strokeStyle = C.shelf; c.globalAlpha = .18; c.lineWidth = Math.max(1, 26 * px); c.stroke(G.land);
  c.strokeStyle = C.shelf2; c.globalAlpha = .25; c.lineWidth = Math.max(.45, 12 * px); c.stroke(G.land);
  c.globalAlpha = 1;
  if (G.shadow) { // pre-blurred island shadow, drawn as an image (no live blur)
    const b = G.shadowBox;
    c.setTransform(DPR * s, 0, 0, DPR * s, DPR * (W / 2 - cam.x * s + 8), DPR * (H / 2 + cam.y * s + 14));
    c.drawImage(G.shadow, b[0], -b[3], b[2] - b[0], b[3] - b[1]);
    worldT(c);
  }
  c.fillStyle = C.sand; c.fill(G.land);
  c.strokeStyle = C.sand; c.lineWidth = Math.max(.18, 8 * px); c.stroke(G.land);
  c.strokeStyle = C.sandLine; c.globalAlpha = .9; c.lineWidth = Math.max(.04, 2 * px); c.stroke(G.land); c.globalAlpha = 1;
  }

  c.save(); if (!inland) c.clip(G.land);
  // terrain raster (drawn with an unflipped transform)
  if (terrainImg && terrainImg.complete) {
    const T = D.terrain;
    c.setTransform(DPR * s, 0, 0, DPR * s, DPR * (W / 2 - cam.x * s), DPR * (H / 2 + cam.y * s));
    // draw only the visible part of the raster (cheaper than scaling the whole image)
    const iw = terrainImg.naturalWidth, ih = terrainImg.naturalHeight, kx = iw / (T.x1 - T.x0), ky = ih / (T.y1 - T.y0);
    const x0 = Math.max(T.x0, vbAll[0]), x1 = Math.min(T.x1, vbAll[2]), y0 = Math.max(T.y0, vbAll[1]), y1 = Math.min(T.y1, vbAll[3]);
    if (x1 > x0 && y1 > y0) {
      c.imageSmoothingQuality = s > 400 ? 'low' : 'medium';
      c.drawImage(terrainImg, (x0 - T.x0) * kx, (T.y1 - y1) * ky, (x1 - x0) * kx, (y1 - y0) * ky, x0, -y1, x1 - x0, y1 - y0);
    }
    worldT(c);
  }
  // districts
  for (const z of G.zones) if (!z.centro) { c.fillStyle = z.tint; c.globalAlpha = .38; c.fill(z.path); }
  c.globalAlpha = .95;
  roofPat.setTransform(new DOMMatrix([1 / s, 0, 0, -1 / s, 0, 0]).scale(s > 900 ? 1.6 : 1));
  c.fillStyle = roofPat; c.fill(G.ztlPath); c.globalAlpha = 1;
  c.strokeStyle = '#fff7e0'; c.globalAlpha = .8; c.lineWidth = 2.6 * px; c.setLineDash([2 * px, 9 * px]);
  strokeChunks(c, G.zoneEdges, vbAll);
  c.setLineDash([]); c.globalAlpha = 1;
  // parks and special areas
  c.fillStyle = C.park; c.fill(G.parks); c.strokeStyle = C.park2; c.lineWidth = 2 * px; c.stroke(G.parks);
  c.fillStyle = '#6fbf5a'; c.fill(G.stadio); c.strokeStyle = '#fff'; c.lineWidth = 2.5 * px; c.stroke(G.stadio);
  c.fillStyle = '#e7d3a8'; c.fill(G.fiera); c.strokeStyle = '#a88a52'; c.lineWidth = 2 * px; c.stroke(G.fiera);
  c.fillStyle = '#c9c7bd'; c.globalAlpha = .95; c.fill(G.airport); c.globalAlpha = 1; c.strokeStyle = '#8d8b80'; c.stroke(G.airport);
  const R = G.runway;
  c.lineCap = 'butt'; c.strokeStyle = '#3b3d44'; c.lineWidth = Math.max(4 * px, .06); c.beginPath(); c.moveTo(R[0], R[1]); c.lineTo(R[2], R[3]); c.stroke();
  c.strokeStyle = '#fff'; c.lineWidth = Math.max(1 * px, .006); c.setLineDash([Math.max(6 * px, .045), Math.max(5 * px, .035)]); c.stroke(); c.setLineDash([]); c.lineCap = 'round';
  // hills
  c.strokeStyle = '#2f5a2a'; c.globalAlpha = .22; c.lineWidth = 1.2 * px; strokeChunks(c, G.contour, vbAll); c.lineWidth = 2 * px; strokeChunks(c, G.contourMajor, vbAll); c.globalAlpha = 1;
  // water
  const river = (p, km, minPx) => {
    const w = Math.max(minPx, km * s);
    c.strokeStyle = C.waterEdge; c.globalAlpha = .85; c.lineWidth = (w + Math.max(3, w * .45)) * px; c.stroke(p);
    c.globalAlpha = 1; c.strokeStyle = C.water; c.lineWidth = w * px; c.stroke(p);
  };
  river(G.reno, .11, 3.5); river(G.savena, .07, 2.5); river(G.canal, .035, 1.6);
  if (s > 300) river(G.aposa, .02, 1.5);
  // rail
  c.strokeStyle = C.rail; c.globalAlpha = .8; c.lineWidth = clamp(.022 * s, 1.2, 6) * px; strokeChunks(c, G.rail, vbAll);
  if (s > 500) { c.strokeStyle = '#d9d4c4'; c.lineWidth = clamp(.012 * s, 1, 3) * px; c.setLineDash([6 * px, 6 * px]); strokeChunks(c, G.rail, vbAll); c.setLineDash([]); }
  c.globalAlpha = 1;
  // roads: all casings, then all fills; only the chunks in view
  const vb = viewBox(20);
  for (let k = 0; k < 4; k++) {
    const [wc] = roadW(k, s); c.strokeStyle = ROAD[k][0]; c.globalAlpha = k === 0 ? (s < 120 ? .45 : .7) : 1;
    c.lineWidth = wc * px; for (const ch of G.chunks[k]) if (boxHit(ch.bb, vb)) c.stroke(ch.path);
  }
  c.globalAlpha = 1;
  for (let k = 0; k < 4; k++) {
    const [, wf] = roadW(k, s); c.strokeStyle = ROAD[k][1]; c.globalAlpha = k === 0 && s < 80 ? .75 : 1;
    c.lineWidth = wf * px; for (const ch of G.chunks[k]) if (boxHit(ch.bb, vb)) c.stroke(ch.path);
  }
  c.globalAlpha = 1;
  c.restore();

  // ---------------- labels (screen space)
  screenT(c);
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  // label/icon collision on a 64 px grid (constant time per check instead of scanning every placed box)
  const GS = 64, grid = new Map();
  const cells = (b, fn) => { for (let gx = Math.floor(b[0] / GS); gx <= Math.floor(b[2] / GS); gx++) for (let gy = Math.floor(b[1] / GS); gy <= Math.floor(b[3] / GS); gy++) if (fn((gx + 2048) * 8192 + gy + 2048) === false) return false; return true; };
  const reserve = (b) => cells(b, (k) => { let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(b); });
  const free = (b) => {
    const ok = cells(b, (k) => { const l = grid.get(k); if (l) for (const o of l) if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return false; });
    if (ok) reserve(b); return ok;
  };
  // POI blips reserve space first (drawn last so they sit on top)
  const r = clamp(8 + s * .02, 11, 17);
  const shownPois = POIS.filter((p) => p.major || s >= 110);
  const poiScreens = shownPois.map((p) => { const [x, y] = toScreen(p.x, p.y); reserve([x - r, y - r, x + r, y + r]); return [p, x, y]; });
  // sea labels
  c.font = `italic 400 ${clamp(s * .35, 13, 22)}px "Barlow Condensed", sans-serif`;
  c.fillStyle = 'rgba(127,195,216,.85)';
  for (const [t, x, y, rot] of G.seaLabels) {
    const [sx, sy] = toScreen(x, y); if (sx < -200 || sx > W + 200 || sy < -200 || sy > H + 200) continue;
    c.save(); c.translate(sx, sy); c.rotate(rot * Math.PI / 180); spaced(c, t, .4, 'fill'); c.restore();
  }
  // district labels
  if (s < 900) {
    const fs = clamp(9 + s * .045, 12, 24), a = s > 520 ? clamp((900 - s) / 380, 0, 1) : 1;
    c.globalAlpha = a; c.font = `700 ${fs}px Oswald, "Arial Narrow", sans-serif`;
    for (const z of G.zones) {
      if (z.centro) continue;
      const [sx, sy] = toScreen(z.lp[0], z.lp[1]);
      const lines = z.label.split('\n'); const lh = fs * 1.05;
      const w = Math.max(...lines.map((l) => c.measureText(l).width * 1.12));
      const b = [sx - w / 2, sy - lh * lines.length / 2, sx + w / 2, sy + lh * lines.length / 2];
      if (!free(b)) continue;
      lines.forEach((l, i) => halo(c, l, sx, sy + (i - (lines.length - 1) / 2) * lh, '#fffaf0', '#3b2f1f', fs * .24, .1));
    }
    c.globalAlpha = 1;
  }
  // old town label
  if (s < 420) {
    const [sx, sy] = toScreen(...ll2w(11.3395, 44.4985)); const fs = clamp(8 + s * .05, 12, 22);
    c.font = `400 ${fs}px Bungee, Impact, sans-serif`;
    const w = c.measureText('OLD TOWN').width; if (free([sx - w / 2, sy - fs / 2, sx + w / 2, sy + fs / 2])) halo(c, 'OLD TOWN', sx, sy, '#fff', '#5a1a10', fs * .28, .06);
  }
  // street names along the road
  // everyday places: category icons, culled by zoom, filters and overlap
  G.drawn = [];
  if (G.places && G.places.length && s >= PLACE_MIN_S) {
    const pr = placeR(s), ds = pr * 2 * 72 / 60;
    const v = viewBox(0), showNames = s >= 1300;
    const nfs = 13; c.font = `700 ${nfs}px "Barlow Condensed", sans-serif`;
    for (const p of G.places) {
      if (!catOn[p.c] || p.x < v[0] || p.x > v[2] || p.y < v[1] || p.y > v[3]) continue;
      const [x, y] = toScreen(p.x, p.y);
      if (!free([x - pr - 1, y - pr - 1, x + pr + 1, y + pr + 1])) continue;
      const sp = sprite(CAT_IMG[p.c], ds); if (sp) c.drawImage(sp, x - ds / 2, y - ds / 2, ds, ds);
      G.drawn.push(p);
      if (G.drawn.length >= 420) break; // cap per redraw; overlap culling already hides most at this density
      if (showNames && p.n) {
        let w = p.w; if (w === undefined) w = p.w = c.measureText(p.n).width + 4;
        const lx = x + pr + 4 + w / 2;
        if (free([lx - w / 2, y - nfs / 2, lx + w / 2, y + nfs / 2])) halo(c, p.n, lx, y, '#fff', 'rgba(20,20,28,.9)', 3.4);
      }
    }
  }
  if (s >= 240) streetLabels(c, free);
  // POI blips + labels
  for (const [p, x, y] of poiScreens) { const sp = sprite(p.img, 2 * r, true); if (sp) c.drawImage(sp, x - r - 1, y - r - 1, 2 * r + 2, 2 * r + 4); }
  const lfs = clamp(10 + s * .008, 12, 17);
  c.font = `700 ${lfs}px "Barlow Condensed", sans-serif`;
  for (const [p, x, y] of poiScreens) {
    if (!(s >= 70 && (p.major || s >= 260))) continue;
    const w = c.measureText(p.label).width * 1.08 + 4;
    const cands = [[x + r + 4 + w / 2, y], [x - r - 4 - w / 2, y], [x, y - r - lfs * .8], [x, y + r + lfs * .8]];
    for (const [lx, ly] of cands) {
      if (free([lx - w / 2, ly - lfs / 2, lx + w / 2, ly + lfs / 2])) { halo(c, p.label, lx, ly, '#fff', '#14141c', lfs * .3, .06); break; }
    }
  }
}
function spaced(c, t, ls, mode) {
  const fs = parseFloat(c.font.match(/(\d+(\.\d+)?)px/)[1]);
  if ('letterSpacing' in c) { c.letterSpacing = `${ls * fs}px`; c[mode === 'fill' ? 'fillText' : 'strokeText'](t, ls * fs / 2, 0); c.letterSpacing = '0px'; }
  else c[mode === 'fill' ? 'fillText' : 'strokeText'](t, 0, 0);
}
function halo(c, t, x, y, fill, stroke, hw, ls = 0) {
  const fs = parseFloat(c.font.match(/(\d+(\.\d+)?)px/)[1]);
  const sp = 'letterSpacing' in c && ls;
  if (sp) c.letterSpacing = `${ls * fs}px`;
  const dx = sp ? ls * fs / 2 : 0;
  c.lineWidth = hw; c.strokeStyle = stroke; c.strokeText(t, x + dx, y);
  c.fillStyle = fill; c.fillText(t, x + dx, y);
  if (sp) c.letterSpacing = '0px';
}
const widthCache = new Map();
function streetLabels(c, free) {
  const s = cam.s, fs = clamp(8 + s * .004, 11, 16);
  c.font = `700 ${fs}px "Barlow Condensed", sans-serif`;
  const v = viewBox(0); const seen = new Map(); let n = 0;
  for (const i of G.labelOrder) {
    const A = G.arcs[i];
    if (A.cls === 0 && s < 560) continue;
    if (A.cls === 3 || A.unnamed) continue;
    if (A.len * s < 50 || !boxHit(A.bb, v)) continue;
    const f = A.f, k = A.lseg;
    const [x1, y1] = toScreen(f[k], f[k + 1]), [x2, y2] = toScreen(f[k + 2], f[k + 3]);
    const segLen = Math.hypot(x2 - x1, y2 - y1);
    const key = A.label + fs; let w = widthCache.get(key);
    if (w === undefined) { w = c.measureText(A.label).width; widthCache.set(key, w); }
    if (segLen < w + 16) continue;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    if (mx < 0 || mx > W || my < 0 || my > H) continue;
    const prev = seen.get(A.name); if (prev && prev.some(([px, py]) => Math.hypot(px - mx, py - my) < 320)) continue;
    let ang = Math.atan2(y2 - y1, x2 - x1); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
    const ca = Math.abs(Math.cos(ang)), sa = Math.abs(Math.sin(ang));
    const hw = (w / 2) * ca + (fs / 2) * sa, hh = (w / 2) * sa + (fs / 2) * ca;
    if (!free([mx - hw, my - hh, mx + hw, my + hh])) continue;
    c.save(); c.translate(mx, my); c.rotate(ang);
    halo(c, A.label, 0, 0, A.cls >= 1 ? '#3a2606' : '#3b3326', 'rgba(255,250,236,.95)', fs * .32);
    c.restore();
    if (!prev) seen.set(A.name, [[mx, my]]); else prev.push([mx, my]);
    if (++n > 140) break;
  }
}

// ------------------------------------------------------------------ overlay (route, markers, nav car)
const state = { from: null, to: null, mode: 'drive', avoidZtl: true, route: null, nav: null, pick: null, hover: null };
function placeBase() {
  const b = baseCam, k = cam.s / b.s;
  const tx = W / 2 - cam.x * cam.s - k * (M + W / 2) + b.x * cam.s;
  const ty = H / 2 + cam.y * cam.s - k * (M + H / 2) - b.y * cam.s;
  return { k, tx, ty, covered: tx <= .5 && ty <= .5 && tx + k * (W + 2 * M) >= W - .5 && ty + k * (H + 2 * M) >= H - .5 };
}
let lastT = '';
function updateBase(now) {
  let p = baseCam && placeBase();
  const still = !drag && !pinch && !flight;
  const following = !!(state.nav && state.nav.follow);
  // the GPS drive glides the camera every frame: redraw for zoom changes or when leaving the margin only
  const settledZoom = still && (now - lastMove > 220 || following);
  const settledPan = still && now - lastMove > 220 && !following;
  if (!baseCam || baseDirty || !p.covered || p.k < .45 || p.k > 2.6 ||
      (settledZoom && Math.abs(p.k - 1) > 1e-3) ||
      (settledPan && (Math.abs(p.tx + M) > .5 || Math.abs(p.ty + M) > .5))) {
    drawBase(); baseDirty = false; p = placeBase();
  }
  const t = `translate(${p.tx.toFixed(2)}px,${p.ty.toFixed(2)}px) scale(${p.k.toFixed(5)})`;
  if (t !== lastT) { base.style.transform = t; lastT = t; }
}
function drawFrame(now) {
  updateBase(now);
  screenT(ctx); ctx.clearRect(0, 0, W, H);
  const s = cam.s, px = 1 / s;
  const R = state.route;
  if (R) {
    worldT(ctx); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const rw = clamp(4 + s * .006, 6, 15);
    // connectors from the exact points to the road
    ctx.setLineDash([2 * px, 6 * px]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5 * px; ctx.stroke(R.connPath); ctx.setLineDash([]);
    // soft glow from two wide translucent strokes (no live blur)
    ctx.strokeStyle = C.route; ctx.globalAlpha = .16; ctx.lineWidth = (rw + 20) * px; ctx.stroke(R.path);
    ctx.strokeStyle = C.routeGlow; ctx.globalAlpha = .45; ctx.lineWidth = (rw + 10) * px; ctx.stroke(R.path);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = C.routeCase; ctx.lineWidth = (rw + 3.5) * px; ctx.stroke(R.path);
    ctx.strokeStyle = C.route; ctx.lineWidth = rw * px; ctx.stroke(R.path);
    if (state.nav) { ctx.strokeStyle = 'rgba(40,20,35,.55)'; ctx.lineWidth = rw * px; ctx.stroke(state.nav.donePath || new Path2D()); }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2.2, rw * .3) * px;
    ctx.setLineDash([.01 * px, 16 * px]); ctx.lineDashOffset = reduceMotion ? 0 : -(now / 1000 * 34) * px; ctx.stroke(R.path);
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    screenT(ctx);
  }
  // endpoints
  const pulse = reduceMotion ? .5 : (now % 1600) / 1600;
  if (state.from) drawStart(...toScreen(state.from.x, state.from.y));
  if (state.to) drawDest(...toScreen(state.to.x, state.to.y), pulse);
  if (state.nav) drawCar(now);
  updatePopup();
  if (BW.onFrame) BW.onFrame();
}
function drawStart(x, y) {
  const c = ctx; c.save();
  c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 6 * DPR; c.shadowOffsetY = 2 * DPR;
  c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 14, 0, 7); c.fill(); c.restore();
  c.fillStyle = '#2f9ad6'; c.beginPath(); c.arc(x, y, 11, 0, 7); c.fill();
  c.fillStyle = '#fff'; c.font = '400 12px Bungee, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('A', x, y + 1);
}
function drawDest(x, y, p) {
  const c = ctx;
  // pulsing ground ring
  c.strokeStyle = `rgba(255,63,164,${.8 * (1 - p)})`; c.lineWidth = 3; c.beginPath(); c.ellipse(x, y, 10 + p * 26, (10 + p * 26) * .45, 0, 0, 7); c.stroke();
  c.save(); c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 8 * DPR; c.shadowOffsetY = 3 * DPR;
  // teardrop waypoint
  c.fillStyle = '#fff'; c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x - 6, y - 12, x - 19, y - 22, x - 19, y - 36); c.arc(x, y - 36, 19, Math.PI, 0); c.bezierCurveTo(x + 19, y - 22, x + 6, y - 12, x, y); c.fill(); c.restore();
  c.fillStyle = C.route; c.beginPath(); c.arc(x, y - 36, 15.5, 0, 7); c.fill();
  c.fillStyle = '#fff'; c.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 4.2 : 9.5; c.lineTo(x + Math.cos(a) * rr, y - 36 + Math.sin(a) * rr); }
  c.fill();
}

// ------------------------------------------------------------------ search
let INDEX = [];
function buildSearchIndex() {
  INDEX = [];
  for (const p of POIS) INDEX.push({ type: 'poi', label: p.name, sub: 'Landmark', key: norm(p.name + ' ' + p.alt), x: p.x, y: p.y, poi: p });
  for (const z of G.zones) {
    const game = titleCase(z.label.replace('\n', ' '));
    INDEX.push({ type: 'zone', label: game, sub: `District · ${z.name}`, key: norm(game + ' ' + z.name), x: z.centro ? null : z.lp[0], y: z.centro ? null : z.lp[1], zone: z });
  }
  // streets: pick the arc nearest the middle of all arcs with that name
  const by = new Map();
  G.arcs.forEach((A, i) => { if (A.cls === 3 || A.unnamed) return; let l = by.get(A.name); if (!l) by.set(A.name, l = []); l.push(i); });
  for (const [name, ids] of by) {
    let mx = 0, my = 0, L = 0;
    for (const i of ids) { const A = G.arcs[i]; const m = pointAt(A, A.len / 2); mx += m[0] * A.len; my += m[1] * A.len; L += A.len; }
    mx /= L || 1; my /= L || 1;
    let best = null, bd = Infinity;
    for (const i of ids) { const m = pointAt(G.arcs[i], G.arcs[i].len / 2); const d = Math.hypot(m[0] - mx, m[1] - my); if (d < bd) { bd = d; best = m; } }
    const label = titleCase(name);
    INDEX.push({ type: 'street', label, sub: '', key: norm(label), x: best[0], y: best[1], len: L });
  }
  for (const p of G.places || []) {
    if (!p.n) continue;
    const C_ = CATS[p.c];
    INDEX.push({ type: 'place', label: p.n, sub: `${C_.name}${p.road ? ' · ' + p.road : ''}`, key: norm(p.n + ' ' + C_.alias), x: p.x, y: p.y, cat: p.c });
  }
  for (const e of INDEX) e.tokens = e.key.split(' ');
  // old-town districts get the old-town label point
  const ot = ll2w(11.3428, 44.4945);
  for (const e of INDEX) if (e.type === 'zone' && e.x === null) [e.x, e.y] = ot;
}
function districtOf(x, y) {
  for (const z of G.zones) if (z.rings.some((r) => pointInRing(x, y, r))) return z.centro ? 'Old Town' : titleCase(z.label.replace('\n', ' '));
  return 'Bologna';
}
function search(q) {
  const qt = norm(q).split(' ').filter((t) => t && !/^\d+[a-z]?$/.test(t));
  if (!qt.length) return [];
  const res = [];
  for (const e of INDEX) {
    let score = 0, ok = true;
    for (const t of qt) {
      let hit = -1;
      for (let j = 0; j < e.tokens.length; j++) if (e.tokens[j].startsWith(t)) { hit = j; break; }
      if (hit < 0) { if (e.key.includes(t) && t.length > 2) { score += 2; continue; } ok = false; break; }
      score += (e.tokens[hit] === t ? 8 : 5) - Math.min(hit, 3);
    }
    if (!ok) continue;
    if (e.type === 'poi') score += 12;
    if (e.type === 'zone') score += 6;
    if (e.type === 'street') score += Math.min(4, (e.len || 0) * 1.5);
    if (e.key.startsWith(qt.join(' '))) score += 6;
    if (e.type === 'place') score -= Math.min(6, Math.hypot(e.x - cam.x, e.y - cam.y) * .6); // nearer places first
    res.push([score - e.label.length * .02, e]);
  }
  res.sort((a, b) => b[0] - a[0]);
  return res.slice(0, 8).map((r) => r[1]);
}

// ------------------------------------------------------------------ snapping + routing
function allowed(A, mode) {
  if (mode === 'drive') return !A.noCar;
  return A.cls !== 3;
}
function snap(x, y, mode) {
  const cs = G.cell, cx0 = Math.floor(x / cs), cy0 = Math.floor(y / cs);
  let best = null, bd = Infinity;
  for (let ring = 0; ring < 30; ring++) {
    for (let cx = cx0 - ring; cx <= cx0 + ring; cx++) for (let cy = cy0 - ring; cy <= cy0 + ring; cy++) {
      if (Math.max(Math.abs(cx - cx0), Math.abs(cy - cy0)) !== ring) continue;
      const cell = G.grid.get(cx * 10007 + cy); if (!cell) continue;
      for (let k = 0; k < cell.length; k += 2) {
        const A = G.arcs[cell[k]]; if (!allowed(A, mode)) continue;
        const i = cell[k + 1], f = A.f;
        const ax = f[i], ay = f[i + 1], dx = f[i + 2] - ax, dy = f[i + 3] - ay;
        const L2 = dx * dx + dy * dy; let t = L2 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0; t = clamp(t, 0, 1);
        const px = ax + dx * t, py = ay + dy * t, d = Math.hypot(px - x, py - y);
        if (d < bd) { bd = d; best = { arc: cell[k], along: A.cum[i / 2] + Math.sqrt(L2) * t, x: px, y: py, d }; }
      }
    }
    if (best && bd < ring * cs) break;
  }
  return best;
}
class Heap {
  constructor() { this.k = []; this.v = []; }
  push(key, val) { const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val); while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; } k[i] = key; v[i] = val; }
  pop() {
    const k = this.k, v = this.v, top = v[0], last = k.length - 1, lk = k[last], lv = v[last];
    k.pop(); v.pop(); if (!last) return top;
    let i = 0; for (;;) { let c = 2 * i + 1; if (c >= last) break; if (c + 1 < last && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; }
    k[i] = lk; v[i] = lv; return top;
  }
  get size() { return this.k.length; }
  get minKey() { return this.k[0]; }
}
function route(from, to, mode, avoidZtl) {
  const M = MODES[mode];
  const rate = (A) => (1 / M.speed[A.cls]) * (mode === 'drive' && avoidZtl && A.ztl ? 7 : 1); // hours per km
  const S = snap(from.x, from.y, mode), T = snap(to.x, to.y, mode);
  if (!S || !T) return null;
  const SA = G.arcs[S.arc], TA = G.arcs[T.arc];
  const n = G.NX.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  const vmax = Math.max(...M.speed);
  const h = (i) => Math.hypot(G.NX[i] - T.x, G.NY[i] - T.y) / vmax;
  const heap = new Heap();
  const seed = (node, cost) => { if (cost < dist[node]) { dist[node] = cost; prev[node] = -2; heap.push(cost + h(node), node); } };
  seed(SA.a, S.along * rate(SA)); seed(SA.b, (SA.len - S.along) * rate(SA));
  const exitA = T.along * rate(TA), exitB = (TA.len - T.along) * rate(TA);
  let best = Infinity, bestEnd = -1;
  if (S.arc === T.arc) { best = Math.abs(S.along - T.along) * rate(SA); bestEnd = -3; }
  while (heap.size) {
    if (heap.minKey >= best) break;
    const u = heap.pop(); if (done[u]) continue; done[u] = 1;
    if (u === TA.a && dist[u] + exitA < best) { best = dist[u] + exitA; bestEnd = u; }
    if (u === TA.b && dist[u] + exitB < best) { best = dist[u] + exitB; bestEnd = u; }
    for (const ai of G.adj[u]) {
      const A = G.arcs[ai]; if (!allowed(A, mode)) continue;
      const v = A.a === u ? A.b : A.a; if (done[v]) continue;
      const nd = dist[u] + A.len * rate(A) + M.perArc;
      if (nd < dist[v]) { dist[v] = nd; prev[v] = ai; heap.push(nd + h(v), v); }
    }
  }
  if (bestEnd === -1) return null;
  // rebuild as legs: { arc, pts }
  const legs = [];
  if (bestEnd === -3) legs.push({ A: SA, pts: subline(SA, S.along, T.along) });
  else {
    const chain = []; let u = bestEnd;
    while (prev[u] >= 0) { const ai = prev[u]; const A = G.arcs[ai]; const from_ = A.a === u ? A.b : A.a; chain.push([A, from_, u]); u = from_; }
    chain.reverse();
    const startNode = u; // seeded node
    legs.push({ A: SA, pts: subline(SA, S.along, startNode === SA.a ? 0 : SA.len) });
    for (const [A, a] of chain) legs.push({ A, pts: a === A.a ? subline(A, 0, A.len) : subline(A, A.len, 0) });
    legs.push({ A: TA, pts: subline(TA, bestEnd === TA.a ? 0 : TA.len, T.along) });
  }
  return finishRoute(legs, S, T, from, to, mode);
}
function plen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
function bearing(a, b) { return Math.atan2(b[1] - a[1], b[0] - a[0]); }
function finishRoute(legs, S, T, from, to, mode) {
  const M = MODES[mode];
  legs = legs.filter((l) => l.pts.length > 1 && plen(l.pts) > 1e-6);
  let km = 0, hours = 0, ztlKm = 0;
  const pts = [];
  for (const l of legs) {
    l.len = plen(l.pts); km += l.len; hours += l.len / M.speed[l.A.cls] + M.perArc;
    if (l.A.ztl) ztlKm += l.len;
    for (const p of l.pts) { const q = pts[pts.length - 1]; if (!q || q[0] !== p[0] || q[1] !== p[1]) pts.push(p); }
  }
  // steps: merge legs with the same street name; tiny connector legs fold into the next street
  const steps = [];
  for (const l of legs) {
    const last = steps[steps.length - 1];
    if (last && (last.name === l.A.name || l.len < .015 || (l.A.unnamed && l.len < .4))) { last.pts = last.pts.concat(l.pts.slice(1)); last.len += l.len; continue; }
    if (last && last.unnamed && last.len < .4 && !l.A.unnamed) { Object.assign(last, { name: l.A.name, label: l.A.label, cls: l.A.cls, unnamed: false }); last.pts = last.pts.concat(l.pts.slice(1)); last.len += l.len; continue; }
    steps.push({ name: l.A.name, label: l.A.label, cls: l.A.cls, unnamed: l.A.unnamed, pts: l.pts.slice(), len: l.len });
  }
  let acc = 0;
  steps.forEach((st, i) => {
    st.at = acc; acc += st.len;
    if (i === 0) { st.turn = 'depart'; st.text = `Head ${compassWord(bearing(st.pts[0], st.pts[Math.min(st.pts.length - 1, 1)]))} on <b>${esc(st.label)}</b>`; st.angle = 0; return; }
    const p = steps[i - 1].pts, a = p[Math.max(0, p.length - 2)], b = p[p.length - 1], c2 = st.pts[Math.min(1, st.pts.length - 1)];
    let d = (bearing(b, c2) - bearing(a, b)) * 180 / Math.PI; while (d > 180) d -= 360; while (d < -180) d += 360;
    st.angle = d;
    const side = d > 0 ? 'left' : 'right', ad = Math.abs(d);
    st.turn = ad < 20 ? 'straight' : ad < 55 ? 'slight' : ad < 135 ? 'turn' : 'sharp';
    const verb = { straight: 'Continue onto', slight: `Keep ${side} onto`, turn: `Turn ${side} onto`, sharp: `Sharp ${side} onto` }[st.turn];
    st.text = `${verb} <b>${esc(st.label)}</b>`;
  });
  steps.push({ turn: 'arrive', text: `Arrive at <b>${esc(to.label)}</b>`, len: 0, at: km, angle: 0, pts: [pts[pts.length - 1]] });
  const path = new Path2D(); path.moveTo(...pts[0]); for (const p of pts) path.lineTo(...p);
  const connPath = new Path2D();
  if (S.d > .01) { connPath.moveTo(from.x, from.y); connPath.lineTo(S.x, S.y); }
  if (T.d > .01) { connPath.moveTo(T.x, T.y); connPath.lineTo(to.x, to.y); }
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const walkExtra = (S.d + T.d) / 4.8 * (mode === 'walk' ? 1 : .5);
  return { pts, cum, path, connPath, km, hours: hours + walkExtra, ztlKm, steps, mode, bb: bbox(Float64Array.from(pts.flat().concat([from.x, from.y, to.x, to.y]))) };
}
function compassWord(b) { const d = ((90 - b * 180 / Math.PI) + 360) % 360; return ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(d / 45) % 8]; }
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ------------------------------------------------------------------ UI: endpoints + trip card
const fromIn = $('#from'), toIn = $('#to'), sugg = $('#suggest');
function setEnd(which, e, opts = {}) {
  state[which] = e ? { label: e.label, x: e.x, y: e.y } : null;
  (which === 'from' ? fromIn : toIn).value = e ? e.label : '';
  if (!opts.quiet && e) toast(which === 'from' ? 'START SET' : 'WAYPOINT SET', e.label);
  recompute(opts);
}
function recompute(opts = {}) {
  state.route = null;
  if (state.from && state.to) state.route = route(state.from, state.to, state.mode, state.avoidZtl);
  renderTrip();
  needFrame = true;
  if (opts.noFit) return;
  if (state.route) fitBox(state.route.bb, opts.ms);
  else if (state.from || state.to) { const e = state.to || state.from; if (cam.s < 300) flyTo(e.x, e.y, 700); else flyTo(e.x, e.y, cam.s); }
}
function renderTrip() {
  const R = state.route, trip = $('#trip');
  document.body.classList.toggle('has-route', !!R);
  document.body.classList.toggle('no-trip', !(state.from && state.to));
  trip.hidden = !(state.from && state.to);
  if (trip.hidden) return;
  if (!R) {
    $('#tripTitle').textContent = 'No route found';
    $('#tMin').textContent = '--'; $('#tKm').textContent = 'Try another mode'; $('#tEta').textContent = '';
    $('#wanted').hidden = true; $('#go').disabled = true; $('#steps').innerHTML = ''; return;
  }
  $('#go').disabled = false;
  const verb = MODES[R.mode].verb;
  $('#tripTitle').textContent = `${verb} to ${state.to.label}`;
  $('#tMin').textContent = fmtMin(R.hours);
  $('#tKm').textContent = fmtKm(R.km);
  $('#tEta').textContent = 'ETA ' + fmtClock(new Date(Date.now() + R.hours * 3600e3));
  const w = $('#wanted'); w.hidden = false;
  let stars = 0;
  if (R.mode === 'drive' && R.ztlKm > .02) stars = R.ztlKm < .4 ? 1 : R.ztlKm < 1 ? 2 : 3;
  w.classList.toggle('clean', stars === 0);
  $('#wStars').innerHTML = '<b>' + '★'.repeat(stars) + '</b>' + '★'.repeat(5 - stars);
  $('#wText').textContent = R.mode !== 'drive' ? 'No wanted level on foot or by bike. The ZTL only limits cars.'
    : stars ? `Wanted level: this route drives ${fmtKm(R.ztlKm)} inside the ZTL. You need a permit.`
      : 'Clean record. This route stays out of the ZTL.';
  const ol = $('#steps'); ol.innerHTML = '';
  R.steps.forEach((st, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="arr">${arrowSvg(st, '#ffcf3f', '#ffcf3f')}</span><span class="txt">${st.text}</span><span class="d">${st.len ? fmtKm(st.len) : ''}</span>`;
    li.addEventListener('click', () => { const p = st.pts[0]; flyTo(p[0], p[1], Math.max(cam.s, 1400), 700); });
    ol.appendChild(li);
  });
}
function arrowSvg(st, fill, stroke) {
  if (st.turn === 'arrive') return `<svg viewBox="0 0 24 24"><path d="M6 21V3" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round"/><path d="M7 4h11l-2.5 4 2.5 4H7z" fill="${fill}"/></svg>`;
  if (st.turn === 'depart') return `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="${fill}"/><circle cx="12" cy="12" r="9" fill="none" stroke="${stroke}" stroke-width="2"/></svg>`;
  const a = clamp(-st.angle, -150, 150);
  return `<svg viewBox="0 0 24 24"><g fill="none" stroke="${stroke}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21v-7"/><g transform="rotate(${a} 12 14)"><path d="M12 14V4M7.5 8.5 12 4l4.5 4.5"/></g></g></svg>`;
}

// suggestions dropdown
let active = null, items = [], sel = -1;
function openSuggest(input) {
  active = input; const q = input.value;
  items = q.trim() ? search(q) : [];
  const which = input === fromIn ? 'from' : 'to';
  const acts = [{ act: 'pick', label: 'Choose on the map', sub: `Click anywhere to set ${which === 'from' ? 'the start' : 'the destination'}` }];
  if (!q.trim()) {
    items = POIS.filter((p) => p.major).slice(0, 6).map((p) => INDEX.find((e) => e.poi === p));
  }
  sel = q.trim() && items.length ? 0 : -1;
  const all = q.trim() ? items.concat(acts) : acts.concat(items);
  sugg.innerHTML = '';
  if (q.trim() && !items.length) {
    const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'No street or place with that name in Bologna.'; sugg.appendChild(li);
  }
  all.forEach((e, i) => {
    const li = document.createElement('li'); li.setAttribute('role', 'option'); li.id = 'sg' + i;
    let ico;
    if (e.act) ico = '<span class="ico act"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg></span>';
    else if (e.type === 'place') ico = `<span class="ico"><img alt="" src="${CAT_IMG[e.cat].src}"></span>`;
    else if (e.type === 'poi') ico = `<span class="ico"><img alt="" src="${e.poi.img.dataset.src}"></span>`;
    else if (e.type === 'zone') ico = '<span class="ico zone"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 20V9l8-5 8 5v11h-5v-6H9v6z"/></svg></span>';
    else ico = '<span class="ico street"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M8 3 5 21M16 3l3 18M12 4v3M12 11v3M12 18v2"/></svg></span>';
    const sub = e.act ? e.sub : e.type === 'street' ? `Street · ${districtOf(e.x, e.y)}` : e.sub;
    li.innerHTML = `${ico}<span class="tx"><div class="t">${esc(e.label)}</div><div class="s">${esc(sub)}</div></span>`;
    li.addEventListener('pointerdown', (ev) => { ev.preventDefault(); choose(e); });
    sugg.appendChild(li);
  });
  sugg._all = all;
  highlight(q.trim() ? 0 : -1);
  sugg.hidden = false;
}
function highlight(i) {
  sel = i; [...sugg.querySelectorAll('li[role=option]')].forEach((li, j) => li.setAttribute('aria-selected', j === i ? 'true' : 'false'));
  if (active) active.setAttribute('aria-activedescendant', i >= 0 ? 'sg' + i : '');
}
function closeSuggest() { sugg.hidden = true; active = null; }
function choose(e) {
  const which = active === fromIn ? 'from' : 'to';
  const inp = active; closeSuggest(); inp.blur();
  if (e.act === 'pick') { startPick(which); return; }
  setEnd(which, e);
  if (which === 'from' && !state.to) toIn.focus();
}
for (const inp of [fromIn, toIn]) {
  inp.addEventListener('focus', () => { inp.select(); openSuggest(inp); });
  inp.addEventListener('input', () => openSuggest(inp));
  inp.addEventListener('blur', () => setTimeout(() => { if (active === inp) { closeSuggest(); const which = inp === fromIn ? 'from' : 'to'; inp.value = state[which] ? state[which].label : ''; } }, 120));
  inp.addEventListener('keydown', (ev) => {
    const all = sugg._all || [];
    if (ev.key === 'ArrowDown') { ev.preventDefault(); highlight(Math.min(all.length - 1, sel + 1)); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); highlight(Math.max(0, sel - 1)); }
    else if (ev.key === 'Enter') { ev.preventDefault(); if (sel >= 0 && all[sel]) choose(all[sel]); }
    else if (ev.key === 'Escape') { closeSuggest(); inp.blur(); }
  });
}
document.querySelectorAll('[data-clear]').forEach((b) => b.addEventListener('click', () => { const w = b.dataset.clear; setEnd(w, null, { noFit: true }); (w === 'from' ? fromIn : toIn).focus(); }));
$('#swap').addEventListener('click', () => {
  const f = state.from, t = state.to; state.from = t; state.to = f;
  fromIn.value = t ? t.label : ''; toIn.value = f ? f.label : ''; recompute();
});
document.querySelectorAll('.modes button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
function setMode(m) {
  state.mode = m;
  document.querySelectorAll('.modes button').forEach((x) => x.setAttribute('aria-checked', x.dataset.mode === m ? 'true' : 'false'));
  $('#ztlToggle').hidden = m !== 'drive';
  if (state.from && state.to) recompute();
}
$('#avoidZtl').addEventListener('change', (e) => { state.avoidZtl = e.target.checked; if (state.route) recompute(); });
$('#stepsBtn').addEventListener('click', () => { const s = $('#steps'); s.hidden = !s.hidden; $('#stepsBtn').setAttribute('aria-expanded', String(!s.hidden)); });
function runMission(m) {
  const find = (n) => INDEX.find((e) => e.type === 'poi' && e.label === n);
  setMode(m.mode); setEnd('from', find(m.from), { quiet: true, noFit: true }); setEnd('to', find(m.to), { quiet: true });
  toast('NEW MISSION', m.label);
}
const chips = $('#chips');
MISSIONS.forEach((m) => {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'chip';
  b.innerHTML = `${esc(m.label)}<span class="m">${MODES[m.mode].name.toLowerCase()}</span>`;
  b.addEventListener('click', () => runMission(m)); chips.appendChild(b);
});

// pick on map
function startPick(which) { state.pick = which; canvas.classList.add('picking'); toast(which === 'from' ? 'PICK A START' : 'PICK A DESTINATION', 'Click anywhere on the map'); }

// popup at a clicked point
let popAt = null;
function showPopup(x, y, title, sub, poi) {
  popAt = { x, y, title, poi };
  $('#popTitle').textContent = title; $('#popSub').textContent = sub; $('#pop').hidden = false; updatePopup();
}
function hidePopup() { popAt = null; $('#pop').hidden = true; }
function updatePopup() {
  if (!popAt) return;
  const [sx, sy] = toScreen(popAt.x, popAt.y), p = $('#pop');
  if (sx < -50 || sx > W + 50 || sy < -50 || sy > H + 50) { p.style.visibility = 'hidden'; return; }
  p.style.visibility = ''; p.style.left = sx + 'px'; p.style.top = (sy - (popAt.poi ? 14 : 0)) + 'px';
}
$('#popFrom').addEventListener('click', () => { const a = popAt; hidePopup(); setEnd('from', { label: a.title, x: a.x, y: a.y }); });
$('#popTo').addEventListener('click', () => { const a = popAt; hidePopup(); setEnd('to', { label: a.title, x: a.x, y: a.y }); });
function onMapClick(sx, sy) {
  const [x, y] = toWorld(sx, sy);
  const inLand = pointInRing(x, y, G.landRing);
  if (state.pick) {
    const which = state.pick; state.pick = null; canvas.classList.remove('picking');
    if (!inLand) { toast('OUT OF BOUNDS', 'Pick a point inside Bologna'); return; }
    const sn = snap(x, y, 'walk'); setEnd(which, { label: sn ? `Near ${G.arcs[sn.arc].label}` : 'Dropped pin', x, y }); return;
  }
  // a landmark under the cursor?
  const r = clamp(8 + cam.s * .02, 11, 17) + 4;
  for (const p of POIS) {
    if (!(p.major || cam.s >= 110)) continue;
    const [px, py] = toScreen(p.x, p.y);
    if (Math.hypot(px - sx, py - sy) <= r) { showPopup(p.x, p.y, p.name, `Landmark · ${districtOf(p.x, p.y)}`, true); return; }
  }
  if (G.drawn) {
    const pr = placeR(cam.s) + 4;
    for (let i = G.drawn.length - 1; i >= 0; i--) {
      const p = G.drawn[i]; const [px, py] = toScreen(p.x, p.y);
      if (Math.hypot(px - sx, py - sy) <= pr) { showPopup(p.x, p.y, p.n || CATS[p.c].name, `${CATS[p.c].name}${p.road ? ' · ' + p.road : ''}`, true); return; }
    }
  }
  if (!inLand) { hidePopup(); return; }
  const sn = snap(x, y, 'walk');
  const name = sn && sn.d < .15 ? G.arcs[sn.arc].label : 'Dropped pin';
  showPopup(x, y, name, districtOf(x, y), false);
}

// toast
let toastTimer;
function toast(t, s) {
  $('#toastT').textContent = t; $('#toastS').textContent = s || '';
  const el = $('#toast'); el.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ------------------------------------------------------------------ map interaction
const ptrs = new Map(); let drag = null, pinch = null, moved = 0;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); flight = null;
  if (ptrs.size === 1) { drag = { x: e.clientX, y: e.clientY }; moved = 0; canvas.classList.add('dragging'); }
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: cam.s, w: toWorld((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) }; drag = null;
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (state.nav && (drag || pinch)) state.nav.follow = false;
  if (pinch && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const s = clamp(pinch.s * d / pinch.d, S_MIN, S_MAX), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    setCam(pinch.w[0] - (mx - W / 2) / s, pinch.w[1] + (my - H / 2) / s, s); moved = 99;
  } else if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX; drag.y = e.clientY;
    setCam(cam.x - dx / cam.s, cam.y + dy / cam.s, cam.s);
  }
});
const endPtr = (e) => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (drag && moved < 6 && e.type === 'pointerup') onMapClick(e.clientX, e.clientY);
  if (ptrs.size === 0) { drag = null; pinch = null; canvas.classList.remove('dragging'); }
  if (ptrs.size === 1) { const [p] = [...ptrs.values()]; drag = { x: p[0], y: p[1] }; pinch = null; }
};
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault(); flight = null;
  const k = Math.exp(-e.deltaY * (e.deltaMode === 1 ? .05 : .0016));
  zoomAt(e.clientX, e.clientY, cam.s * k);
}, { passive: false });
canvas.addEventListener('dblclick', (e) => { e.preventDefault(); const [x, y] = toWorld(e.clientX, e.clientY); const s = cam.s * 2.2; flyTo(x - (e.clientX - W / 2) / s, y + (e.clientY - H / 2) / s, s, 400); });
function zoomAt(sx, sy, s) {
  s = clamp(s, S_MIN, S_MAX); const [x, y] = toWorld(sx, sy);
  setCam(x - (sx - W / 2) / s, y + (sy - H / 2) / s, s);
}
$('#zin').addEventListener('click', () => flyTo(cam.x, cam.y, cam.s * 2, 350));
$('#zout').addEventListener('click', () => flyTo(cam.x, cam.y, cam.s / 2, 350));
$('#fit').addEventListener('click', () => state.route ? fitBox(state.route.bb) : fitCity());
$('#compass').addEventListener('click', fitCity);

// ------------------------------------------------------------------ map icon legend + filters
const catOn = {};
(() => {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('bw-cats') || 'null'); } catch (_) { /* storage blocked */ }
  CAT_KEYS.forEach((k) => { catOn[k] = saved && k in saved ? !!saved[k] : true; });
})();
function saveCats() { try { localStorage.setItem('bw-cats', JSON.stringify(catOn)); } catch (_) { /* storage blocked */ } }
function renderLegend() {
  const list = $('#legendList'); list.innerHTML = '';
  const groups = [...new Set(CAT_KEYS.map((k) => CATS[k].group))];
  for (const gname of groups) {
    const h = document.createElement('div'); h.className = 'lg-h'; h.textContent = gname.toUpperCase(); list.appendChild(h);
    const box = document.createElement('div'); box.className = 'lg-grid'; list.appendChild(box);
    for (const k of CAT_KEYS.filter((k) => CATS[k].group === gname)) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'lg-item';
      b.setAttribute('aria-pressed', String(catOn[k]));
      b.innerHTML = `<img alt="" src="${catImage(k).src}"><span class="lg-n">${CATS[k].name}</span><span class="lg-c">${(G.placeCount || {})[k] || 0}</span>`;
      b.addEventListener('click', () => { catOn[k] = !catOn[k]; b.setAttribute('aria-pressed', String(catOn[k])); saveCats(); baseDirty = true; needFrame = true; });
      box.appendChild(b);
    }
  }
  updateLegendHint();
}
function updateLegendHint() { const el = $('#legendHint'); if (el) el.hidden = cam.s >= PLACE_MIN_S; }
function setAllCats(v) { CAT_KEYS.forEach((k) => { catOn[k] = v; }); saveCats(); renderLegend(); baseDirty = true; needFrame = true; }
$('#legendBtn').addEventListener('click', () => {
  const L = $('#legend'); L.hidden = !L.hidden; $('#legendBtn').setAttribute('aria-expanded', String(!L.hidden));
  if (!L.hidden) renderLegend();
});
$('#legendClose').addEventListener('click', () => { $('#legend').hidden = true; $('#legendBtn').setAttribute('aria-expanded', 'false'); });
$('#lgAll').addEventListener('click', () => setAllCats(true));
$('#lgNone').addEventListener('click', () => setAllCats(false));
$('#legendZoom').addEventListener('click', () => { const R_ = state.route; const p = R_ ? R_.pts[R_.pts.length - 1] : [cam.x, cam.y]; flyTo(p[0], p[1], 900, 700); });
function fitCity() { fitBox(G.landBox, 900); }
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === '+' || e.key === '=') flyTo(cam.x, cam.y, cam.s * 1.6, 250);
  if (e.key === '-') flyTo(cam.x, cam.y, cam.s / 1.6, 250);
  if (e.key === 'Escape') { hidePopup(); if (state.pick) { state.pick = null; canvas.classList.remove('picking'); } }
  if (e.key === '/') { e.preventDefault(); toIn.focus(); }
});
window.addEventListener('resize', resize);

// ------------------------------------------------------------------ GPS simulation
function posAt(R, d) {
  const cum = R.cum; let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
  const t = clamp((d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), 0, 1);
  const a = R.pts[i - 1], b = R.pts[i];
  return { x: lerp(a[0], b[0], t), y: lerp(a[1], b[1], t), h: Math.atan2(b[1] - a[1], b[0] - a[0]), i };
}
function startNav() {
  const R = state.route; if (!R) return;
  hidePopup(); closeSuggest();
  const secs = clamp(R.km * 4.5, 14, 50);
  state.nav = { t0: performance.now(), dur: secs * 1000, follow: true, d: 0, heading: 0 };
  document.body.classList.add('navigating');
  $('#navTop').hidden = false; $('#navBot').hidden = false;
  toast('MISSION STARTED', `${MODES[R.mode].verb} to ${state.to.label}`);
  const p = posAt(R, 0); flyTo(p.x, p.y, R.mode === 'walk' ? 1100 : R.mode === 'bike' ? 700 : 450, 900);
  state.nav.t0 += 900;
}
function endNav(arrived) {
  state.nav = null; document.body.classList.remove('navigating');
  $('#navTop').hidden = true; $('#navBot').hidden = true;
  if (arrived) toast('MISSION PASSED', `You reached ${state.to.label}`);
  if (state.route) fitBox(state.route.bb, 900);
  needFrame = true;
}
$('#go').addEventListener('click', startNav);
$('#navEnd').addEventListener('click', () => endNav(false));
function stepNav(now) {
  const N = state.nav, R = state.route; if (!N || !R) return;
  const t = clamp((now - N.t0) / N.dur, 0, 1);
  const e = t < .06 ? t * t / .12 : t > .94 ? 1 - (1 - t) * (1 - t) / .12 : t - .03; // ease in/out
  N.d = clamp(e / .94 * R.km, 0, R.km);
  const p = posAt(R, N.d);
  let dh = p.h - N.heading; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
  N.heading += dh * .2; N.x = p.x; N.y = p.y;
  // grey out the part already driven
  const done = new Path2D(); done.moveTo(...R.pts[0]); for (let i = 1; i < p.i; i++) done.lineTo(...R.pts[i]); done.lineTo(p.x, p.y); N.donePath = done;
  if (N.follow && !flight) setCam(lerp(cam.x, p.x, .15), lerp(cam.y, p.y, .15), cam.s);
  // HUD
  const next = R.steps.find((s) => s.at > N.d + .005) || R.steps[R.steps.length - 1];
  const toNext = Math.max(0, next.at - N.d);
  $('#navArrow').innerHTML = arrowSvg(next, '#0b1622', '#0b1622');
  $('#navDist').textContent = next.turn === 'arrive' && toNext < .02 ? 'ARRIVED' : fmtKm(toNext).toUpperCase();
  $('#navStreet').innerHTML = next.text;
  const remainH = R.hours * (1 - N.d / R.km);
  $('#navRemain').textContent = `${fmtMin(remainH)} MIN`;
  $('#navRemainSub').textContent = `${fmtKm(R.km - N.d).toUpperCase()} · ETA ${fmtClock(new Date(Date.now() + remainH * 3600e3))}`;
  if (t >= 1) endNav(true);
}
function drawCar() {
  const N = state.nav; if (N.x === undefined) return;
  const [x, y] = toScreen(N.x, N.y), c = ctx;
  c.save(); c.translate(x, y);
  c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 10 * DPR; c.shadowOffsetY = 3 * DPR;
  c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 19, 0, 7); c.fill(); c.shadowColor = 'transparent';
  c.fillStyle = '#2f9ad6'; c.beginPath(); c.arc(0, 0, 15.5, 0, 7); c.fill();
  c.rotate(-N.heading + Math.PI / 2);
  c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -10); c.lineTo(8, 8); c.lineTo(0, 3.5); c.lineTo(-8, 8); c.closePath(); c.fill();
  c.restore();
}

// ------------------------------------------------------------------ scale bar
function updateScale() {
  const target = 110 / cam.s; const nice = [.05, .1, .2, .25, .5, 1, 2, 5, 10];
  let v = nice[0]; for (const n of nice) if (n <= target) v = n;
  $('#scaleBar').style.width = Math.round(v * cam.s) + 'px';
  $('#scaleTxt').textContent = v < 1 ? `${Math.round(v * 1000)} M` : `${v} KM`;
}

// ------------------------------------------------------------------ loop
let lastS = 0;
let lastDraw = 0;
function frame(now) {
  stepFlight(now); stepNav(now);
  const moving = needFrame || !!flight || !!state.nav;
  const ambient = (!!state.route || !!state.to) && !reduceMotion && now - lastDraw > 33; // route dots + pulse at 30 fps
  if (moving || ambient || baseDirty || (baseCam && now - lastMove > 220 && now - lastMove < 500)) { drawFrame(now); needFrame = false; lastDraw = now; }
  if (cam.s !== lastS) { updateScale(); updateLegendHint(); lastS = cam.s; }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ boot
async function boot() {
  resize(); makePatterns();
  terrainImg = new Image(); terrainImg.onload = () => { baseDirty = true; needFrame = true; }; terrainImg.src = TERRAIN_URL;
  const json = window.BOLOGNA_DATA || await (await fetch(DATA_URL)).json();
  D = json;
  const places = window.BOLOGNA_PLACES || await fetch(PLACES_URL).then((r) => r.json()).catch(() => null);
  build(); buildPlaces(places); buildSearchIndex();
  try { await Promise.all(['400 20px Bungee', '700 20px Oswald', '700 20px "Barlow Condensed"', '400 20px "Barlow Condensed"', '400 20px Pacifico'].map((f) => document.fonts.load(f))); } catch (_) { /* fall back to system fonts */ }
  widthCache.clear();
  const [x0, y0, x1, y1] = G.landBox; setCam((x0 + x1) / 2, (y0 + y1) / 2, Math.min(W / (x1 - x0), H / (y1 - y0)) * .9);
  requestAnimationFrame(frame);
  // open in a working state: a sample mission is already routed
  runMission(MISSIONS[0]);
  setTimeout(() => $('#loading').classList.add('done'), 150);
}
// hooks for src/missions.js (crew missions + rewards), which runs after this file
const BW = window.BW = {
  cam, toScreen, toWorld, flyTo, fitBox, setEnd, setMode, toast, state, CATS,
  get G() { return G; }, get W() { return W; }, get H() { return H; },
  redraw() { needFrame = true; }, onFrame: null,
};
boot().catch((err) => {
  console.error(err);
  $('#loading .ls').textContent = 'COULD NOT LOAD THE MAP DATA. SERVE THIS FOLDER OVER HTTP (SEE README).';
});
})();
