/* Bologna Waypoint: crew missions and rewards.
   People post co-op plans ("gym at 18:30, need a spotter") at public venues; others accept and form a crew.
   Uses the hooks app.js puts on window.BW. Blips are a few DOM nodes moved with transforms in BW.onFrame,
   so nothing here adds work to the map's canvas redraws. Missions, players and offers are sample data. */
(() => {
'use strict';
const BW = window.BW;
if (!BW) return;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => n.toLocaleString('en');
const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

const CAT = (c) => BW.CATS[c];
const glyph = (c, bg) => CAT(c).g.replace(/\{bg\}/g, bg || CAT(c).color);
const icon = (c, cls = 'cwi') => `<span class="${cls}" style="background:${CAT(c).color}"><svg viewBox="0 0 100 100">${glyph(c)}</svg></span>`;
const GROUPS = { all: ['All'], food: ['Food', ['food', 'pizza', 'burger', 'gelato']], drinks: ['Drinks & coffee', ['bar', 'cafe']], fit: ['Fitness', ['gym']], culture: ['Culture', ['museum', 'cinema']], night: ['Night', ['club']] };

// ------------------------------------------------------------------ sample missions (fictional hosts, real venues)
// x, y in km from the map centre, as in G.places
const M = [
  { id: 'gym', cat: 'gym', title: 'Leg day, need a spotter', place: 'Performance Fitness Club', street: 'Via Nazario Sauro', x: .621, y: .868, when: 'Today 18:30', mins: 70, crew: [1, 2], xp: 120,
    host: { n: 'Marco', i: 'MR', c: '#e0452f', lvl: 12, rank: 'Regular', rep: 4.9, done: 38, show: 97, ver: true },
    tags: ['Beginner friendly', 'Weekly'], desc: 'Squats and lunges, about an hour. I can show you the machines if you are new. Recurring every Tuesday if we click.', badge: 'Gym Rat', bp: [3, 5] },
  { id: 'trattoria', cat: 'food', title: 'Tortellini dinner in a medieval tower', place: 'Trattoria Da Me nella torre', street: "Corte de' Galluzzi", x: .847, y: .375, when: 'Today 20:30', mins: 190, crew: [2, 4], xp: 110,
    host: { n: 'Giulia', i: 'GB', c: '#f08a24', lvl: 9, rank: 'Local', rep: 4.8, done: 21, show: 100, ver: true },
    tags: ['Split the bill', 'IT / EN'], desc: 'Booked a table for four. Classic Bolognese menu, around 30 euro each. Good for people new in town.', badge: 'Tortellini Hunter', bp: [2, 5] },
  { id: 'aperitivo', cat: 'bar', title: 'Aperitivo crew after work', place: 'Enoteca Giacchero', street: 'Corte Isolani', x: 1.343, y: .461, when: 'Today 19:00', mins: 40, crew: [3, 6], xp: 90,
    host: { n: 'Luca', i: 'LF', c: '#c2367a', lvl: 15, rank: 'Crew Captain', rep: 4.7, done: 64, show: 95, ver: true },
    tags: ['Open crew', 'Wine'], desc: 'A glass of Pignoletto and some taglieri under the porticoes. Drop in any time before 20:30.', badge: 'Aperitivo Pro', bp: [4, 5] },
  { id: 'gelato', cat: 'gelato', title: 'Gelato walk to Piazza Maggiore', place: 'Cremeria Cavour', street: 'Piazza Cavour', x: 1.011, y: .292, when: 'Today 17:45', mins: 25, crew: [1, 4], xp: 70,
    host: { n: 'Sara', i: 'SC', c: '#ff6fae', lvl: 6, rank: 'Local', rep: 5.0, done: 9, show: 100, ver: true },
    tags: ['Women only', 'Chill'], women: true, desc: 'Gelato, then a slow walk to the Neptune fountain. Women only. New to Bologna is welcome.', badge: 'Sweet Tooth', bp: [1, 5] },
  { id: 'cinema', cat: 'cinema', title: 'Original-language movie night', place: 'Cinema Modernissimo', street: 'Piazza Re Enzo', x: .989, y: .669, when: 'Today 21:15', mins: 235, crew: [1, 3], xp: 80,
    host: { n: 'Elif', i: 'EK', c: '#b3122e', lvl: 4, rank: 'Newcomer', rep: 4.6, done: 5, show: 100, ver: false },
    tags: ['Subtitled', 'Students'], desc: 'The Cineteca shows films in original language. Tickets are about 7 euro, coffee after if we like it.', badge: 'Film Buff', bp: [0, 5] },
  { id: 'museum', cat: 'museum', title: 'Sunday museum hunt + language swap', place: 'Museo internazionale della musica', street: 'Strada Maggiore', x: 1.489, y: .486, when: 'Sun 11:00', mins: 2600, crew: [2, 5], xp: 100,
    host: { n: 'Tom', i: 'TW', c: '#a06a1f', lvl: 11, rank: 'Regular', rep: 4.9, done: 30, show: 98, ver: true },
    tags: ['Free entry Sunday', 'IT ⇄ EN'], desc: 'Half the time in Italian, half in English. Old instruments, Mozart manuscripts, then a coffee.', badge: 'Polyglot', bp: [1, 3] },
  { id: 'coffee', cat: 'cafe', title: 'Study sprint + espresso', place: 'Caffè Terzi', street: 'Via Guglielmo Oberdan', x: 1.119, y: .757, when: 'Now', mins: 5, crew: [1, 3], xp: 60,
    host: { n: 'Nadia', i: 'NB', c: '#8b5a3c', lvl: 8, rank: 'Local', rep: 4.8, done: 17, show: 96, ver: true },
    tags: ['Instant', 'Quiet'], women: true, desc: 'Coffee, then two 50-minute study blocks at the university library. Women only.', badge: 'Bookworm', bp: [2, 5] },
  { id: 'club', cat: 'club', title: 'Saturday night out crew', place: 'Soda Pops', street: 'Via Castel Tialto', x: 1.316, y: .648, when: 'Sat 23:30', mins: 4000, crew: [4, 6], xp: 130,
    host: { n: 'Dario', i: 'DM', c: '#7b2ff7', lvl: 18, rank: 'Crew Captain', rep: 4.6, done: 82, show: 93, ver: true },
    tags: ['18+', 'ID-verified only'], night: true, desc: 'Meet at the bar first, go in together, leave together. ID-verified players only for night missions.', badge: 'Night Owl', bp: [3, 5] },
  { id: 'crawl', cat: 'burger', title: 'Quadrilatero food crawl, 3 stops', place: 'Il Forno', street: 'Via Pescherie Vecchie', x: 1.055, y: .546, when: 'Tomorrow 12:30', mins: 960, crew: [2, 5], xp: 160,
    host: { n: 'Paolo', i: 'PV', c: '#e9a514', lvl: 14, rank: 'Regular', rep: 4.9, done: 41, show: 99, ver: true },
    tags: ['Chain mission', 'Lunch'], desc: 'Focaccia at Il Forno, tigelle at Tigellino, then chocolate at Venchi. One small plate each, about 20 euro total.', badge: 'Market Runner', bp: [1, 5] },
];

// ------------------------------------------------------------------ player, saved per viewer
const RANKS = [[1, 'Newcomer'], [5, 'Local'], [10, 'Regular'], [15, 'Crew Captain'], [25, 'Portico Legend']];
const me = { lvl: 7, xp: 340, need: 500, wallet: 1240, pin: '#2f9ad6', title: null, owned: ['s1'], equipped: 's1', vouchers: [], phase: {}, posted: [] };
try { Object.assign(me, JSON.parse(localStorage.getItem('bw-crew') || '{}')); } catch (_) { /* storage blocked */ }
me.posted.forEach((m) => M.unshift(m));
for (const m of M) if (me.phase[m.id] === 'done') m.bp[0] = Math.min(m.bp[0] + 1, m.bp[1]);
function save() { try { localStorage.setItem('bw-crew', JSON.stringify(me)); } catch (_) { /* storage blocked */ } }
function renderPlayer() {
  $('#cwLvl').textContent = 'LV ' + me.lvl;
  $('#cwXpT').textContent = `${me.xp} / ${me.need} XP`;
  $('#cwRank').textContent = me.title || RANKS.filter((r) => me.lvl >= r[0]).pop()[1];
  $('#cwXp').style.width = Math.min(100, me.xp / me.need * 100) + '%';
  $('#cwWallet').textContent = fmt(me.wallet);
  $('#cwAv').style.background = me.pin;
}
function gainXP(n) {
  me.xp += n; me.wallet += n;
  if (me.xp >= me.need) { me.xp -= me.need; me.lvl++; me.need = Math.round(me.need * 1.15 / 10) * 10; setTimeout(() => BW.toast('LEVEL UP', `You reached level ${me.lvl}`), 1900); }
  save(); renderPlayer();
}

// ------------------------------------------------------------------ tabs
const ui = { tab: 'route', group: 'all', verified: false, women: false, soon: false, sel: null };
const crewEl = $('#crew'), body = $('#cwBody'), layer = $('#crewLayer');
function setTab(t) {
  if (t === 'rewards') { openRewards(); return; }
  ui.tab = t;
  document.querySelectorAll('.hudtabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  const crew = t === 'crew';
  document.body.classList.toggle('crew-mode', crew);
  crewEl.hidden = !crew;
  const pop = $('#pop'); if (crew && pop) pop.hidden = true;
  renderBoard(); renderBlips();
  if (crew) fitMissions();
}
document.querySelectorAll('.hudtabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
function fitMissions() {
  const pts = M.filter(passes);
  if (!pts.length) return;
  const b = [Math.min(...pts.map((m) => m.x)), Math.min(...pts.map((m) => m.y)), Math.max(...pts.map((m) => m.x)), Math.max(...pts.map((m) => m.y))];
  BW.fitBox([b[0] - .08, b[1] - .08, b[2] + .08, b[3] + .08], 800, 1600);
}

// ------------------------------------------------------------------ board
const passes = (m) => (ui.group === 'all' || GROUPS[ui.group][1].includes(m.cat)) && (!ui.verified || m.host.ver) && (!ui.women || m.women) && (!ui.soon || m.mins <= 120);
const slots = (m) => `<span class="slots">${Array.from({ length: m.crew[1] }, (_, i) => `<i class="${i < m.crew[0] ? '' : 'e'}"></i>`).join('')}</span>`;
function renderBoard() {
  if (ui.tab !== 'crew') return;
  if (ui.sel) { renderDetail(); return; }
  const vis = M.filter(passes);
  body.innerHTML = `
    <button class="btn-go cw-post" id="cwPost" type="button">+ POST A MISSION</button>
    <div class="chips cw-chips" id="cwCats">${Object.entries(GROUPS).map(([k, [n]]) => `<button class="chip" type="button" data-g="${k}" aria-pressed="${k === ui.group}">${n}</button>`).join('')}</div>
    <div class="cw-filters">
      <label class="toggle"><input type="checkbox" id="cwfVer" ${ui.verified ? 'checked' : ''}><span class="sw"></span>Verified hosts</label>
      <label class="toggle"><input type="checkbox" id="cwfWom" ${ui.women ? 'checked' : ''}><span class="sw"></span>Women-only</label>
      <label class="toggle"><input type="checkbox" id="cwfSoon" ${ui.soon ? 'checked' : ''}><span class="sw"></span>Next 2 hours</label>
    </div>
    <div class="eyebrow">${vis.length} OPEN MISSIONS NEAR YOU</div>
    <ul class="cw-list">${vis.length ? vis.map((m) => `
      <li><button class="mc${m.mine ? ' mine' : ''}" type="button" data-id="${m.id}">
        ${icon(m.cat)}<span class="t">${esc(m.title)}</span><span class="xp">+${m.xp} XP</span>
        <span class="s"><span>${esc(m.place)} · ${esc(m.when)}</span>${slots(m)}${m.mine ? '<span class="pl r">Yours</span>' : ''}${me.phase[m.id] === 'joined' ? '<span class="pl r">Joined</span>' : ''}${m.women ? '<span class="pl w">Women only</span>' : ''}${m.host.ver ? '<span class="pl v">Verified</span>' : ''}${m.night ? '<span class="pl n">18+</span>' : ''}</span>
      </button></li>`).join('') : '<li class="cw-empty">No missions match these filters. Post one and be the first.</li>'}</ul>
    <div class="cw-note">Sample missions and players. Venues are real places on the map.</div>`;
}
body.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'cwPost') { openWiz(); return; }
  if (b.dataset.g) { ui.group = b.dataset.g; renderBoard(); renderBlips(); return; }
  if (b.classList.contains('mc')) { select(b.dataset.id); return; }
  detailAction(b);
});
body.addEventListener('change', (e) => {
  const k = { cwfVer: 'verified', cwfWom: 'women', cwfSoon: 'soon' }[e.target.id];
  if (k) { ui[k] = e.target.checked; renderBoard(); renderBlips(); }
});

// ------------------------------------------------------------------ mission detail
function select(id) {
  const m = M.find((x) => x.id === id); if (!m) return;
  if (ui.tab !== 'crew') setTab('crew');
  ui.sel = id; renderDetail(); renderBlips();
  flyToFree(m.x, m.y, Math.max(BW.cam.s, 1400));
}
// centre a point in the part of the map the panels leave free
function flyToFree(x, y, s) {
  const W = BW.W, H = BW.H, side = $('#side').getBoundingClientRect();
  let cx = W / 2, cy = H / 2;
  if (W <= 760) { const top = crewEl.hidden ? H : crewEl.getBoundingClientRect().top; cy = (side.bottom + top) / 2; }
  else cx = (side.right + W - 80) / 2;
  BW.flyTo(x - (cx - W / 2) / s, y + (cy - H / 2) / s, s, 700);
}
const avatar = (c, i, cls = 'cw-av') => `<div class="${cls}" style="background:${c}">${esc(i)}</div>`;
function renderDetail() {
  const m = M.find((x) => x.id === ui.sel); if (!m) { ui.sel = null; renderBoard(); return; }
  const ph = me.phase[m.id] || 'open';
  const crewRow = (you) => `<div class="crewrow">${avatar(m.host.c, m.host.i)}${Array.from({ length: Math.max(0, m.crew[0] - 1) }, (_, i) => avatar(['#2f9ad6', '#3fa86a', '#8e44c9', '#d1793f', '#5b56c9'][i % 5], ['AL', 'JK', 'RM', 'FS', 'BT'][i % 5])).join('')}${you ? '<div class="open you">YOU</div>' : ''}${Array.from({ length: Math.max(0, m.crew[1] - m.crew[0] - (you ? 1 : 0)) }, () => '<div class="open">+</div>').join('')}</div>`;
  const ribbon = ph === 'done' ? ['MISSION COMPLETE', '#3fd17a'] : ph === 'joined' ? ['CREW LOCKED IN', 'var(--gold)'] : [m.mine ? 'YOUR MISSION' : CAT(m.cat).name.toUpperCase(), 'var(--pink)'];
  let h = `<button class="cw-back" type="button" data-a="back">‹ ALL MISSIONS</button>
    <div class="cw-head">${icon(m.cat)}<div><span class="ribbon" style="background:${ribbon[1]}">${ribbon[0]}</span><h3>${esc(m.title)}</h3></div></div>`;
  if (ph === 'open') {
    h += `<dl class="facts"><dt>Where</dt><dd>${esc(m.place)}, ${esc(m.street)}</dd><dt>When</dt><dd>${esc(m.when)}</dd><dt>Vibe</dt><dd>${m.tags.map(esc).join(' · ')}</dd></dl>
      <p class="cw-desc">${esc(m.desc)}</p>
      ${m.mine ? '' : `<div class="host">${avatar(m.host.c, m.host.i)}<div><div class="hn">${esc(m.host.n)} ${m.host.ver ? '<span class="pl v">ID verified</span>' : '<span class="pl mu">Phone only</span>'}</div>
        <div class="hs">LV ${m.host.lvl} ${esc(m.host.rank)} · <b>${m.host.rep.toFixed(1)} ★</b> · ${m.host.done} missions · shows up ${m.host.show}%</div></div></div>`}
      <div class="eyebrow">CREW ${m.crew[0]} / ${m.crew[1]}</div>${crewRow(false)}
      <div class="rewards"><div class="rw"><b>+${m.xp} XP</b><span>on check-in</span></div><div class="rw"><b>${m.bp[0]}/${m.bp[1]}</b><span>${esc(m.badge)}</span></div></div>
      <ul class="safety"><li>Public venue: ${esc(m.place)}</li>${m.women ? '<li>Women only: only verified women can join</li>' : ''}${m.night ? '<li>Night mission: ID-verified only, leave together</li>' : ''}
        <li>${m.mine ? 'You approve each request' : 'The host approves you. Your profile is shared only with this crew'}</li><li>Live sharing with a trusted contact and SOS</li></ul>
      ${m.mine ? '<div class="actions"><button class="btn-ghost" type="button" data-a="cancel">CANCEL MISSION</button><button class="btn-ghost" type="button" data-a="route">ROUTE</button></div>'
      : `<div class="actions"><button class="btn-go" type="button" data-a="accept" ${m.crew[0] >= m.crew[1] ? 'disabled' : ''}>${m.crew[0] >= m.crew[1] ? 'CREW FULL' : 'ACCEPT MISSION'}</button><button class="btn-ghost" type="button" data-a="route">ROUTE</button></div>
        <button class="cw-link" type="button" data-a="report">Report or block this host</button>`}`;
  } else if (ph === 'joined') {
    const soon = m.mins <= 60;
    h += `<div style="display:flex;align-items:flex-end;gap:12px"><div class="cw-count">${soon ? m.mins : Math.round(m.mins / 60)}<small>${soon ? 'MIN' : 'H'}</small></div><div class="hint">until you meet at<br><b style="color:var(--fg)">${esc(m.place)}</b></div></div>
      ${crewRow(true)}
      <div class="chat"><div class="msg sys">${esc(m.host.n)} approved you. Say hi.</div><div class="msg"><b>${esc(m.host.n)}</b>Welcome! I'll be at the entrance, red jacket.</div><div class="msg me"><b>You</b>Great, see you there.</div></div>
      <label class="toggle"><input type="checkbox" checked><span class="sw"></span>Share live with a trusted contact</label>
      <div class="hint">Check-in unlocks within 50 m of the venue during the mission window. Use ROUTE to get there.</div>
      <div class="actions"><button class="btn-gold" type="button" data-a="checkin">CHECK IN AT VENUE</button><button class="btn-ghost" type="button" data-a="route">ROUTE</button></div>
      <div style="display:flex;gap:16px"><button class="cw-link" type="button" data-a="leave">Leave crew</button><button class="cw-link" type="button" data-a="report">Report a problem · SOS</button></div>`;
  } else {
    h += `<div class="passed"><div class="big2">MISSION COMPLETE</div><div class="sub2">met your crew at ${esc(m.place)}</div></div>
      <div class="rewards"><div class="rw"><b>+${m.xp} XP</b><span>check-in</span></div><div class="rw"><b>+15</b><span>streak bonus</span></div></div>
      <div class="badge-up"><div class="medal"><svg viewBox="0 0 100 100">${glyph(m.cat, '#b07bff')}</svg></div><div><div class="eyebrow">BADGE PROGRESS</div><div style="font-size:17px;font-weight:700">${esc(m.badge)} ${m.bp[0]} / ${m.bp[1]}</div></div></div>
      <div class="eyebrow">RATE YOUR CREW (PRIVATE)</div>
      <div class="chips cw-chips">${['Punctual', 'Good vibes', 'Motivating', 'Great guide', 'Would team up again'].map((t) => `<button class="chip" type="button" data-a="rate" aria-pressed="false">${t}</button>`).join('')}</div>
      <div class="actions"><button class="btn-go" type="button" data-a="again">TEAM UP AGAIN</button><button class="btn-ghost" type="button" data-a="rewards">SPEND XP</button></div>`;
  }
  body.innerHTML = h; body.scrollTop = 0;
}
function detailAction(b) {
  const a = b.dataset.a; if (!a) return;
  const m = M.find((x) => x.id === ui.sel); if (!m) return;
  switch (a) {
    case 'back': ui.sel = null; renderBoard(); renderBlips(); break;
    case 'accept': me.phase[m.id] = 'joined'; save(); renderDetail(); BW.toast('CREW LOCKED IN', `${m.host.n} approved you`); break;
    case 'leave': delete me.phase[m.id]; save(); renderDetail(); BW.toast('LEFT THE CREW', 'No penalty more than 2 h before start'); break;
    case 'checkin': me.phase[m.id] = 'done'; m.bp[0] = Math.min(m.bp[0] + 1, m.bp[1]); renderDetail(); gainXP(m.xp + 15); BW.toast('MISSION COMPLETE', `+${m.xp + 15} XP`); break;
    case 'report': BW.toast('REPORT SENT', 'The team reviews within 24 h'); break;
    case 'again': BW.toast('SAME TIME NEXT WEEK', 'Recurring mission created for this crew'); break;
    case 'rewards': openRewards(); break;
    case 'rate': b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); break;
    case 'cancel': M.splice(M.indexOf(m), 1); me.posted = me.posted.filter((p) => p.id !== m.id); save(); ui.sel = null; renderBoard(); renderBlips(); BW.toast('MISSION CANCELLED', 'Your crew was notified'); break;
    case 'route': // hand the venue to the route finder as the destination, walking
      setTab('route');
      BW.setMode('walk');
      { // no GPS in the demo: start from Piazza Maggiore when there is no nearby start
        const f = BW.state.from;
        if (!f || Math.hypot(f.x - m.x, f.y - m.y) > 2.5) BW.setEnd('from', { label: 'Piazza Maggiore', x: .897, y: .578 }, { quiet: true, noFit: true });
      }
      BW.setEnd('to', { label: m.place, x: m.x, y: m.y }, { noFit: true });
      requestAnimationFrame(() => { if (BW.state.route) BW.fitBox(BW.state.route.bb, 800); }); // after the trip card has laid out
      break;
  }
}

// ------------------------------------------------------------------ map blips (DOM, positioned per drawn frame)
let blipEls = [];
function renderBlips() {
  const show = ui.tab === 'crew' ? M : M.filter((m) => m.mine || me.phase[m.id] === 'joined');
  layer.hidden = !show.length;
  layer.innerHTML = show.map((m) => `<div class="blip${m.id === ui.sel ? ' sel' : ''}${m.mine ? ' mine' : ''}${passes(m) || ui.tab !== 'crew' ? '' : ' dim'}" data-id="${m.id}">
    <span class="ring"></span><button class="b" type="button" style="background:${CAT(m.cat).color}" aria-label="${esc(m.title)}"><svg viewBox="0 0 100 100">${glyph(m.cat)}</svg></button><span class="n">${m.crew[0]}/${m.crew[1]}</span></div>`).join('');
  blipEls = [...layer.children].map((el) => [el, M.find((m) => m.id === el.dataset.id)]);
  lastKey = ''; place();
}
let lastKey = '';
function place() {
  if (layer.hidden) return;
  const c = BW.cam, key = c.x + ',' + c.y + ',' + c.s + ',' + BW.W + ',' + BW.H;
  if (key === lastKey) return; lastKey = key;
  const far = c.s < 260;
  for (const [el, m] of blipEls) {
    const [sx, sy] = BW.toScreen(m.x, m.y);
    const off = sx < -60 || sy < -60 || sx > BW.W + 60 || sy > BW.H + 60;
    el.style.display = off ? 'none' : '';
    if (!off) el.style.transform = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0)`;
    el.classList.toggle('far', far);
  }
}
BW.onFrame = place;
layer.addEventListener('click', (e) => { const el = e.target.closest('.blip'); if (el) select(el.dataset.id); });

// ------------------------------------------------------------------ post a mission
const TYPES = [
  ['gym', 'Gym buddy', 'Spotter, class, motivation'], ['food', 'Restaurant', 'Dinner or lunch together'], ['bar', 'Aperitivo / bar', 'Drinks after work'],
  ['cafe', 'Coffee & language', 'Chat, study, practise'], ['gelato', 'Gelato walk', 'Short and easy'], ['cinema', 'Movie night', 'Same film, same row'],
  ['museum', 'Culture outing', 'Museums, exhibitions'], ['pizza', 'Pizza night', 'Big table, cheap'], ['burger', 'Food crawl', 'Several stops'], ['club', 'Night out', 'ID-verified only'],
];
const W = { step: 0 };
const modal = $('#cwModal'), wb = $('#wizBody');
const STEP_T = ["What's the plan?", 'Where do you meet?', 'When and how many?', 'Who can join?'];
function openWiz() { Object.assign(W, { step: 0, cat: null, place: null, opts: [], title: '', when: 'Tonight 20:00', size: 3, vibe: [], verified: true, women: false, approve: true, age: 'Any', bill: 'Split the bill' }); modal.hidden = false; renderWiz(); }
function nearPlaces(cat) { // the closest named public places of that type to the middle of the map view
  const c = BW.cam;
  return BW.G.places.filter((p) => p.c === cat && p.n).map((p) => [p, Math.hypot(p.x - c.x, p.y - c.y)]).sort((a, b) => a[1] - b[1]).slice(0, 6).map((a) => a[0]);
}
function renderWiz() {
  $('#wizTitle').textContent = STEP_T[W.step];
  document.querySelectorAll('#wizSteps i').forEach((el, i) => el.classList.toggle('on', i <= W.step));
  $('#wizBack').textContent = W.step ? 'BACK' : 'CANCEL';
  const nx = $('#wizNext');
  nx.textContent = W.step === 3 ? 'POST MISSION' : 'NEXT';
  nx.disabled = (W.step === 0 && !W.cat) || (W.step === 1 && !W.place);
  const T = TYPES.find((t) => t[0] === W.cat);
  if (W.step === 0) wb.innerHTML = `<div class="types">${TYPES.map(([c, n, s]) => `<button class="type" type="button" data-c="${c}" aria-pressed="${W.cat === c}">${icon(c)}<b>${n}</b><span>${s}</span></button>`).join('')}</div><div class="hint">Missions can only be pinned to public places from the map.</div>`;
  else if (W.step === 1) {
    if (!W.opts.length) W.opts = nearPlaces(W.cat);
    wb.innerHTML = `<div class="hint">Closest ${esc(CAT(W.cat).name.toLowerCase())} to the middle of your map view.</div>
      <div class="places">${W.opts.map((p, i) => `<button class="place" type="button" data-i="${i}" aria-pressed="${W.place === p}">${icon(W.cat)}<span><span class="pt">${esc(p.n)}</span><br><span class="ps">${esc(p.road || 'Bologna')} · public venue</span></span>${W.place === p ? '<span class="pl v" style="margin-left:auto">Selected</span>' : ''}</button>`).join('') || '<div class="cw-empty">None nearby. Move the map and try again.</div>'}</div>
      <div class="qlabel">MISSION TITLE</div><input class="inp" id="wTitle" maxlength="60" placeholder="e.g. ${esc(T[2])}" value="${esc(W.title)}">`;
  } else if (W.step === 2) {
    const chips = (k, list, multi) => `<div class="chips cw-chips" data-k="${k}">${list.map((v) => `<button class="chip" type="button" data-v="${v}" aria-pressed="${multi ? W[k].includes(v) : W[k] === v}">${v}</button>`).join('')}</div>`;
    wb.innerHTML = `<div class="qlabel">WHEN</div>${chips('when', ['Now', 'Today 18:30', 'Tonight 20:00', 'Tomorrow 12:30', 'Every Tuesday 18:30'])}
      <div class="qlabel">CREW SIZE (INCLUDING YOU)</div><div class="stepper"><button type="button" data-d="-1" aria-label="Fewer">−</button><output id="wSize">${W.size} people</output><button type="button" data-d="1" aria-label="More">+</button></div>
      <div class="qlabel">VIBE</div>${chips('vibe', ['Beginner friendly', 'Chill', 'Competitive', 'IT / EN', 'New in town', 'Students'], true)}`;
  } else {
    const night = W.cat === 'club';
    const chips = (k, list) => `<div class="chips cw-chips" data-k="${k}">${list.map((v) => `<button class="chip" type="button" data-v="${v}" aria-pressed="${W[k] === v}">${v}</button>`).join('')}</div>`;
    wb.innerHTML = `<label class="toggle"><input type="checkbox" id="wVer" ${W.verified || night ? 'checked' : ''} ${night ? 'disabled' : ''}><span class="sw"></span>Verified players only${night ? ' (required at night)' : ''}</label>
      <label class="toggle"><input type="checkbox" id="wWom" ${W.women ? 'checked' : ''}><span class="sw"></span>Women-only mission</label>
      <label class="toggle"><input type="checkbox" id="wApp" ${W.approve ? 'checked' : ''}><span class="sw"></span>I approve each request</label>
      <div class="qlabel">AGE RANGE</div>${chips('age', ['Any', '18–25', '25–35', '35+'])}
      <div class="qlabel">PAYING</div>${chips('bill', ['Split the bill', 'Each pays own', 'Free activity'])}
      <div class="summary"><span class="eyebrow">PREVIEW</span><b style="font-size:18px">${esc(W.title || T[1])}</b><span class="hint">${esc(W.place.n)} · ${esc(W.when)} · crew of ${W.size} · +${80 + W.size * 10} XP each on check-in</span></div>`;
  }
}
wb.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.classList.contains('type')) { W.cat = b.dataset.c; W.place = null; W.opts = []; renderWiz(); }
  else if (b.classList.contains('place')) { W.title = $('#wTitle').value; W.place = W.opts[+b.dataset.i]; renderWiz(); }
  else if (b.dataset.d) { W.size = Math.max(2, Math.min(6, W.size + +b.dataset.d)); $('#wSize').textContent = W.size + ' people'; }
  else if (b.dataset.v) {
    const k = b.parentElement.dataset.k, v = b.dataset.v;
    if (k === 'vibe') { W.vibe = W.vibe.includes(v) ? W.vibe.filter((x) => x !== v) : [...W.vibe, v]; b.setAttribute('aria-pressed', String(W.vibe.includes(v))); }
    else { W[k] = v; b.parentElement.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b))); }
  }
});
wb.addEventListener('input', (e) => { if (e.target.id === 'wTitle') W.title = e.target.value; });
wb.addEventListener('change', (e) => { const k = { wVer: 'verified', wWom: 'women', wApp: 'approve' }[e.target.id]; if (k) W[k] = e.target.checked; });
$('#wizBack').addEventListener('click', () => { if (W.step) { W.step--; renderWiz(); } else modal.hidden = true; });
$('#wizX').addEventListener('click', () => { modal.hidden = true; });
modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
$('#wizNext').addEventListener('click', () => {
  if (W.step < 3) { W.step++; renderWiz(); return; }
  const T = TYPES.find((t) => t[0] === W.cat), p = W.place;
  const m = { id: 'mine' + Date.now(), mine: true, cat: W.cat, title: W.title || T[1], place: p.n, street: p.road || '', x: p.x, y: p.y, when: W.when, mins: W.when === 'Now' ? 5 : 120,
    crew: [1, W.size], xp: 80 + W.size * 10, host: { n: 'You', i: 'YOU', c: me.pin, lvl: me.lvl, rank: '', rep: 4.8, done: 12, show: 100, ver: true },
    tags: [...(W.vibe.length ? W.vibe : [T[2]]), W.bill, W.age === 'Any' ? 'All ages' : W.age], women: W.women, night: W.cat === 'club',
    desc: `Posted by you. ${W.approve ? 'You approve each request.' : 'Anyone matching your filters can join directly.'}`, badge: 'Host', bp: [0, 5] };
  M.unshift(m); me.posted.unshift(m); save();
  modal.hidden = true; ui.group = 'all';
  select(m.id);
  BW.toast('MISSION POSTED', `${7 + W.size * 3} players nearby want this too`);
});

// ------------------------------------------------------------------ rewards
const UNLOCKS = [
  [1, 'Newcomer', 'Join missions with crews of up to 3.'], [3, 'First host', 'Post your own missions.'],
  [5, 'Local', 'Host crews of up to 6. Badges show on your profile.'], [7, 'Pin colours', 'Pick your own map pin colour in the shop.'],
  [10, 'Regular', 'Weekly recurring missions. Same crew gets first dibs.'], [12, 'Bounty hunter', 'Join venue bounties with crew-only offers.'],
  [15, 'Crew Captain', 'Night missions, big tables of 12, start a named crew.'], [20, 'Event host', 'Open lobbies for festivals and city events.'],
  [25, 'Portico Legend', 'Gold pin. Your missions show first on the map.'],
];
const SHOP = {
  perks: [
    { id: 'p1', cat: 'cafe', venue: 'Caffè Terzi', name: 'Free espresso', d: 'One espresso or cappuccino at the bar.', cost: 300 },
    { id: 'p2', cat: 'gelato', venue: 'Cremeria Cavour', name: 'Free cup of gelato', d: 'Two flavours, small cup.', cost: 250 },
    { id: 'p3', cat: 'food', venue: 'Trattoria Da Me nella torre', name: '10% off for your crew', d: 'Whole table, on a mission night.', cost: 800 },
    { id: 'p4', cat: 'cinema', venue: 'Cinema Modernissimo', name: 'One cinema ticket', d: 'Any regular screening.', cost: 900 },
    { id: 'p5', cat: 'museum', venue: 'Museo internazionale della musica', name: 'Guided tour for two', d: 'Weekend tours, about an hour.', cost: 700 },
    { id: 'p6', cat: 'bar', venue: 'Enoteca Giacchero', name: 'Free tagliere for the crew', d: 'Needs 4 or more people checked in together.', cost: 1200, crew: true },
    { id: 'p7', cat: 'gym', venue: 'Performance Fitness Club', name: '1-week gym pass', d: 'Bring your gym buddy for a week.', cost: 1500 },
    { id: 'p8', cat: 'gym', venue: 'Performance Fitness Club', name: '1-month gym pass', d: 'The big one. For real regulars.', cost: 3000 },
  ],
  style: [
    { id: 's1', kind: 'pin', color: '#2f9ad6', name: 'Waypoint blue', d: 'The default pin.', cost: 0 },
    { id: 's2', kind: 'pin', color: '#ff3fa4', name: 'Neon pink pin', d: 'Your avatar and your missions on the map.', cost: 150 },
    { id: 's3', kind: 'pin', color: '#3fd17a', name: 'Mint pin', d: 'Your avatar and your missions on the map.', cost: 150 },
    { id: 's4', kind: 'pin', color: '#b07bff', name: 'Violet pin', d: 'Your avatar and your missions on the map.', cost: 200 },
    { id: 's5', kind: 'pin', color: '#ffcf3f', name: 'Legend gold pin', d: 'Only at level 25.', cost: 0, lvl: 25 },
    { id: 's6', kind: 'title', title: 'Gym Rat', name: 'Title: Gym Rat', d: 'Earned by finishing 5 gym missions. Shows instead of your rank.', badge: 'gym' },
    { id: 's7', kind: 'title', title: 'Night Owl', name: 'Title: Night Owl', d: 'Buy it, or earn it free with 5 night missions.', cost: 400 },
    { id: 's8', kind: 'title', title: 'Tortellini Hunter', name: 'Title: Tortellini Hunter', d: 'Buy it, or earn it free at 5 trattorie.', cost: 400 },
  ],
  boost: [
    { id: 'b1', name: 'Boost my mission', d: 'Your mission sits at the top of the board for 1 hour.', cost: 200, use: true },
    { id: 'b2', name: 'Priority requests', d: "Your next 3 join requests show first on the host's list. The host still decides.", cost: 150, use: true },
    { id: 'b3', name: 'Extra mission slot', d: 'Have 3 open missions at once instead of 2.', cost: 400 },
    { id: 'b4', name: 'Streak freeze', d: 'Skip one week without losing your weekly streak.', cost: 250, use: true },
  ],
};
const ALL = [...SHOP.perks, ...SHOP.style, ...SHOP.boost];
let armed = null;
const rwd = $('#rwd');
function openRewards() { rwd.hidden = false; rwd.scrollTop = 0; renderRewards(); }
$('#rwdClose').addEventListener('click', () => { rwd.hidden = true; armed = null; });
addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if (!modal.hidden) modal.hidden = true; else if (!rwd.hidden) rwd.hidden = true; });
function qr(seed) { // decorative code pattern for the voucher
  let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  let s = '';
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
    const fx = x < 3 ? x : x > 7 ? x - 8 : -1, fy = y < 3 ? y : y > 7 ? y - 8 : -1;
    h = (h * 1103515245 + 12345) >>> 0;
    const finder = fx >= 0 && fy >= 0 && !(x > 7 && y > 7);
    if (finder || h & 0x10000) s += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  }
  return `<svg class="qr" viewBox="-1 -1 13 13" fill="#0b1622" aria-hidden="true"><rect x="-1" y="-1" width="13" height="13" fill="#fff"/>${s}</svg>`;
}
function itemState(it) {
  const owned = me.owned.includes(it.id);
  if (it.lvl && me.lvl < it.lvl) return ['LEVEL ' + it.lvl, true];
  if (it.badge) { const g = M.find((x) => x.id === 'gym'); return g && g.bp[0] >= g.bp[1] ? (me.title === it.title ? ['EQUIPPED', true] : ['EQUIP', false]) : ['FINISH 5 GYM MISSIONS', true]; }
  if (it.kind === 'title' && owned) return me.title === it.title ? ['EQUIPPED', true] : ['EQUIP', false];
  if (it.kind === 'pin' && (owned || it.lvl)) return me.equipped === it.id ? ['EQUIPPED', true] : ['EQUIP', false];
  if (armed === it.id) return [`CONFIRM −${fmt(it.cost)} XP`, false, true];
  if (me.wallet < it.cost) return [`NEED ${fmt(it.cost - me.wallet)} MORE XP`, true];
  return [`${it.use ? 'USE' : 'REDEEM'} ${fmt(it.cost)} XP`, false];
}
const buyBtn = (it) => { const [l, dis, conf] = itemState(it); return `<button class="btn-gold buy${conf ? ' confirm' : ''}" type="button" data-id="${it.id}" ${dis ? 'disabled' : ''}>${l}</button>`; };
function renderRewards() {
  if (rwd.hidden) return;
  $('#wBal').innerHTML = `${fmt(me.wallet)}<small>XP</small>`;
  const cur = UNLOCKS.filter((u) => u[0] <= me.lvl).pop()[0];
  $('#track').innerHTML = UNLOCKS.map(([lv, n, d]) => `<div class="node${me.lvl >= lv ? ' on' : ''}${cur === lv ? ' cur' : ''}"><div class="lv">${lv}</div><b>${n}</b><span>${d}</span></div>`).join('');
  $('#shopPerks').innerHTML = SHOP.perks.map((it) => `<div class="item"><div class="ih">${icon(it.cat)}<div><div class="vn">${esc(it.venue)}</div><h4>${esc(it.name)}</h4></div></div><p>${esc(it.d)}</p><div class="chips">${it.crew ? '<span class="pl n">Crew perk</span>' : ''}<span class="pl mu">Sample offer</span></div>${buyBtn(it)}</div>`).join('');
  $('#shopStyle').innerHTML = SHOP.style.map((it) => `<div class="item${me.owned.includes(it.id) ? ' owned' : ''}"><div class="ih">${it.kind === 'pin' ? `<span class="swatch" style="background:${it.color}"></span>` : '<span class="medal"></span>'}<h4>${esc(it.name)}</h4></div><p>${esc(it.d)}</p>${buyBtn(it)}</div>`).join('');
  $('#shopBoost').innerHTML = SHOP.boost.map((it) => `<div class="item"><h4>${esc(it.name)}</h4><p>${esc(it.d)}</p>${buyBtn(it)}</div>`).join('');
  $('#myVouchers').hidden = !me.vouchers.length;
  $('#vouchers').innerHTML = me.vouchers.map((v) => `<div class="voucher">${qr(v.code)}<div class="vt"><b>${esc(v.name)}</b><span>${esc(v.venue)} · valid until ${esc(v.until)}</span><span class="code">${esc(v.code)}</span></div></div>`).join('');
}
rwd.addEventListener('click', (e) => {
  const b = e.target.closest('.buy'); if (!b || b.disabled) return;
  const it = ALL.find((x) => x.id === b.dataset.id);
  if (itemState(it)[0] === 'EQUIP') {
    if (it.kind === 'pin') { me.equipped = it.id; me.pin = it.color; M.filter((m) => m.mine).forEach((m) => { m.host.c = it.color; }); BW.toast('PIN EQUIPPED', it.name); }
    else { me.title = it.title; BW.toast('TITLE EQUIPPED', it.title); }
    save(); renderPlayer(); renderRewards(); return;
  }
  if (armed !== it.id) { armed = it.id; renderRewards(); return; }
  armed = null; me.wallet -= it.cost;
  if (it.kind) { me.owned.push(it.id); BW.toast('UNLOCKED', `${it.name}. Tap Equip to use it`); }
  else if (it.cat) {
    const code = 'BW-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    me.vouchers.unshift({ code, name: it.name, venue: it.venue, until: new Date(Date.now() + 7 * 864e5).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) });
    BW.toast('VOUCHER READY', `${code} · show it at ${it.venue}`);
    setTimeout(() => $('#myVouchers').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' }), 50);
  } else {
    const mine = M.find((m) => m.mine);
    if (it.id === 'b1' && mine) { M.splice(M.indexOf(mine), 1); M.unshift(mine); if (!mine.tags.includes('Boosted 1 h')) mine.tags.unshift('Boosted 1 h'); renderBoard(); }
    BW.toast(it.name.toUpperCase(), it.id === 'b1' && !mine ? 'Applies to the next mission you post' : 'Active now');
  }
  save(); renderPlayer(); renderRewards();
});

// ------------------------------------------------------------------ boot
renderPlayer(); renderBlips();
})();
