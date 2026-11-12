/* Wingetarium: liest ./data/stand.json (täglich vom Workflow geschrieben) und ./i18n/<sprache>.json.
   Speichert nur Sprache und Darstellung im Browser, sonst nichts. */
'use strict';
const SPRACHEN = ['de', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'tr', 'ru', 'hi', 'zh', 'ja', 'ko'];
const NAMEN = { de: 'Deutsch', en: 'English', es: 'Español', fr: 'Français', it: 'Italiano', nl: 'Nederlands', pl: 'Polski', pt: 'Português', tr: 'Türkçe', ru: 'Русский', hi: 'हिन्दी', zh: '中文', ja: '日本語', ko: '한국어' };
const DARST = ['system', 'light', 'dark', 'hc-dark', 'hc-light', 'cvd-dark', 'cvd-light', 'invert'];
const TABS = { o: 'ueberblick', k: 'auswahl', a: 'alle', n: 'neu', b: 'befehle', g: 'grenzen' };
const COST_ART = { free: 'free', oss: 'free', freePrivate: 'free', freeSingle: 'free', freePro: 'part', freeBase: 'part', freeBasePremium: 'part', freeTeam: 'part', appSub: 'paid', appSubOpt: 'part', jetbrains: 'part', docker: 'part', paid: 'paid', paidTrial: 'paid' };
const BEFEHLE = [
  ['gFind', [['winget search obsidian', 'c_search'], ['winget show Obsidian.Obsidian', 'c_show'], ['winget show Obsidian.Obsidian --versions', 'c_versions'], ['winget source list', 'c_sources']]],
  ['gInstall', [['winget install --id Git.Git -e', 'c_installE'], ['winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements', 'c_silent'], ['winget install --id Python.Python.3.13 -e --version 3.13.5', 'c_version'], ['winget install --id 7zip.7zip -e --scope user', 'c_user'], ['winget install --id Valve.Steam -e --location "D:\\Programme\\Steam"', 'c_location']]],
  ['gUpdate', [['winget upgrade', 'c_upgrade'], ['winget upgrade --all --include-unknown', 'c_upgradeAll'], ['winget pin add --id Valve.Steam', 'c_pinAdd'], ['winget pin list', 'c_pinList']]],
  ['gClean', [['winget list', 'c_list'], ['winget list --source winget', 'c_listSource'], ['winget uninstall --id Notion.Notion -e', 'c_uninstall']]],
  ['gMove', [['winget export -o C:\\Temp\\meine-apps.json', 'c_export'], ['winget import -i C:\\Temp\\meine-apps.json --accept-package-agreements', 'c_import'], ['winget settings', 'c_settings']]]
];
/* Bekannte Namen, die früher fehlten: erscheinen unter „Lücken“, solange sie fehlen. */
const LUECKEN = [['signal', 'Signal Desktop'], ['musicbee', 'MusicBee']];

const $ = id => document.getElementById(id);
const S = { lang: 'de', T: null, stand: null, auswahl: [], cat: null, sortK: 'cat', sortDir: 1, q: '', index: null, qa: '', tab: 'o' };
const T = () => S.T || {};

function laden(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function speichern(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function fmt(s, w) { return String(s || '').replace(/\{(\w+)\}/g, (m, k) => (k in w ? w[k] : m)); }
function zahl(n) { return Number(n).toLocaleString(S.lang); }
function datum(iso, mitZeit) {
  const d = new Date(iso.length <= 10 ? iso + 'T12:00:00Z' : iso);
  const o = mitZeit ? { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' } : { dateStyle: 'medium', timeZone: 'UTC' };
  try { return new Intl.DateTimeFormat(S.lang, o).format(d) + (mitZeit ? ' UTC' : ''); } catch (e) { return iso; }
}
let toastT = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2200); }
async function kopiere(text) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta); ta.select(); try { ok = document.execCommand('copy'); } catch (x) {} ta.remove();
  }
  toast(fmt(ok ? T().copied : T().copyFail, { c: text }));
}
const installBefehl = id => 'winget install --id ' + id + ' -e';

/* ---------- Darstellung ---------- */
function setzeDarstellung(v, merken) {
  const d = document.documentElement; let ts = null, vs = null;
  if (v === 'light' || v === 'dark') ts = v;
  else if (v === 'hc-dark' || v === 'hc-light') { ts = v.slice(3); vs = 'contrast'; }
  else if (v === 'cvd-dark' || v === 'cvd-light') { ts = v.slice(4); vs = 'cvd'; }
  else if (v === 'invert') vs = 'invert';
  else if (matchMedia('(prefers-contrast: more)').matches) { ts = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; vs = 'contrast'; }
  if (ts) d.setAttribute('data-theme', ts); else d.removeAttribute('data-theme');
  if (vs) d.setAttribute('data-vision', vs); else d.removeAttribute('data-vision');
  if (merken) speichern('werkstatt.darstellung', v);
  const hell = ts === 'light' || (!ts && v !== 'invert' && matchMedia('(prefers-color-scheme: light)').matches);
  document.querySelector('meta[name="theme-color"]').content = hell ? '#F7F8FA' : '#0E1116';
}

/* ---------- Sprache ---------- */
async function holeJson(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}
async function setzeSprache(l, merken) {
  if (!SPRACHEN.includes(l)) l = 'en';
  try { S.T = await holeJson('./i18n/' + l + '.json'); S.lang = l; }
  catch (e) { if (l !== 'de') return setzeSprache('de', false); throw e; }
  if (merken) speichern('wingetarium.lang', l);
  document.documentElement.lang = l;
  $('sprache').value = l;
  document.title = T().docTitle;
  document.querySelector('meta[name="description"]').content = T().metaDesc;
  document.querySelectorAll('[data-i]').forEach(e => { const v = T()[e.dataset.i]; if (typeof v === 'string') e.textContent = v; });
  document.querySelectorAll('[data-h]').forEach(e => { const v = T()[e.dataset.h]; if (typeof v === 'string') e.innerHTML = v; });
  document.querySelectorAll('[data-i-aria]').forEach(e => e.setAttribute('aria-label', T()[e.dataset.iAria] || ''));
  const ds = $('darstellung'), alt = ds.value || laden('werkstatt.darstellung') || 'system';
  ds.textContent = '';
  DARST.forEach((v, k) => { const o = document.createElement('option'); o.value = v; o.textContent = T().themeOpts[k]; ds.append(o); });
  ds.value = DARST.includes(alt) ? alt : 'system';
  $('q').placeholder = T().searchCatalog; $('q').setAttribute('aria-label', T().searchCatalogLabel);
  $('qa').setAttribute('aria-label', T().searchAllLabel);
  zeichneAlles();
}

/* ---------- Inhalte ---------- */
function zeichneAlles() {
  const st = S.stand; if (!st || !S.T) return;
  const t = T();
  $('eb-stand').textContent = fmt(t.eyebrowStand, { d: datum(st.stand, true) });
  $('eb-pkgs').textContent = fmt(t.eyebrowPkgs, { n: zahl(st.pakete) });
  $('dek').innerHTML = fmt(t.dek, { n: S.auswahl.length - st.fehlt.length, all: zahl(st.pakete) });
  $('figs').innerHTML = [['pakete', 'figPkgs'], ['manifeste', 'figManifests'], ['versionen', 'figVersions'], ['kurznamen', 'figMonikers']]
    .map(([k, l]) => '<div class="fig"><div class="n">' + zahl(st[k]) + '</div><div class="l">' + esc(t[l]) + '</div><div class="s">' + t[l + 'Sub'] + '</div></div>').join('');
  $('src-winget').textContent = fmt(t.srcWinget, { n: zahl(st.pakete) });
  $('tags-intro').textContent = fmt(t.tagsIntro, { n: zahl(st.pakete) });
  const max = st.tags[0][1];
  $('bars').innerHTML = st.tags.map(([tag, n]) => '<div class="bar-row"><div class="bar-lbl">' + esc(tag) + '</div><div class="bar-track"><div class="bar-fill" style="width:' + (n / max * 100).toFixed(1) + '%"></div></div><div class="bar-val">' + zahl(n) + '</div></div>').join('');
  $('tags-note').innerHTML = fmt(t.tagsNote, { pub: st.herausgeber.slice(0, 2).map(([p, n]) => esc(p) + ' (' + zahl(n) + ')').join(', ') });
  $('grow').innerHTML = fmt(t.grow, { n: zahl(st.pakete) });
  zeichneKurve();
  zeichneChips(); zeichneTabelle();
  $('fehlt').hidden = !st.fehlt.length;
  $('fehlt').textContent = st.fehlt.length ? fmt(t.missing, { list: st.fehlt.join(', ') }) : '';
  $('qa').placeholder = fmt(t.searchAll, { n: zahl(st.pakete) });
  zeichneAlle();
  zeichneNeu(); zeichneBefehle(); zeichneGrenzen();
  $('how').innerHTML = fmt(t.how, { d: datum(st.stand, true) });
}

function zeichneKurve() {
  const v = S.stand.verlauf; if (!v.length) { $('kurve').textContent = ''; return; }
  const W = 640, H = 180, L = 52, R = 10, O = 10, U = 26;
  const t0 = Date.parse(v[0][0]), t1 = Date.parse(v[v.length - 1][0]) || t0 + 1;
  const ys = v.map(z => z[1]), lo = Math.floor(Math.min(...ys) * 0.97 / 500) * 500, hi = Math.ceil(Math.max(...ys) * 1.01 / 500) * 500;
  const x = d => L + (t1 === t0 ? (W - L - R) : (Date.parse(d) - t0) / (t1 - t0) * (W - L - R));
  const y = n => O + (1 - (n - lo) / (hi - lo || 1)) * (H - O - U);
  const pts = v.map(z => [x(z[0]), y(z[1])]);
  const pfad = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const flaeche = pfad + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + (H - U) + ' L' + pts[0][0].toFixed(1) + ' ' + (H - U) + ' Z';
  const letzte = v.length > 40 ? [] : pts.map(p => '<circle class="punkt" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3"/>').join('');
  $('kurve').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(T().growChart + ': ' + v.map(z => datum(z[0]) + ' ' + zahl(z[1])).slice(-6).join(', ')) + '">' +
    '<line class="achse" x1="' + L + '" y1="' + (H - U) + '" x2="' + (W - R) + '" y2="' + (H - U) + '"/>' +
    '<text x="' + (L - 6) + '" y="' + (y(hi) + 4) + '" text-anchor="end">' + zahl(hi) + '</text>' +
    '<text x="' + (L - 6) + '" y="' + (y(lo) + 4) + '" text-anchor="end">' + zahl(lo) + '</text>' +
    '<path class="flaeche" d="' + flaeche + '"/><path class="linie" d="' + pfad + '"/>' + letzte +
    '<text x="' + L + '" y="' + (H - 6) + '">' + esc(datum(v[0][0])) + '</text>' +
    '<text x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end">' + esc(datum(v[v.length - 1][0])) + '</text></svg>';
}

/* Auswahl-Tabelle */
function zeile(e) {
  const t = T(), a = S.stand.auswahl[e.id] || {};
  return { id: e.id, name: a.n || e.id, v: a.v || '?', cat: t.cats[e.cat], catK: e.cat, cost: t.costs[e.cost], costK: e.cost, why: (t.why || {})[e.id] || '' };
}
function gefiltert() {
  const q = S.q.trim().toLowerCase();
  let r = S.auswahl.filter(e => S.stand.auswahl[e.id]).map(zeile);
  if (S.cat) r = r.filter(z => z.catK === S.cat);
  if (q) r = r.filter(z => (z.id + ' ' + z.name + ' ' + z.cat + ' ' + z.why).toLowerCase().includes(q));
  const k = S.sortK, ord = Object.keys(T().cats);
  r.sort((a, b) => {
    let c;
    if (k === 'cat') c = ord.indexOf(a.catK) - ord.indexOf(b.catK) || a.name.localeCompare(b.name, S.lang);
    else c = String(a[k]).localeCompare(String(b[k]), S.lang, { numeric: true, sensitivity: 'base' });
    return c * S.sortDir;
  });
  return r;
}
function zeichneChips() {
  const t = T(), da = S.auswahl.filter(e => S.stand.auswahl[e.id]);
  const btn = (c, label, n) => '<button class="chip" type="button" data-c="' + c + '" aria-pressed="' + ((S.cat || '') === c) + '">' + esc(label) + '<span class="c">' + n + '</span></button>';
  $('chips').innerHTML = btn('', t.chipAll, da.length) + Object.keys(t.cats).map(c => btn(c, t.cats[c], da.filter(e => e.cat === c).length)).join('');
}
function zeichneTabelle() {
  const r = gefiltert(), t = T();
  $('rows').innerHTML = r.map(z => '<tr><td><button class="c-id" type="button" data-id="' + esc(z.id) + '">' + esc(z.id) + '</button></td>' +
    '<td class="c-name">' + esc(z.name) + '</td><td class="c-cat">' + esc(z.cat) + '</td><td class="c-ver">' + esc(z.v) + '</td>' +
    '<td><span class="tag t-' + COST_ART[z.costK] + '">' + esc(z.cost) + '</span></td><td class="c-why">' + esc(z.why) + '</td></tr>').join('');
  $('empty').hidden = r.length > 0;
  $('count').textContent = fmt(t.countOf, { n: r.length, m: S.auswahl.length - S.stand.fehlt.length });
  document.querySelectorAll('table.auswahl th').forEach(th => {
    const an = th.dataset.k === S.sortK;
    th.innerHTML = esc(t[{ id: 'colId', name: 'colName', cat: 'colCat', v: 'colVersion', cost: 'colCost', why: 'colWhy' }[th.dataset.k]]) + (an ? '<span class="arrow" aria-hidden="true">' + (S.sortDir > 0 ? '▲' : '▼') + '</span>' : '');
    th.setAttribute('aria-sort', an ? (S.sortDir > 0 ? 'ascending' : 'descending') : 'none');
  });
}

/* Alle Pakete: Index erst laden, wenn der Reiter offen ist */
async function holeIndex() {
  if (S.index) return S.index;
  $('empty-a').textContent = T().searchAllLoading;
  try {
    const j = await holeJson('./data/index.json');
    S.index = j.p.map(z => ({ z, s: (z[0] + ' ' + z[1] + ' ' + (z[3] || '')).toLowerCase() }));
  } catch (e) { $('empty-a').textContent = T().loadError; return null; }
  zeichneAlle();
  return S.index;
}
function zeichneAlle() {
  const t = T(), q = S.qa.trim().toLowerCase(), MAX = 200;
  if (!S.index) { $('count-a').textContent = ''; return; }
  if (q.length < 2) { $('rows-a').innerHTML = ''; $('count-a').textContent = ''; $('empty-a').textContent = t.searchAllHint; return; }
  const teile = q.split(/\s+/);
  const r = S.index.filter(e => teile.every(w => e.s.includes(w)));
  r.sort((a, b) => (b.z[0].toLowerCase() === q) - (a.z[0].toLowerCase() === q) || (b.z[3] === q) - (a.z[3] === q) || a.z[0].localeCompare(b.z[0]));
  $('rows-a').innerHTML = r.slice(0, MAX).map(({ z }) => '<tr><td><button class="c-id" type="button" data-id="' + esc(z[0]) + '">' + esc(z[0]) + '</button></td><td class="c-name">' + esc(z[1]) + '</td><td class="c-ver">' + esc(z[2]) + '</td><td class="c-ver">' + esc(z[3] || '') + '</td></tr>').join('');
  $('count-a').textContent = fmt(t.countOf, { n: zahl(r.length), m: zahl(S.index.length) });
  $('empty-a').textContent = !r.length ? t.empty : (r.length > MAX ? fmt(t.searchAllMore, { n: MAX, m: zahl(r.length) }) : '');
}

function zeichneNeu() {
  const t = T(), neu = S.stand.neu || [];
  $('new-intro').textContent = fmt(t.newIntro, { n: 30 });
  $('neu').innerHTML = !neu.length ? '<p class="klein last">' + esc(t.newEmpty) + '</p>' : neu.map(tag =>
    '<div class="neu-tag"><h3>' + esc(fmt(t.newDay, { d: datum(tag.d), n: zahl(tag.p.length) })) + '</h3><ul class="neu-liste">' +
    tag.p.map(([id, n, v]) => '<li><button class="c-id" type="button" data-id="' + esc(id) + '">' + esc(id) + '</button><span class="n">' + esc(n) + ' · ' + esc(v) + '</span></li>').join('') +
    '</ul></div>').join('');
}

function zeichneBefehle() {
  const t = T();
  $('cmds').innerHTML = BEFEHLE.map(([g, l]) => '<div class="cmd-group"><h3>' + esc(t[g]) + '</h3>' +
    l.map(([c, k]) => '<div class="cmd"><button class="cmd-code" type="button" data-c="' + esc(c) + '">' + esc(c) + '</button><span class="cmd-desc">' + t[k] + '</span></div>').join('') + '</div>').join('');
}

function zeichneGrenzen() {
  const t = T(), g = S.stand.grenzen;
  const fehlend = LUECKEN.filter(([k]) => !g[k]).map(([, n]) => n);
  const v = [
    g.anzeigetreiber.length ? ['part', 'lGpuT', fmt(t.lGpuFound, { list: g.anzeigetreiber.map(i => '<code>' + esc(i) + '</code>').join(', ') })] : ['no', 'lGpuT', t.lGpu],
    ['part', 'lDriverT', fmt(t.lDriver, { n: zahl(g.treiber) })],
    ['no', 'lGamesT', t.lGames],
    ['no', 'lFontsT', fmt(t.lFonts, { n: zahl(g.schriften) })],
    ['no', 'lAutoT', t.lAuto],
    ['no', 'lSourceT', t.lSource],
    ['no', 'lFormatsT', t.lFormats],
    fehlend.length ? ['part', 'lGapsT', fmt(t.lGaps, { list: fehlend.join(', ') })] : null,
    ['yes', 'lGoodT', t.lGood]
  ].filter(Boolean);
  const mark = { no: '✕', part: '~', yes: '✓' };
  $('verdicts').innerHTML = v.map(([k, tt, d]) => '<div class="v v-' + k + '"><div class="v-mark" aria-hidden="true">' + mark[k] + '</div><div><div class="v-t">' + esc(t[tt]) + '</div><div class="v-d">' + d + '</div></div></div>').join('');
}

/* ---------- Reiter ---------- */
function zeigeTab(k, fokus) {
  if (!TABS[k]) k = 'o';
  S.tab = k;
  Object.keys(TABS).forEach(x => {
    const an = x === k;
    $('tab-' + x).setAttribute('aria-selected', String(an));
    $('tab-' + x).tabIndex = an ? 0 : -1;
    $('p-' + x).hidden = !an;
  });
  if (fokus) $('tab-' + k).focus();
  const h = '#' + TABS[k];
  if (location.hash !== h) history.replaceState(null, '', k === 'o' ? location.pathname + location.search : h);
  if (k === 'a') holeIndex();
}
function tabAusHash() {
  const h = location.hash.slice(1);
  return Object.keys(TABS).find(k => TABS[k] === h) || 'o';
}

/* ---------- Installieren ---------- */
function alsApp() { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
function zeigeInstall() { $('installieren').hidden = !(window.zuInstall && !alsApp()); }
window.zuInstallZeigen = zeigeInstall;
$('installieren').addEventListener('click', async () => {
  const e = window.zuInstall; window.zuInstall = null; zeigeInstall();
  if (!e) return;
  try { e.prompt(); await e.userChoice; } catch (x) {}
});
window.addEventListener('appinstalled', () => { window.zuInstall = null; zeigeInstall(); toast(T().installDone); });

/* ---------- Verdrahten ---------- */
document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('.tab'); if (b) zeigeTab(b.id.slice(4)); });
document.querySelector('.tabs').addEventListener('keydown', e => {
  const ks = Object.keys(TABS), i = ks.indexOf(S.tab);
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); zeigeTab(ks[(i + (e.key === 'ArrowRight' ? 1 : ks.length - 1)) % ks.length], true); }
  else if (e.key === 'Home') { e.preventDefault(); zeigeTab(ks[0], true); }
  else if (e.key === 'End') { e.preventDefault(); zeigeTab(ks[ks.length - 1], true); }
});
window.addEventListener('hashchange', () => zeigeTab(tabAusHash()));
document.addEventListener('click', e => {
  const id = e.target.closest('.c-id'); if (id) return kopiere(installBefehl(id.dataset.id));
  const c = e.target.closest('.cmd-code'); if (c) return kopiere(c.dataset.c);
  const ch = e.target.closest('.chip'); if (ch) { S.cat = ch.dataset.c || null; zeichneChips(); zeichneTabelle(); }
});
function sortiere(th) { const k = th.dataset.k; if (S.sortK === k) S.sortDir *= -1; else { S.sortK = k; S.sortDir = 1; } zeichneTabelle(); }
document.querySelector('table.auswahl thead').addEventListener('click', e => { const th = e.target.closest('th'); if (th) sortiere(th); });
document.querySelector('table.auswahl thead').addEventListener('keydown', e => { const th = e.target.closest('th'); if (th && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); sortiere(th); } });
$('q').addEventListener('input', e => { S.q = e.target.value; zeichneTabelle(); });
let qaT = 0;
$('qa').addEventListener('input', e => { S.qa = e.target.value; clearTimeout(qaT); qaT = setTimeout(zeichneAlle, 120); });
$('sprache').addEventListener('change', e => setzeSprache(e.target.value, true));
$('darstellung').addEventListener('change', e => setzeDarstellung(e.target.value, true));
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => setzeDarstellung($('darstellung').value, false));
matchMedia('(prefers-contrast: more)').addEventListener('change', () => setzeDarstellung($('darstellung').value, false));
window.addEventListener('storage', e => { if (e.key === 'werkstatt.darstellung' && e.newValue) { $('darstellung').value = e.newValue; setzeDarstellung(e.newValue, false); } });

/* ---------- Start ---------- */
(async function start() {
  SPRACHEN.forEach(l => { const o = document.createElement('option'); o.value = l; o.textContent = NAMEN[l]; $('sprache').append(o); });
  setzeDarstellung(laden('werkstatt.darstellung') || 'system', false);
  let l = laden('wingetarium.lang') || laden('dennismit2n-home.lang');
  if (!SPRACHEN.includes(l)) { const c = (navigator.languages || [navigator.language || 'en']).map(x => String(x).toLowerCase().split('-')[0]); l = c.find(x => SPRACHEN.includes(x)) || 'en'; }
  zeigeTab(tabAusHash());
  zeigeInstall();
  try {
    const [stand, auswahl] = await Promise.all([holeJson('./data/stand.json'), holeJson('./data/auswahl.json')]);
    S.stand = stand; S.auswahl = auswahl;
  } catch (e) {
    await setzeSprache(l, false).catch(() => {});
    const h = $('hinweis'); h.hidden = false; h.textContent = T().loadError || 'Daten fehlen.'; return;
  }
  await setzeSprache(l, false);
  // Älter als zwei Tage heißt: der Worker hat die letzte Fassung aus dem Speicher geliefert.
  if (Date.now() - Date.parse(S.stand.abgerufen) > 2 * 864e5) { const h = $('hinweis'); h.hidden = false; h.textContent = fmt(T().offline, { d: datum(S.stand.stand, true) }); }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
