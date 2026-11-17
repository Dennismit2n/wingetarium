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
/* Stöbern: Themen sind Bündel von Schlagworten aus den Manifesten (die sind fast immer Englisch). */
const THEMEN = {
  browser: ['browser', 'web-browser', 'webbrowser', 'chromium'],
  ai: ['ai', 'llm', 'large-language-model', 'chatbot', 'chatgpt', 'artificial-intelligence', 'ollama', 'mcp'],
  dev: ['programming', 'developer-tools', 'ide', 'coding', 'development', 'git', 'compiler', 'debug'],
  editor: ['editor', 'text-editor', 'markdown', 'notes', 'writing', 'mindmap', 'mind-map'],
  terminal: ['terminal', 'cli', 'command-line', 'shell', 'powershell', 'tui', 'console'],
  office: ['office', 'pdf', 'document', 'ebook', 'presentation', 'excel', 'calendar', 'todo', 'ocr'],
  image: ['image', 'photo', 'picture', 'graphics', 'drawing', 'design', '3d', 'cad', 'screenshot'],
  video: ['video', 'player', 'streaming', 'screen-capture', 'recording', 'ffmpeg', 'youtube', 'codec'],
  audio: ['audio', 'music', 'music-player', 'sound', 'radio', 'podcast', 'speech-to-text', 'dictation'],
  chat: ['chat', 'email', 'mail', 'meeting', 'video-conferencing', 'discord', 'collaboration', 'outlook'],
  security: ['security', 'privacy', 'password', 'encryption', 'vpn', 'protection', 'antivirus'],
  files: ['file-manager', 'backup', 'sync', 'archive', 'compression', 'cloud-drive', 'recovery', 'disk', 'files'],
  network: ['network', 'ssh', 'sftp', 'ftp', 'remote-desktop', 'remote-access', 'proxy', 'downloader', 'file-transfer'],
  system: ['utility', 'system', 'monitoring', 'hardware', 'cleaner', 'benchmark', 'keyboard', 'mouse', 'clipboard', 'hotkey', 'launcher'],
  games: ['game', 'games', 'gaming', 'emulator', 'minecraft', 'videogame'],
  data: ['database', 'sql', 'mysql', 'postgresql', 'sqlite', 'docker', 'kubernetes', 'devops', 'server']
};
/* Schlagworte, die fast jedes Paket trägt oder die nur Firefox-Sprachpakete markieren: nicht in die Wolke. */
const WOLKE_OHNE = new Set(['windows', 'cross-platform', 'gecko', 'quantum', 'spidermonkey', 'mozilla', 'foss', 'open-source', 'tool', 'tools', 'app', 'desktop', 'requirescmd', 'hacktoberfest', 'prc', 'china', 'trial']);

const $ = id => document.getElementById(id);
const S = { lang: 'de', T: null, stand: null, auswahl: [], cat: null, sortK: 'cat', sortDir: 1, q: '', index: null, qa: '', fa: null, tab: 'o', texte: {}, sb: null };
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
    (document.querySelector('dialog[open]') || document.body).append(ta); ta.select(); // ein offener Dialog sperrt alles außerhalb try { ok = document.execCommand('copy'); } catch (x) {} ta.remove();
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
  ueVorbereiten().then(() => { if (UE.an) zeichneAlle(); });
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

/* Alle Pakete: Index erst laden, wenn er gebraucht wird (Reiter offen oder Steckbrief).
   Zeile in index.json: [id, name, version, kurzname, kurzbeschreibung, "schlagwort schlagwort …"] */
let indexLaden = null;
function holeIndex() {
  if (S.index) return Promise.resolve(S.index);
  if (indexLaden) return indexLaden;
  $('empty-a').textContent = T().searchAllLoading;
  indexLaden = holeJson('./data/index.json').then(j => {
    const kuratiert = new Set(S.auswahl.map(e => e.id));
    S.index = j.p.map(z => ({
      z, tags: z[5] ? z[5].split(' ') : [], top: kuratiert.has(z[0]),
      n: (z[0] + ' ' + z[1] + ' ' + (z[3] || '')).toLowerCase(),
      s: (z[0] + ' ' + z[1] + ' ' + (z[3] || '') + ' ' + (z[4] || '') + ' ' + (z[5] || '')).toLowerCase()
    }));
    S.indexId = new Map(S.index.map(e => [e.z[0], e]));
    const zaehl = new Map();
    S.index.forEach(e => e.tags.forEach(t => zaehl.set(t, (zaehl.get(t) || 0) + 1)));
    S.wolke = [...zaehl].filter(([t]) => /^[a-z0-9][a-z0-9.+#-]*$/.test(t) && !WOLKE_OHNE.has(t)).sort((a, b) => b[1] - a[1]).slice(0, 48);
    S.themenZahl = {};
    Object.keys(THEMEN).forEach(k => { const m = new Set(THEMEN[k]); S.themenZahl[k] = S.index.filter(e => e.tags.some(t => m.has(t))).length; });
    zeichneAlle();
    return S.index;
  }).catch(() => { indexLaden = null; $('empty-a').textContent = T().loadError; return null; });
  return indexLaden;
}
function filterName(f) { return f.typ === 'thema' ? (T().themes || {})[f.key] || f.key : f.key; }
function zeichneAlle() {
  const t = T(), q = S.qa.trim().toLowerCase(), MAX = 200;
  if (!S.index) { $('count-a').textContent = ''; $('stoebern').hidden = true; return; }
  const f = S.fa;
  $('filter-a').hidden = !f;
  $('filter-a').innerHTML = f ? '<button class="chip" type="button" id="filter-weg" aria-pressed="true" aria-label="' + esc(t.filterClear) + '">' + esc(fmt(t.filterLabel, { f: filterName(f) })) + '<span class="c" aria-hidden="true">✕</span></button>' : '';
  const stoebern = !f && q.length < 2;
  $('stoebern').hidden = !stoebern;
  if (stoebern) {
    $('themen').innerHTML = Object.keys(THEMEN).map(k => '<button class="thema" type="button" data-thema="' + k + '"><span>' + esc((t.themes || {})[k] || k) + '</span><span class="c">' + zahl(S.themenZahl[k]) + '</span></button>').join('');
    $('wolke').innerHTML = S.wolke.map(([w, n]) => '<button class="chip" type="button" data-tag="' + esc(w) + '">' + esc(w) + '<span class="c">' + zahl(n) + '</span></button>').join('');
    $('rows-a').innerHTML = ''; $('count-a').textContent = ''; $('empty-a').textContent = q.length === 1 ? t.searchAllHint : '';
    return;
  }
  const teile = q.length >= 2 ? q.split(/\s+/) : [];
  // Mit Übersetzer zählt auch die englische Fassung der Suche: „passwort“ findet dann „password“.
  const en = UE.an && UE.suche[q] ? UE.suche[q].split(/\s+/).filter(Boolean) : [];
  const passt = (e, ws) => ws.length > 0 && ws.every(w => e.s.includes(w));
  const fset = f ? new Set(f.typ === 'thema' ? THEMEN[f.key] : [f.key]) : null;
  const r = S.index.filter(e => (!fset || e.tags.some(x => fset.has(x))) && (!teile.length || passt(e, teile) || passt(e, en)));
  // Rang: genauer Name oder Kurzname, dann Treffer im Namen, dann in Schlagworten, dann nur in der Beschreibung. Auswahl zuerst.
  const rang = e => !q ? 0 : (e.z[1].toLowerCase() === q || e.z[3] === q || e.z[0].toLowerCase() === q) ? 0 : teile.every(w => e.n.includes(w)) ? 1 : teile.every(w => e.tags.some(x => x.includes(w)) || e.n.includes(w)) ? 2 : 3;
  r.forEach(e => { e.r = rang(e); });
  r.sort((a, b) => a.r - b.r || b.top - a.top || a.z[1].localeCompare(b.z[1], S.lang, { sensitivity: 'base' }));
  $('rows-a').innerHTML = r.slice(0, MAX).map(({ z }) => '<li><button class="paket" type="button" data-id="' + esc(z[0]) + '"><span class="p-kopf"><span class="p-name">' + esc(z[1]) + '</span><span class="p-ver">' + esc(z[2]) + '</span></span><span class="p-id">' + esc(z[0]) + '</span>' + (z[4] ? '<span class="p-kurz">' + esc(z[4]) + '</span>' : '') + '</button></li>').join('');
  $('count-a').textContent = fmt(t.countOf, { n: zahl(r.length), m: zahl(S.index.length) });
  $('empty-a').textContent = !r.length ? t.empty : (r.length > MAX ? fmt(t.searchAllMore, { n: MAX, m: zahl(r.length) }) : '');
  ueKarten();
}

/* Übersetzen direkt im Browser (Translator-API von Chrome und Edge am PC, läuft auf dem Gerät).
   Vorerst nur für Deutsch. Andere Browser und Sprachen sehen den Originaltext wie bisher. */
const UE = { an: false, hin: null, her: null, cache: new Map(), suche: {}, lauf: 0, status: '' };
const NICHT_EN = /[Ѐ-ӿऀ-ॿ぀-ヿ㐀-鿿가-힯]/;
function ueMoeglich() { return S.lang === 'de' && typeof self.Translator !== 'undefined'; }
async function ueVorbereiten() {
  const b = $('ue');
  if (!ueMoeglich()) { UE.an = false; b.hidden = true; return; }
  // Manche Chromium-Ableger kennen die Schnittstelle, antworten aber nie: nach 5 s gilt sie als nicht da.
  try { UE.status = await Promise.race([Translator.availability({ sourceLanguage: 'en', targetLanguage: 'de' }), new Promise(r => setTimeout(() => r('unavailable'), 5000))]); } catch (e) { UE.status = 'unavailable'; }
  if (UE.status === 'unavailable') { b.hidden = true; return; }
  // Schon geladen und früher eingeschaltet: ohne Klick wieder an.
  if (UE.status === 'available' && laden('wingetarium.uebersetzen') === '1' && !UE.an) await ueStarten();
  ueKnopf();
}
function ueKnopf() {
  const b = $('ue'), t = T();
  b.hidden = !ueMoeglich() || UE.status === 'unavailable';
  b.textContent = UE.an ? t.ueAus : t.ueAn;
  b.setAttribute('aria-pressed', String(UE.an));
}
async function ueStarten() {
  const t = T(), b = $('ue');
  try {
    const monitor = m => m.addEventListener('downloadprogress', e => { b.textContent = fmt(t.ueLaedt, { p: Math.round(e.loaded * 100) }); });
    // Beide Richtungen im selben Klick anlegen, das Laden des Sprachpakets braucht eine Nutzeraktion.
    [UE.hin, UE.her] = await Promise.all([
      UE.hin || Translator.create({ sourceLanguage: 'en', targetLanguage: 'de', monitor }),
      UE.her || Translator.create({ sourceLanguage: 'de', targetLanguage: 'en' })
    ]);
    UE.an = true; UE.status = 'available';
    speichern('wingetarium.uebersetzen', '1');
  } catch (e) { UE.an = false; toast(t.ueFehler); }
  ueKnopf();
}
async function aufDeutsch(text) {
  if (!UE.an || !text || NICHT_EN.test(text)) return null;
  if (UE.cache.has(text)) return UE.cache.get(text);
  try { const d = await UE.hin.translate(text); UE.cache.set(text, d); return d; } catch (e) { return null; }
}
async function ueKarten() {
  if (!UE.an) return;
  const lauf = ++UE.lauf;
  for (const el of document.querySelectorAll('#rows-a .p-kurz')) {
    const d = await aufDeutsch(el.textContent);
    if (lauf !== UE.lauf || !UE.an) return;
    if (d) { el.title = el.textContent; el.textContent = d; }
  }
}
async function ueSuche(q) {
  if (!UE.an || q.length < 2 || q in UE.suche) return;
  try { UE.suche[q] = (await UE.her.translate(q)).toLowerCase().replace(/[^\p{L}\p{N}\s.+#-]/gu, ' '); } catch (e) { UE.suche[q] = ''; }
  if (S.qa.trim().toLowerCase() === q) zeichneAlle();
}
async function ueSteckbrief(id) {
  if (!UE.an || S.sb !== id) return;
  let geaendert = false;
  for (const el of [$('sb-kurz'), $('sb-lang')]) {
    const orig = el.textContent;
    if (el.hidden || !orig || orig === T().detailLoading) continue;
    // Absatzweise, damit die Absätze erhalten bleiben.
    const teile = await Promise.all(orig.split('\n').map(z => z.trim() ? aufDeutsch(z) : z));
    if (S.sb !== id) return;
    if (teile.some(Boolean)) { el.textContent = teile.map((d, i) => d || orig.split('\n')[i]).join('\n'); el.title = orig; geaendert = true; }
  }
  $('sb-ue').hidden = !geaendert;
}

function setzeFilter(f) {
  S.fa = f; S.qa = ''; $('qa').value = '';
  if (S.tab !== 'a') zeigeTab('a');
  zeichneAlle();
  $('qa').scrollIntoView({ block: 'nearest' });
}

/* Steckbrief: was ein Paket ist und kann. Lange Texte liegen in data/text/<erstes Zeichen>.json:
   { id: [hash, kurz, herausgeber, lizenz, webseite, beschreibung] } */
function teil(id) { const c = id.charAt(0).toLowerCase(); return /[a-z0-9]/.test(c) ? c : '_'; }
function holeTexte(id) {
  const k = teil(id);
  if (!S.texte[k]) S.texte[k] = holeJson('./data/text/' + k + '.json').catch(() => { delete S.texte[k]; return {}; });
  return S.texte[k].then(d => d[id] || null);
}
function manifestUrl(id, v) {
  return 'https://github.com/microsoft/winget-pkgs/tree/master/manifests/' + id.charAt(0).toLowerCase() + '/' + id.split('.').map(encodeURIComponent).join('/') + (v ? '/' + encodeURIComponent(v) : '');
}
async function zeigeSteckbrief(id) {
  const t = T(), dlg = $('steckbrief');
  S.sb = id;
  const a = S.stand.auswahl[id], kur = S.auswahl.find(e => e.id === id);
  const fuellen = (e, x) => {
    if (S.sb !== id) return;
    const z = e ? e.z : [id, (a && a.n) || id, (a && a.v) || '', '', '', ''];
    const name = z[1], v = z[2], kurz = (x && x[1]) || z[4];
    $('sb-name').textContent = name;
    $('sb-id').textContent = id;
    $('sb-kurz').textContent = kurz || '';
    $('sb-kurz').hidden = !kurz;
    const meta = [[t.colVersion, v], [t.detailPublisher, x && x[2]], [t.detailLicense, x && x[3]], [t.colMoniker, z[3]]];
    if (kur) meta.push([t.colCost, t.costs[kur.cost]], [t.colCat, t.cats[kur.cat]]);
    $('sb-meta').innerHTML = meta.filter(m => m[1]).map(([k, w]) => '<div><dt>' + esc(k) + '</dt><dd>' + esc(w) + '</dd></div>').join('');
    const warum = kur && (t.why || {})[id];
    $('sb-warum').innerHTML = warum ? '<div class="sb-warum"><div class="klein">' + esc(t.detailWhy) + '</div><p>' + esc(warum) + '</p></div>' : '';
    $('sb-lang').textContent = x === undefined ? t.detailLoading : (x && x[5] && x[5] !== kurz ? x[5] : (x ? '' : t.detailNoDesc));
    $('sb-lang').hidden = !$('sb-lang').textContent;
    const tags = e ? e.tags : [];
    $('sb-tags').innerHTML = tags.length ? '<span class="klein sb-tags-t">' + esc(t.detailTags) + '</span>' + tags.map(w => '<button class="chip" type="button" data-tag="' + esc(w) + '">' + esc(w) + '</button>').join('') : '';
    const web = x && /^https?:\/\//i.test(x[4]) ? x[4] : '';
    $('sb-links').innerHTML = (web ? '<a href="' + esc(web) + '" target="_blank" rel="noopener noreferrer">' + esc(t.detailHome) + '</a>' : '') +
      '<a href="' + esc(manifestUrl(id, v)) + '" target="_blank" rel="noopener noreferrer">' + esc(t.detailManifest) + '</a>';
    $('sb-cmd').textContent = installBefehl(id);
  };
  $('sb-ue').hidden = true;
  fuellen(S.indexId && S.indexId.get(id), undefined);
  if (!dlg.open) { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }
  dlg.scrollTop = 0;
  const [, x] = await Promise.all([holeIndex(), holeTexte(id)]);
  fuellen(S.indexId && S.indexId.get(id), x);
  ueSteckbrief(id);
}
function schliesseSteckbrief() { const d = $('steckbrief'); S.sb = null; if (d.close) d.close(); else d.removeAttribute('open'); }

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
  const id = e.target.closest('.c-id, .paket'); if (id) return zeigeSteckbrief(id.dataset.id);
  const c = e.target.closest('.cmd-code'); if (c) return kopiere(c.dataset.c);
  const th = e.target.closest('.thema'); if (th) return setzeFilter({ typ: 'thema', key: th.dataset.thema });
  const tg = e.target.closest('[data-tag]'); if (tg) { if ($('steckbrief').open) schliesseSteckbrief(); return setzeFilter({ typ: 'tag', key: tg.dataset.tag }); }
  if (e.target.closest('#filter-weg')) { S.fa = null; zeichneAlle(); return $('qa').focus(); }
  const ch = e.target.closest('#chips .chip'); if (ch) { S.cat = ch.dataset.c || null; zeichneChips(); zeichneTabelle(); }
});
$('sb-kopie').addEventListener('click', () => kopiere($('sb-cmd').textContent));
$('sb-zu').addEventListener('click', schliesseSteckbrief);
// Klick auf den abgedunkelten Rand schließt; Esc schließt der Browser selbst.
$('steckbrief').addEventListener('click', e => { if (e.target === $('steckbrief')) schliesseSteckbrief(); });
$('steckbrief').addEventListener('close', () => { S.sb = null; });
function sortiere(th) { const k = th.dataset.k; if (S.sortK === k) S.sortDir *= -1; else { S.sortK = k; S.sortDir = 1; } zeichneTabelle(); }
document.querySelector('table.auswahl thead').addEventListener('click', e => { const th = e.target.closest('th'); if (th) sortiere(th); });
document.querySelector('table.auswahl thead').addEventListener('keydown', e => { const th = e.target.closest('th'); if (th && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); sortiere(th); } });
$('q').addEventListener('input', e => { S.q = e.target.value; zeichneTabelle(); });
let qaT = 0;
$('qa').addEventListener('input', e => { S.qa = e.target.value; clearTimeout(qaT); qaT = setTimeout(() => { zeichneAlle(); ueSuche(S.qa.trim().toLowerCase()); }, 120); });
$('ue').addEventListener('click', async () => {
  if (UE.an) { UE.an = false; UE.lauf++; speichern('wingetarium.uebersetzen', '0'); ueKnopf(); }
  else await ueStarten();
  zeichneAlle(); ueSuche(S.qa.trim().toLowerCase());
});
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
