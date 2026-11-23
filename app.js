/* KDS Serviceliste – Krandienst Schulz
   Vorlagen (Hauptgruppen + Prüfpunkte) liegen zentral und werden nur von Admins geändert.
   Das laufende Protokoll (Eingaben, Haken, Bemerkungen) liegt auf dem jeweiligen Gerät,
   bis es mit „Protokoll abschließen“ ins gemeinsame Archiv wandert. */

import {
  CATEGORIES, MONTEURE, ADMINS, isAdmin, monteurLabel, defaultTemplate, newId, todayIso,
  emptyDraft, migrateOldData, storeFromMap, TEXT_FIX_VERSION, fixTemplateTexts,
  legacyFleet, VEHICLE_FIELDS, vehicleLabel, FLEET_GROUPS, parseFleetRows
} from './data.js';
import { createLocalStore } from './store-local.js';

const HEADER_FIELDS = ['fId', 'fKm', 'fOw', 'fUw', 'fDate'];
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function lsGet(k, fb) { try { const v = localStorage.getItem(k); return v == null ? fb : v; } catch (e) { return fb; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* voll/gesperrt */ } }
function lsJson(k, fb) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } }

/* ---------- Zustand ---------- */
const S = {
  store: null,
  me: lsGet('kds_me', ''),
  cat: CATEGORIES.includes(lsGet('kds_cat', '')) ? lsGet('kds_cat', '') : 'Kran',
  view: 'home',             // home (Logo beim Öffnen) | list | archive | protocol | …
  edit: false,              // Vorlage bearbeiten (nur Admin)
  templates: {},            // zentral gespeicherte Vorlagen
  editTpl: null,            // Arbeitskopie im Bearbeitungsmodus
  protocols: [],
  openId: null,
  renderDeferred: false,
  protoEdit: false,         // abgeschlossenes Protokoll wird von Admin bearbeitet
  vehicles: [],             // Fuhrpark
  articles: [],             // Lager
  openArticleId: null,
  selVeh: null,             // im Fuhrpark markiertes Fahrzeug
  ordersFilter: '',
  openVehId: null,          // geöffnete Fahrzeugakte
  akteTab: 'historie',
  akte: {}, akteNotes: [], akteFiles: [],         // Werkstattaufträge: '' alle | offen | arbeit | fertig (Auswahl in der Seitenleiste)
  fleetEdit: false,         // Fuhrpark-Blatt im Bearbeitungsmodus (Stift)
  fePending: {},            // noch nicht gespeicherte Eingaben im Blatt: { vid: { feld: wert } }
  expandedArt: null,
  artEdit: null,
  artDirty: false,
  bookings: [],
  lagerCfg: {},
  orders: [],               // Werkstattaufträge
  openOrderId: null,
  orderEdit: null,          // Arbeitskopie des geöffneten Auftrags
  orderDirty: false,
  claim: null,              // Admin-Nachweis dieses Geräts (nur mit richtiger PIN)
  pinFlags: {},             // für welche Admin-Kürzel eine PIN festgelegt ist
  gesperrt: [],             // von Admins gesperrte Nutzer-Kürzel
  memberList: []            // Geräte der Werkstatt mit ihrem Kürzel (für „Nutzer sperren“)
};

/* Admin-Rechte nur mit gültigem PIN-Nachweis – nicht schon durch das Kürzel */
const amAdmin = () => isAdmin(S.me) && !!S.claim && S.claim.monteur === S.me;

/* Die Datenbank hat einen Admin-Vorgang abgelehnt – meist weil die PIN inzwischen
   (auf einem anderen Gerät) geändert oder zurückgesetzt wurde. Admin-Rechte hier aufheben. */
function adminRejected() {
  S.claim = null;
  if (S.edit) { S.edit = false; S.editTpl = null; }
  S.protoEdit = false;
  render();
  showToast(`PIN wurde geändert – bitte als ${S.me} neu anmelden (Nutzer → ${S.me})`);
}

const tplFor = (cat) => (S.templates[cat] && Array.isArray(S.templates[cat].groups)) ? S.templates[cat] : defaultTemplate(cat);
const draftKey = (cat) => 'kds_draft_' + cat;
function loadDraft(cat) {
  const d = lsJson(draftKey(cat), null);
  if (!d) return emptyDraft();
  const e = emptyDraft();
  return { ...e, ...d, header: { ...e.header, ...(d.header || {}) } };
}
let draft = loadDraft(S.cat);
function saveDraft() { lsSet(draftKey(S.cat), JSON.stringify(draft)); }

/* ---------- Kleine Helfer: Toast & Bestätigung ---------- */
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

function confirmModal(message, confirmLabel, danger = true) {
  return new Promise((resolve) => {
    const ov = $('confirm-modal-overlay'), yes = $('confirm-modal-yes'), no = $('confirm-modal-no');
    $('confirm-modal-message').textContent = message;
    $('confirm-modal-body').innerHTML = '';
    yes.textContent = confirmLabel || 'Bestätigen';
    yes.classList.toggle('btn-danger', danger);
    ov.classList.add('show');
    const done = (r) => {
      ov.classList.remove('show');
      yes.removeEventListener('click', y); no.removeEventListener('click', n);
      ov.removeEventListener('mousedown', o); document.removeEventListener('keydown', k);
      resolve(r);
    };
    const y = () => done(true), n = () => done(false);
    const o = (e) => { if (e.target === ov) done(false); };
    const k = (e) => { if (e.key === 'Escape') done(false); if (e.key === 'Enter') done(true); };
    yes.addEventListener('click', y); no.addEventListener('click', n);
    ov.addEventListener('mousedown', o); document.addEventListener('keydown', k);
  });
}

/* Excel-Leser (SheetJS) erst bei Bedarf laden */
let xlsxPromise = null;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return xlsxPromise || (xlsxPromise = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'vendor/xlsx/xlsx.full.min.js';
    s.onload = () => res(window.XLSX); s.onerror = () => { xlsxPromise = null; rej(new Error('Excel-Leser konnte nicht geladen werden (Internet?).')); };
    document.head.appendChild(s);
  }));
}

/* Eingabe-Dialog (Ersatz für window.prompt – funktioniert auch als installierte App) */
function promptModal(message, okLabel, { value = '', type = 'text', inputmode = '' } = {}) {
  return new Promise((resolve) => {
    const ov = $('confirm-modal-overlay'), yes = $('confirm-modal-yes'), no = $('confirm-modal-no');
    $('confirm-modal-message').textContent = message;
    $('confirm-modal-body').innerHTML = `<input id="pm-input" class="pm-input" type="${type}" ${inputmode ? `inputmode="${inputmode}"` : ''} autocomplete="off">`;
    $('pm-input').value = value;
    yes.textContent = okLabel || 'OK'; yes.classList.remove('btn-danger');
    ov.classList.add('show');
    setTimeout(() => { $('pm-input').focus(); $('pm-input').select(); }, 30);
    const done = (r) => {
      ov.classList.remove('show'); $('confirm-modal-body').innerHTML = '';
      yes.removeEventListener('click', y); no.removeEventListener('click', n); ov.removeEventListener('mousedown', o); document.removeEventListener('keydown', k);
      resolve(r);
    };
    const y = () => done($('pm-input').value), n = () => done(null);
    const o = (e) => { if (e.target === ov) done(null); };
    const k = (e) => { if (e.key === 'Escape') done(null); if (e.key === 'Enter') done($('pm-input').value); };
    yes.addEventListener('click', y); no.addEventListener('click', n); ov.addEventListener('mousedown', o); document.addEventListener('keydown', k);
  });
}

/* =====================================================================
   Darstellung
   ===================================================================== */
/* Hauptgruppen der Seitenleiste: auf-/zuklappbar, Zustand je Gerät gemerkt.
   Die Gruppe der gerade geöffneten Seite ist immer aufgeklappt. */
/* Gruppen der geöffneten Seite (äußere zuerst) – diese bleiben immer aufgeklappt */
const activeGroups = () => (S.view === 'stock' || S.view === 'article' || S.view === 'reorder') ? ['lager']
  : (S.view === 'list' || S.view === 'archive' || S.view === 'protocol') ? ['werkstatt', 'orders', 'service']
  : (S.view === 'orders' || S.view === 'order') ? ['werkstatt', 'orders']
  : (S.view === 'fleet' || S.view === 'vehicle') ? ['werkstatt'] : [];
const viewGroup = () => activeGroups().slice(-1)[0] || '';
function navClosed() { return lsJson('kds_nav_closed', {}) || {}; }
/* Startseite: alle Gruppen zu, nur die Hauptkategorien (Werkstatt, Lager) sichtbar */
function collapseAllNav() {
  const c = {}; document.querySelectorAll('.nav-group[data-group]').forEach(g => { c[g.dataset.group] = true; });
  lsSet('kds_nav_closed', JSON.stringify(c));
}
let lastNavPage = '';
function renderNavGroups() {
  const active = activeGroups();
  // Neue Seite geöffnet → deren Gruppen aufklappen; danach darf man sie wieder zuklappen
  const page = S.view + '|' + S.cat;
  if (page !== lastNavPage) {
    lastNavPage = page;
    const c = navClosed(); let changed = false;
    active.forEach(k => { if (c[k]) { delete c[k]; changed = true; } });
    if (changed) lsSet('kds_nav_closed', JSON.stringify(c));
  }
  const closed = navClosed();
  document.querySelectorAll('.nav-group').forEach(g => {
    const k = g.dataset.group, isClosed = !!closed[k];
    g.classList.toggle('closed', isClosed);
    g.classList.toggle('has-active', active.includes(k));
    g.querySelector('.nav-group-h').setAttribute('aria-expanded', String(!isClosed));
  });
}

function renderNav() {
  renderNavGroups();
  const nav = $('nav-cats');
  nav.querySelectorAll('.nav-item').forEach(n => n.remove());
  CATEGORIES.forEach(cat => {
    const el = document.createElement('div');
    el.className = 'nav-item' + (S.view === 'list' && S.cat === cat ? ' active' : '');
    el.textContent = cat;
    el.dataset.cat = cat;
    nav.appendChild(el);
  });
  $('nav-archive').classList.toggle('active', S.view === 'archive' || S.view === 'protocol');
  $('nav-fleet').classList.toggle('active', S.view === 'fleet' || S.view === 'vehicle');
  document.querySelectorAll('#nav-orders .nav-item[data-ostatus]').forEach(n => n.classList.toggle('active',
    (S.view === 'orders' || S.view === 'order') && (n.dataset.ostatus || '') === S.ordersFilter));
  $('orders-count').textContent = S.orders.filter(o => o.status !== 'fertig').length;
  $('nav-stock').classList.toggle('active', S.view === 'stock' || S.view === 'article');
  $('nav-reorder').classList.toggle('active', S.view === 'reorder');
  $('nav-reorder').classList.toggle('hidden', !amAdmin());
  $('stock-count').textContent = S.articles.length;
  const low = S.articles.filter(x => artStatus(x) !== 'ok').length;
  $('reorder-count').textContent = low;
  $('reorder-count').classList.toggle('count-warn', low > 0);
  $('arch-count').textContent = S.protocols.length;
  $('fleet-count').textContent = S.vehicles.length;

  const meBtn = $('btn-me');
  $('me-label').innerHTML = S.me ? esc(S.me) + (amAdmin() ? '<span class="admin-tag">Admin</span>' : '') : 'Auswählen …';
  meBtn.dataset.who = S.me ? monteurLabel(S.me) : '';
  meBtn.title = [meBtn.dataset.who, meBtn.dataset.status].filter(Boolean).join(' · ');

}

function renderChrome() {
  const mode = S.view === 'list' ? (S.edit ? 'edit' : 'list') : (S.view === 'protocol' && S.protoEdit ? 'protoedit' : S.view);
  const admin = amAdmin();
  document.querySelectorAll('#hero-actions [data-show]').forEach(b => {
    const tokens = b.dataset.show.split(' ');
    const show = tokens.includes(mode) && (!tokens.includes('admin') || admin);
    b.classList.toggle('hidden', !show);
  });

  let title;
  if (mode === 'home') title = 'Startseite';
  else if (mode === 'archive') title = 'Archiv';
  else if (mode === 'fleet') title = 'Fuhrpark';
  else if (mode === 'vehicle') { const v = S.vehicles.find(x => x.id === S.openVehId); title = 'Fahrzeugakte ' + (v ? (v.code || v.typ || '') : ''); }
  else if (mode === 'orders') title = 'Werkstattaufträge' + (S.ordersFilter ? ' · ' + ORDER_STATUS[S.ordersFilter] : '');
  else if (mode === 'order') title = 'Auftrag ' + ((S.orderEdit && S.orderEdit.nr) || '');
  else if (mode === 'stock') title = 'Lager';
  else if (mode === 'article') title = (S.artEdit && S.artEdit.name) || 'Artikel';
  else if (mode === 'reorder') title = 'Bestellvorschläge';
  else if (mode === 'protocol' || mode === 'protoedit') {
    const p = S.protocols.find(x => x.id === S.openId);
    title = 'Protokoll ' + (p ? p.category : '');
  } else title = (S.edit ? 'Vorlage ' : 'Serviceliste ') + S.cat;
  $('main-title').textContent = title;
  $('sidebar-sub').textContent = mode === 'home' ? 'Betriebsportal' : (mode === 'stock' || mode === 'article' || mode === 'reorder') ? 'Lager' : (mode === 'orders' || mode === 'order') ? 'Werkstattaufträge' : (mode === 'fleet' || mode === 'vehicle') ? 'Fuhrpark' : (mode === 'archive' || mode === 'protocol' || mode === 'protoedit') ? 'Archiv' : 'Serviceliste ' + S.cat;
  document.title = title + ' · Krandienst Schulz';

  $('view-home').classList.toggle('hidden', S.view !== 'home');
  document.body.classList.toggle('is-home', S.view === 'home');
  $('view-list').classList.toggle('hidden', S.view !== 'list');
  $('view-archive').classList.toggle('hidden', S.view !== 'archive');
  $('view-protocol').classList.toggle('hidden', S.view !== 'protocol');
  $('view-fleet').classList.toggle('hidden', S.view !== 'fleet');
  $('view-vehicle').classList.toggle('hidden', S.view !== 'vehicle');
  $('view-orders').classList.toggle('hidden', S.view !== 'orders');
  $('view-order').classList.toggle('hidden', S.view !== 'order');
  $('view-stock').classList.toggle('hidden', S.view !== 'stock');
  $('view-article').classList.toggle('hidden', S.view !== 'article');
  $('view-reorder').classList.toggle('hidden', S.view !== 'reorder');
  $('cards').classList.toggle('hidden', ['home', 'archive', 'edit', 'fleet', 'vehicle', 'orders', 'order', 'stock', 'article', 'reorder'].includes(mode));
  $('edit-banner').classList.toggle('hidden', mode !== 'edit');
  renderOrderLink();
  const cp = document.querySelector('#hero-actions [data-act="close-protocol"]');
  if (cp) cp.textContent = (mode === 'list' && draft.header && draft.header.orderId) ? '✓ Zum Auftrag hinzufügen' : 'Protokoll abschließen';
  $('edit-tools').classList.toggle('hidden', mode !== 'edit');
  $('monteure-box').classList.toggle('hidden', mode === 'edit');

  const readOnly = mode === 'protocol';   // beim Bearbeiten (protoedit) sind die Kopffelder frei
  HEADER_FIELDS.forEach(id => { $(id).readOnly = readOnly; });
  $('cards').classList.toggle('ro', readOnly);
  renderNav();
}

/* ---------- Ausfüllen ---------- */
function renderFill() {
  const container = $('groups-container');
  const tpl = tplFor(S.cat);
  let html = '';
  tpl.groups.forEach(g => {
    const gOff = !!draft.off[g.id];
    let rows = '';
    g.items.forEach(it => {
      const off = !!draft.off[it.id];
      const st = draft.status[it.id] || {};
      rows += `
        <tr data-iid="${esc(it.id)}" class="${off ? 'is-disabled' : ''}">
          <td class="center no-print"><input type="checkbox" class="chk-row-active" ${off ? '' : 'checked'} aria-label="Prüfpunkt aktiv"></td>
          <td class="item-text">${esc(it.text)}</td>
          <td contenteditable="true" class="editable-cell note">${esc(draft.notes[it.id] || '')}</td>
          <td class="center"><input type="checkbox" class="chk-status" data-k="io" ${st.io ? 'checked' : ''} aria-label="i.O."></td>
          <td class="center"><input type="checkbox" class="chk-status" data-k="nio" ${st.nio ? 'checked' : ''} aria-label="n.i.O."></td>
          <td class="center"><input type="checkbox" class="chk-status" data-k="beh" ${st.beh ? 'checked' : ''} aria-label="behoben"></td>
        </tr>`;
    });
    html += `
      <div class="box ${gOff ? 'is-disabled' : ''}" data-gid="${esc(g.id)}">
        <div class="sec-title">
          <div class="title-left">
            <input type="checkbox" class="chk-group-active no-print" ${gOff ? '' : 'checked'} title="Hauptgruppe aktivieren/deaktivieren">
            <span class="readonly-title">${esc(g.title)}</span>
          </div>
        </div>
        <table class="service-table st-fill">
          <thead><tr>
            <th class="col-toggle no-print" title="Zeile aktivieren/deaktivieren">Aktiv</th>
            <th class="col-desc">Prüfpunkt / Arbeitsschritt</th>
            <th class="col-note">Bemerkung / Zusatz</th>
            <th class="col-status">i.O.</th><th class="col-status">n.i.O.</th><th class="col-status">behoben</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  });
  container.innerHTML = html || '<div class="empty-note">Diese Vorlage ist noch leer.</div>';
}

function applyHeader(h) {
  HEADER_FIELDS.forEach(id => { $(id).value = (h && h[id]) || ''; });
  markEmptyDate();
  renderVehInfo(h || {});
}

/* Kennzeichen / Werk-Nr. unter „ID / Fahrzeug“ (aus dem Fuhrpark oder im Protokoll gespeichert) */
function renderVehInfo(h) {
  const parts = [h.kz, h.werk ? 'Werk-Nr. ' + h.werk : ''].filter(Boolean);
  $('veh-info').textContent = parts.join(' · ');
}
function fillVehicleList() {
  $('veh-list').innerHTML = sortVehicles(S.vehicles).map(v =>
    `<option value="${esc(vehicleLabel(v))}">${esc([v.kz, v.werk].filter(Boolean).join(' · '))}</option>`).join('');
}
/* Eingabe im Feld „ID / Fahrzeug“ mit dem Fuhrpark abgleichen */
function matchVehicle(value) {
  const val = String(value || '').trim().toLowerCase();
  if (!val) return null;
  return S.vehicles.find(v => vehicleLabel(v).toLowerCase() === val)
    || S.vehicles.find(v => v.code && v.code.toLowerCase() === val)
    || S.vehicles.find(v => v.kz && v.kz.toLowerCase() === val) || null;
}
function syncHeaderVehicle() {
  const v = matchVehicle(draft.header.fId);
  if (v) { draft.header.vehId = v.id; draft.header.kz = v.kz || ''; draft.header.werk = v.werk || ''; draft.header.typ = v.typ || ''; }
  else { delete draft.header.vehId; delete draft.header.kz; delete draft.header.werk; delete draft.header.typ; }
  renderVehInfo(draft.header);
}

/* =====================================================================
   Lager / Warenwirtschaft
   ===================================================================== */
const EINHEITEN = ['Stk.', 'L', 'kg', 'm', 'Dose', 'Fass', 'Set', 'Karton', 'Paar', 'Rolle'];
const DEFAULT_KATS = ['Filter', 'Gase', 'Lampen', 'Öl', 'PSA', 'Schmierstoffe', 'Spraydosen', 'Verbrauchsmaterial'];
const DEFAULT_ORTE = ['Hauptlager', 'Werkstatt', 'Ersatzteillager'];
const ART_FIELDS = ['sku', 'barcode', 'name', 'kat', 'einheit', 'gebinde', 'lagerort', 'minBestand', 'preis', 'notes', 'suppliers'];
const deSort = (x, y) => String(x).localeCompare(String(y), 'de', { sensitivity: 'base', numeric: true });
const kategorien = () => [...new Set([...DEFAULT_KATS, ...(S.lagerCfg.kategorien || []), ...S.articles.map(x => x.kat).filter(Boolean)])].sort(deSort);
const lagerorte = () => [...new Set([...DEFAULT_ORTE, ...(S.lagerCfg.lagerorte || []), ...S.articles.map(x => x.lagerort).filter(Boolean)])].sort(deSort);
const fmtNum = (n) => (Math.round(num(n) * 1000) / 1000).toLocaleString('de-DE', { maximumFractionDigits: 3 });
const fmtEuro = (n) => num(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
/* Ampel: leer (≤ 0) · niedrig (≤ Mindestbestand) · ok */
function artStatus(x) { const b = num(x.bestand), m = num(x.minBestand); return b <= 0 ? 'leer' : (b <= m ? 'niedrig' : 'ok'); }
const ART_ST = { leer: ['bad', 'leer'], niedrig: ['pend', 'nachbestellen'], ok: ['ok', 'OK'] };
const artBadge = (x) => { const [c, t] = ART_ST[artStatus(x)]; return `<span class="badge ${c}">${t}</span>`; };
function normalizeArticle(x) {
  const d = { id: x.id, bestand: num(x.bestand), bestandVon: x.bestandVon || '' };
  ART_FIELDS.forEach(f => { d[f] = x[f] !== undefined ? x[f] : ''; });
  d.einheit = d.einheit || 'Stk.'; d.kat = d.kat || 'Verbrauchsmaterial'; d.lagerort = d.lagerort || DEFAULT_ORTE[0];
  d.suppliers = Array.isArray(x.suppliers) ? x.suppliers.map(s => ({ name: s.name || '', bestellNr: s.bestellNr || '', gebinde: s.gebinde || '', preis: s.preis ?? '' })) : [];
  return d;
}
/* Empfohlene Bestellmenge: auf das Doppelte des Mindestbestands auffüllen (mind. 1) */
const recQty = (x) => Math.max(1, num(x.minBestand) * 2 - num(x.bestand));

function renderStock() {
  // Filter-Auswahl befüllen (Auswahl behalten)
  const fill = (id, list, all, extra = '') => { const sel = $(id), cur = sel.value;
    sel.innerHTML = `<option value="">${all}</option>` + list.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('') + extra;
    sel.value = list.includes(cur) ? cur : ''; };
  // alle bekannten Lagerorte (auch neu angelegte ohne Artikel); Admins können hier einen neuen anlegen
  fill('stock-ort', lagerorte(), 'Alle Lagerorte', amAdmin() ? '<option value="__neu__">+ Neuer Lagerort …</option>' : '');
  fill('stock-kat', [...new Set(S.articles.map(x => x.kat).filter(Boolean))].sort(deSort), 'Alle Kategorien');
  if (S.lagerError) {
    $('stock-summary').innerHTML = '';
    $('stock-list').innerHTML = `<div class="empty-note">${S.lagerError === 'rules'
      ? '<b>Lager noch nicht freigeschaltet.</b><br>Die Firebase-Regeln werden beim nächsten Update eingespielt.'
      : 'Das Lager konnte nicht geladen werden. Bitte später erneut versuchen.'}</div>`;
    return;
  }
  const q = $('stock-search').value.trim().toLowerCase(), ort = $('stock-ort').value, kat = $('stock-kat').value;
  const list = S.articles
    .filter(x => (!ort || x.lagerort === ort) && (!kat || x.kat === kat))
    .filter(x => !q || [x.sku, x.barcode, x.name, x.kat, x.lagerort, x.gebinde, x.notes, ...(x.suppliers || []).flatMap(s => [s.name, s.bestellNr])].join(' ').toLowerCase().includes(q))
    .sort((x, y) => deSort(x.name || '', y.name || ''));
  // Auswertung (nur Admins): folgt Lagerort- und Kategorie-Filter, „Alle“ = gesamtes Lager
  const scope = S.articles.filter(x => (!ort || x.lagerort === ort) && (!kat || x.kat === kat));
  const total = scope.reduce((s, x) => s + num(x.bestand) * num(x.preis), 0);
  const leer = scope.filter(x => artStatus(x) === 'leer').length, low = scope.filter(x => artStatus(x) === 'niedrig').length;
  const where = [ort || 'Gesamtes Lager', kat].filter(Boolean).join(' · ');
  $('stock-summary').innerHTML = amAdmin() && S.articles.length ? `<div class="fleet-summary">
      <span class="badge cat">${esc(where)}: ${scope.length} Artikel · Lagerwert ${esc(fmtEuro(total))}</span>
      ${leer ? `<span class="badge bad">${leer} leer</span>` : ''}${low ? `<span class="badge pend">${low} nachbestellen</span>` : ''}
      ${scope.length && !leer && !low ? '<span class="badge ok">Alle Bestände ausreichend</span>' : ''}
    </div>` : '';
  if (!S.articles.length) {
    $('stock-list').innerHTML = `<div class="empty-note">Noch keine Artikel im Lager.<br>${amAdmin() ? 'Über „+ Artikel“ den ersten anlegen.' : 'Artikel legen die Admins (SE, KÖ) an.'}</div>`;
    return;
  }
  if (!list.length) { $('stock-list').innerHTML = '<div class="empty-note">Kein Artikel zu dieser Auswahl.</div>'; return; }
  // offenes Buchungsfeld: Eingaben und Fokus über das Neuzeichnen retten
  const keep = { qty: $('qd-qty') ? $('qd-qty').value : '', note: $('qd-note') ? $('qd-note').value : '', focus: document.activeElement && document.activeElement.id };
  if (S.expandedArt && !list.some(x => x.id === S.expandedArt)) collapseArt();
  $('stock-list').innerHTML = list.map(x => `
    <div class="art-item${S.expandedArt === x.id ? ' open' : ''}">
    <button class="arch-row art-row" data-aid="${esc(x.id)}" type="button" aria-expanded="${S.expandedArt === x.id}">
      <span class="arch-main">
        <span class="veh">${esc(x.name || 'Ohne Bezeichnung')}</span>
        <span class="meta" style="display:block">${x.sku ? `<span class="mono">${esc(x.sku)}</span> · ` : ''}${esc([x.kat, x.lagerort, x.gebinde].filter(Boolean).join(' · '))}</span>
      </span>
      <span class="badges"><span class="art-qty">${esc(fmtNum(x.bestand))} ${esc(x.einheit || '')}</span>${artBadge(x)}</span>
    </button>${S.expandedArt === x.id ? quickBookHtml(x) : ''}</div>`).join('');
  if ($('qd-qty')) {
    $('qd-qty').value = keep.qty; $('qd-note').value = keep.note;
    if (keep.focus === 'qd-qty' || keep.focus === 'qd-note') $(keep.focus).focus();
    renderQuickHist();
  }
}
/* Schnellbuchung direkt in der Liste (für alle); Admins kommen von hier zu den Stammdaten */
function quickBookHtml(x) {
  return `<div class="art-drop">
      <div class="book-row qd-row">
        <input id="qd-qty" class="o-field-in" inputmode="decimal" placeholder="Menge (${esc(x.einheit || 'Stk.')})" autocomplete="off">
        <input id="qd-note" class="o-field-in" placeholder="Verwendungszweck / Auftrag-Nr. …" autocomplete="off">
        <button class="btn-sec btn-in" data-act="qbook-in" type="button">+ Zulauf</button>
        <button class="btn-sec btn-danger" data-act="qbook-out" type="button">− Entnahme</button>
      </div>
      <div id="qd-hist" class="qd-hist"></div>
      ${amAdmin() ? `<div class="qd-admin"><button class="btn-sec" data-act="open-article" data-aid="${esc(x.id)}" type="button">✎ Stammdaten &amp; Inventur</button></div>` : ''}
    </div>`;
}
function renderQuickHist() {
  const box = $('qd-hist'); if (!box) return;
  const x = S.articles.find(y => y.id === S.expandedArt); if (!x) return;
  box.innerHTML = S.bookings.length ? '<span class="qd-label">Letzte Buchungen</span>' + S.bookings.slice(0, 3).map(b => {
    const m = num(b.menge), sign = b.typ === 'Zulauf' ? '+' : b.typ === 'Entnahme' ? '−' : (m >= 0 ? '+' : '−');
    return `<div class="qd-h h-${esc(b.typ)}"><span>${esc(new Date(b.ts || 0).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }))}</span>
      <b class="mono">${sign}${esc(fmtNum(Math.abs(m)))} ${esc(x.einheit || '')}</b><span class="qd-g">${esc(b.grund || b.typ)}</span><span>${esc(b.von || '')}</span></div>`;
  }).join('') : '<span class="qd-label">Noch keine Buchungen</span>';
}
function toggleArt(id) {
  if (S.expandedArt === id) { collapseArt(); }
  else { S.expandedArt = id; subscribeBookings(id); }
  renderStock();
  if (S.expandedArt) { const q = $('qd-qty'); if (q) { q.closest('.art-item').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); if (window.innerWidth > 940) q.focus(); } }
}
function collapseArt() { S.expandedArt = null; if (S.view !== 'article') closeArticleSubs(); }

/* ---------- Barcode-Scanner (Kamera) ----------
   Android/Chromebook: eingebauter BarcodeDetector. iPhone u. a.: ZXing (vendor/zxing, erst bei Bedarf geladen). */
const SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code', 'data_matrix'];
let zxingPromise = null;
function loadZXing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  return zxingPromise || (zxingPromise = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'vendor/zxing/zxing.min.js';
    s.onload = () => res(window.ZXing); s.onerror = () => { zxingPromise = null; rej(new Error('Scanner konnte nicht geladen werden')); };
    document.head.appendChild(s);
  }));
}
async function makeDetector() {
  if ('BarcodeDetector' in window) {
    try {
      const sup = await window.BarcodeDetector.getSupportedFormats();
      const f = SCAN_FORMATS.filter(x => sup.includes(x));
      if (f.length) { const d = new window.BarcodeDetector({ formats: f }); return async (v) => { const r = await d.detect(v); return r[0] ? r[0].rawValue : null; }; }
    } catch (e) { /* weiter mit ZXing */ }
  }
  const Z = await loadZXing();
  const F = Z.BarcodeFormat, hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.CODE_93, F.ITF, F.CODABAR, F.QR_CODE, F.DATA_MATRIX]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  const reader = new Z.MultiFormatReader(); reader.setHints(hints);
  const c = document.createElement('canvas'), ctx = c.getContext('2d', { willReadFrequently: true });
  return async (v) => {
    const w = v.videoWidth, h = v.videoHeight; if (!w || !h) return null;
    const k = Math.min(1, 960 / w); c.width = Math.round(w * k); c.height = Math.round(h * k);
    ctx.drawImage(v, 0, 0, c.width, c.height);
    try { return reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(c)))).getText(); }
    catch (e) { return null; } finally { reader.reset(); }
  };
}
let scanCleanup = null;
function closeScanner(val) { if (scanCleanup) scanCleanup(val === undefined ? null : val); }
/* Öffnet die Kamera; liefert den gelesenen Code oder null (abgebrochen). Code kann auch eingetippt werden. */
function scanBarcode(title) {
  return new Promise((resolve) => {
    const ov = $('scan-ov');
    ov.innerHTML = `<div class="scan-card">
      <div class="scan-head"><b>${esc(title || 'Barcode scannen')}</b><button type="button" class="scan-x" data-scan="cancel" aria-label="Schließen">✕</button></div>
      <div class="scan-box"><video id="scan-video" playsinline muted autoplay></video><div class="scan-frame"></div><div class="scan-msg" id="scan-msg">Kamera wird gestartet …</div></div>
      <form class="scan-manual" id="scan-form"><input id="scan-input" placeholder="oder Code eintippen" autocomplete="off" inputmode="text"><button class="btn-sec" type="submit">OK</button></form>
    </div>`;
    ov.classList.remove('hidden');
    let stream = null, stopped = false;
    const finish = (val) => {
      if (stopped) return; stopped = true; scanCleanup = null;
      if (stream) stream.getTracks().forEach(t => t.stop());
      ov.classList.add('hidden'); ov.innerHTML = ''; ov.onclick = null; ov.onsubmit = null; document.removeEventListener('keydown', onKey, true);
      resolve(val ? String(val).trim() : null);
    };
    scanCleanup = finish;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); finish(null); } };
    document.addEventListener('keydown', onKey, true);
    ov.onclick = (e) => { if (e.target.closest('[data-scan="cancel"]') || e.target === ov) finish(null); };
    ov.onsubmit = (e) => { e.preventDefault(); const v = $('scan-input').value.trim(); if (v) finish(v); };
    (async () => {
      const video = $('scan-video'), msg = $('scan-msg');
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('nocam');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        video.srcObject = stream; await video.play().catch(() => {});
        const detect = await makeDetector();
        msg.textContent = 'Barcode in den Rahmen halten';
        const loop = async () => {
          if (stopped) return;
          let val = null; try { val = await detect(video); } catch (e) { /* nächster Versuch */ }
          if (val) { if (navigator.vibrate) navigator.vibrate(60); finish(val); return; }
          setTimeout(loop, 180);
        };
        loop();
      } catch (e) {
        msg.textContent = e && e.name === 'NotAllowedError' ? 'Kamera nicht erlaubt – in den Einstellungen des Geräts freigeben oder Code eintippen.' : 'Keine Kamera verfügbar – Code bitte eintippen.';
        msg.classList.add('err'); const i = $('scan-input'); if (i) i.focus();
      }
    })();
  });
}
const normCode = (s) => String(s || '').trim().toLowerCase();
const findArticleByCode = (code) => { const c = normCode(code); if (!c) return null;
  if (c.startsWith('kds:')) { const id = String(code).trim().slice(4); const x = S.articles.find(a => a.id === id); if (x) return x; }   // eigenes QR-Etikett
  return S.articles.find(a => normCode(a.barcode) === c) || S.articles.find(a => normCode(a.sku) === c) || null; };

/* ---------- QR-Etiketten zum Ausdrucken ----------
   Inhalt: vorhandener Barcode des Artikels, sonst „KDS:<Kennung>“ – beides findet der Scanner. */
const LABEL_FORMATS = {
  a4_3x8: { name: 'A4-Bogen 3 × 8 (70 × 37 mm)', cols: 3, rows: 8, w: 70, h: 37, page: 'A4', padTop: 0.5 },
  a4_2x5: { name: 'A4-Bogen 2 × 5, groß (105 × 57 mm)', cols: 2, rows: 5, w: 105, h: 57, page: 'A4', padTop: 6 },
  roll_62x29: { name: 'Etikettendrucker 62 × 29 mm (einzeln)', cols: 1, rows: 1, w: 62, h: 29, page: '62mm 29mm', padTop: 0 },
};
let qrPromise = null;
function loadQR() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  return qrPromise || (qrPromise = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'vendor/qrcode/qrcode.js';
    s.onload = () => res(window.qrcode); s.onerror = () => { qrPromise = null; rej(new Error('QR-Erzeugung konnte nicht geladen werden')); };
    document.head.appendChild(s);
  }));
}
const labelCode = (a) => a.barcode ? String(a.barcode).trim() : 'KDS:' + a.id;
function qrSvg(text) {
  const q = window.qrcode(0, 'M'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}
function openLabelDialog(preIds) {
  const ov = $('setup');
  const sel = new Set(preIds || []);
  let fmt = lsGet('kds_label_fmt', 'a4_3x8'); if (!LABEL_FORMATS[fmt]) fmt = 'a4_3x8';
  const arts = () => S.articles.slice().sort((x, y) => deSort(x.name || '', y.name || ''));
  const drawList = () => {
    const q = ($('lb-q') ? $('lb-q').value : '').trim().toLowerCase();
    $('lb-list').innerHTML = arts().filter(a => !q || [a.sku, a.name, a.kat, a.lagerort].join(' ').toLowerCase().includes(q)).map(a => `
      <label class="lb-item"><input type="checkbox" value="${esc(a.id)}" ${sel.has(a.id) ? 'checked' : ''}>
        <span><b>${esc(a.name)}</b><small>${esc([a.sku, a.lagerort, a.barcode ? 'Code ' + a.barcode : 'neuer QR-Code'].filter(Boolean).join(' · '))}</small></span></label>`).join('')
      || '<p class="proto-meta">Kein Artikel gefunden.</p>';
    sum();
  };
  const sum = () => {
    const f = LABEL_FORMATS[$('lb-fmt').value], n = sel.size * Math.max(1, +$('lb-copies').value || 1), per = f.cols * f.rows;
    const off = f.cols * f.rows > 1 ? Math.max(0, (+$('lb-start').value || 1) - 1) : 0;
    $('lb-sum').textContent = n ? `${n} Etikett${n === 1 ? '' : 'en'}${per > 1 ? ` auf ${Math.ceil((n + off) / per)} Bogen` : ''}` : 'Noch kein Artikel gewählt';
    $('lb-start-wrap').style.display = per > 1 ? '' : 'none';
  };
  ov.innerHTML = `<div class="setup-card lb-card">${cardHead}<h3>🏷 QR-Etiketten drucken</h3>
    <p>Für Regal, Kiste oder Gebinde. Gescannt öffnet das Etikett direkt den Artikel zum Buchen.</p>
    <div class="lb-opts">
      <div class="field"><label for="lb-fmt">Format</label><select id="lb-fmt">${Object.entries(LABEL_FORMATS).map(([k, f]) => `<option value="${k}" ${k === fmt ? 'selected' : ''}>${f.name}</option>`).join('')}</select></div>
      <div class="field"><label for="lb-copies">Anzahl je Artikel</label><input id="lb-copies" type="number" min="1" max="50" value="1" inputmode="numeric"></div>
      <div class="field" id="lb-start-wrap"><label for="lb-start">Beginnen bei Etikett Nr.</label><input id="lb-start" type="number" min="1" value="1" inputmode="numeric"></div>
    </div>
    <div class="field bc-wrap"><input id="lb-q" placeholder="Artikel suchen …" autocomplete="off"><button class="btn-sec" type="button" data-l="all">Alle</button><button class="btn-sec" type="button" data-l="none">Keine</button></div>
    <div id="lb-list" class="osp-list lb-list"></div>
    <p class="proto-meta" id="lb-sum"></p>
    <button class="btn-big" type="button" data-l="print">Drucken</button>
    <div class="setup-back"><button class="link-btn" data-n="close" type="button">Abbrechen</button></div></div>`;
  ov.classList.remove('hidden'); drawList();
  const close = () => { ov.classList.add('hidden'); ov.onclick = null; ov.oninput = null; ov.onchange = null; };
  ov.oninput = (e) => { if (e.target.id === 'lb-q') drawList(); else sum(); };
  ov.onchange = (e) => {
    if (e.target.matches('.lb-item input')) { e.target.checked ? sel.add(e.target.value) : sel.delete(e.target.value); sum(); }
    if (e.target.id === 'lb-fmt') { lsSet('kds_label_fmt', e.target.value); sum(); }
  };
  ov.onclick = async (e) => {
    if (e.target.closest('[data-n="close"]')) { close(); return; }
    const l = e.target.closest('[data-l]'); if (!l) return;
    if (l.dataset.l === 'all') { $('lb-list').querySelectorAll('.lb-item input').forEach(i => { i.checked = true; sel.add(i.value); }); sum(); }
    if (l.dataset.l === 'none') { sel.clear(); $('lb-list').querySelectorAll('.lb-item input').forEach(i => { i.checked = false; }); sum(); }
    if (l.dataset.l === 'print') {
      if (!sel.size) { showToast('Bitte mindestens einen Artikel wählen'); return; }
      const f = $('lb-fmt').value, copies = Math.min(50, Math.max(1, +$('lb-copies').value || 1)), start = Math.max(1, +$('lb-start').value || 1);
      close();
      try { await printLabels(arts().filter(a => sel.has(a.id)), f, copies, start); } catch (err) { showToast(err.message || 'Drucken fehlgeschlagen'); }
    }
  };
}
async function printLabels(list, fmtKey, copies, start) {
  await loadQR();
  const f = LABEL_FORMATS[fmtKey], per = f.cols * f.rows;
  const cells = []; for (let i = 0; i < (per > 1 ? start - 1 : 0); i++) cells.push(null);
  list.forEach(a => { for (let i = 0; i < copies; i++) cells.push(a); });
  const pages = []; for (let i = 0; i < cells.length; i += per) pages.push(cells.slice(i, i + per));
  const big = f.h >= 50;
  const cell = (a) => a ? `<div class="lbl${big ? ' big' : ''}" style="width:${f.w}mm;height:${f.h}mm">
      <div class="lbl-qr">${qrSvg(labelCode(a))}</div>
      <div class="lbl-t"><b>${esc(a.name || '')}</b>
        ${a.sku ? `<span class="lbl-sku">${esc(a.sku)}</span>` : ''}
        <span>${esc([a.lagerort, a.gebinde].filter(Boolean).join(' · '))}</span>
        <small>${esc(labelCode(a).startsWith('KDS:') ? 'Krandienst Schulz' : labelCode(a))}</small></div></div>`
    : `<div class="lbl empty" style="width:${f.w}mm;height:${f.h}mm"></div>`;
  $('label-sheet').innerHTML = pages.map(p => `<div class="lbl-page" style="grid-template-columns:repeat(${f.cols}, ${f.w}mm);padding-top:${f.padTop}mm">${p.map(cell).join('')}</div>`).join('');
  let st = $('label-page-style'); if (!st) { st = document.createElement('style'); st.id = 'label-page-style'; document.head.appendChild(st); }
  st.textContent = `@media print { @page { size: ${f.page}; margin: 0 } }`;
  document.body.classList.add('print-labels');
  const done = () => { document.body.classList.remove('print-labels'); st.textContent = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  await new Promise(r => setTimeout(r, 60));
  try { window.print(); } catch (e) { done(); throw new Error('Drucken wird von diesem Browser nicht unterstützt'); }
  setTimeout(() => { if (!window.matchMedia('print').matches) done(); }, 1500);
}
/* Artikelliste: scannen → Buchungsfeld des Artikels aufklappen; unbekannt → (Admins) zuordnen oder neu anlegen */
async function scanInStock() {
  const code = await scanBarcode('Artikel scannen'); if (!code) return;
  const x = findArticleByCode(code);
  if (x) { showArticleInStock(x.id); showToast(`${x.name} – Menge eingeben und buchen`); return; }
  if (!amAdmin()) { showToast(`Code ${code} ist keinem Artikel zugeordnet – SE oder KÖ können ihn zuordnen`); return; }
  assignCodeDialog(code);
}
function showArticleInStock(id) {
  $('stock-search').value = ''; $('stock-ort').value = ''; $('stock-kat').value = '';
  if (S.view !== 'stock') { S.view = 'stock'; render(); }
  S.expandedArt = id; subscribeBookings(id); renderStock();
  const it = document.querySelector(`.art-row[data-aid="${CSS.escape(id)}"]`);
  if (it) it.closest('.art-item').scrollIntoView({ block: 'center', behavior: 'smooth' });
  const q = $('qd-qty'); if (q) setTimeout(() => q.focus(), 250);
}
function assignCodeDialog(code) {
  const ov = $('setup');
  const draw = (q = '') => {
    const list = S.articles.filter(a => !q || [a.sku, a.name, a.kat].join(' ').toLowerCase().includes(q.toLowerCase())).sort((x, y) => deSort(x.name || '', y.name || '')).slice(0, 60);
    $('ac-list').innerHTML = list.map(a => `<button type="button" class="osp-item" data-aid="${esc(a.id)}"><span><b>${esc(a.name)}</b><small>${esc([a.sku, a.barcode ? 'hat schon Code ' + a.barcode : ''].filter(Boolean).join(' · '))}</small></span></button>`).join('') || '<p class="proto-meta">Kein Artikel gefunden.</p>';
  };
  ov.innerHTML = `<div class="setup-card osp-card">${cardHead}<h3>Unbekannter Code</h3>
    <p><b class="mono">${esc(code)}</b> ist noch keinem Artikel zugeordnet. Einem vorhandenen Artikel zuordnen oder einen neuen anlegen.</p>
    <button class="btn-big" type="button" data-n="new">+ Neuer Artikel mit diesem Code</button>
    <div class="field" style="margin-top:12px"><input id="ac-q" placeholder="Vorhandenen Artikel suchen …" autocomplete="off"></div>
    <div id="ac-list" class="osp-list"></div>
    <div class="setup-back"><button class="link-btn" data-n="close" type="button">Abbrechen</button></div></div>`;
  ov.classList.remove('hidden'); draw();
  const close = () => { ov.classList.add('hidden'); ov.onclick = null; ov.oninput = null; };
  ov.oninput = (e) => { if (e.target.id === 'ac-q') draw(e.target.value.trim()); };
  ov.onclick = async (e) => {
    if (e.target.closest('[data-n="close"]')) { close(); return; }
    if (e.target.closest('[data-n="new"]')) { close(); await newArticle(code); return; }
    const it = e.target.closest('.osp-item'); if (!it) return;
    const a = S.articles.find(x => x.id === it.dataset.aid); if (!a) return;
    if (a.barcode && a.barcode !== code && !(await confirmModal(`„${a.name}“ hat schon den Code ${a.barcode}. Durch ${code} ersetzen?`, 'Ersetzen', false))) return;
    close();
    a.barcode = code;
    S.store.saveArticle(a.id, { barcode: code }, S.me, false).catch(err => { if (err && err.code === 'permission-denied') adminRejected(); });
    showArticleInStock(a.id); showToast(`Code ${code} → ${a.name} gespeichert`);
  };
}

/* ---------- Ein Artikel ---------- */
let unsubBookings = null;
function closeArticleSubs() { if (unsubBookings) { unsubBookings(); unsubBookings = null; } S.openArticleId = S.view === 'article' ? S.openArticleId : null; }
function subscribeBookings(aid) {
  if (unsubBookings) unsubBookings();
  S.bookings = [];
  unsubBookings = S.store.onBookings(aid, (list) => { S.bookings = list; if (S.view === 'article' && S.openArticleId === aid) renderHistory(); if (S.view === 'stock' && S.expandedArt === aid) renderQuickHist(); });
}
function openArticle(id) {
  const x = S.articles.find(y => y.id === id);
  if (!x) return;
  flushArtSave();
  S.openArticleId = id; S.artEdit = normalizeArticle(x); S.artDirty = false;
  subscribeBookings(id);
  S.view = 'article'; render(); window.scrollTo(0, 0);
}
async function newArticle(barcode = '') {
  if (!amAdmin()) return;
  const name = await promptModal(barcode ? `Bezeichnung des neuen Artikels (Code ${barcode}):` : 'Bezeichnung des neuen Artikels:', 'Anlegen', { value: '' });
  if (!name || !name.trim()) return;
  const id = S.store.newArticleId();
  const d = { sku: '', barcode: barcode || '', name: name.trim(), kat: 'Verbrauchsmaterial', einheit: 'Stk.', gebinde: '', lagerort: DEFAULT_ORTE[0],
    minBestand: 0, preis: 0, notes: '', suppliers: [] };
  try {
    S.store.saveArticle(id, d, S.me, true).catch(err => { if (err && err.code === 'permission-denied') adminRejected(); });
    S.articles.push({ ...d, id, bestand: 0 });
    openArticle(id);
    showToast('Artikel angelegt – Bestand über „+ Zulauf“ einbuchen');
  } catch (e) { showToast('Artikel konnte nicht angelegt werden'); }
}

function renderArticle() {
  const x = S.artEdit;
  if (!x) { S.view = 'stock'; render(); return; }
  const live = S.articles.find(y => y.id === x.id) || x;
  const admin = amAdmin(), dis = admin ? '' : 'disabled';
  const optList = (list, cur, addLabel) => [...new Set([...list, cur].filter(Boolean))].sort(deSort)
    .map(v => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('') + (admin ? `<option value="__neu__">${addLabel}</option>` : '');
  $('view-article').innerHTML = `
    <div class="proto-banner no-print">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button class="btn-sec" data-act="back-stock">← Alle Artikel</button>
        <span class="o-saved" id="a-saved"></span>
        <button class="btn-sec" data-act="label-one" type="button">🏷 QR-Etikett</button>
      </div>
      <div class="actions">${admin ? '<button class="btn-sec btn-danger" data-act="delete-article">🗑️ Löschen</button>' : ''}</div>
    </div>

    <div class="art-cards" id="a-cards"></div>

    <div class="box no-print">
      <div class="sec-title"><div class="title-left"><span>Buchen</span></div></div>
      <div class="book-row">
        <input id="bk-qty" class="o-field-in" inputmode="decimal" placeholder="Menge (${esc(x.einheit)})" autocomplete="off">
        <input id="bk-note" class="o-field-in" placeholder="Grund / Auftrag-Nr. …" autocomplete="off">
        <button class="btn-sec btn-in" data-act="book-in" type="button">+ Zulauf</button>
        <button class="btn-sec btn-danger" data-act="book-out" type="button">− Entnahme</button>
        ${admin ? '<button class="btn-sec" data-act="book-fix" type="button" title="Bestand nach Inventur festlegen">Inventur</button>' : ''}
      </div>
      <p class="proto-meta" style="margin:8px 0 0">Gebucht wird als <b>${esc(S.me || '?')}</b>. Buchen braucht Internet.${live.bestandVon ? ' Letzte Buchung von ' + esc(live.bestandVon) + '.' : ''}</p>
    </div>

    <div class="box">
      <div class="sec-title"><div class="title-left"><span>Stammdaten</span></div></div>
      ${admin ? '' : '<p class="o-locked no-print">Stammdaten ändern nur die Admins (SE, KÖ).</p>'}
      <div class="art-grid">
        <div class="o-field"><label>Art.-Nr.</label><input data-af="sku" value="${esc(x.sku)}" ${dis} placeholder="z. B. HLP-46"></div>
        <div class="o-field"><label>Barcode / EAN</label><div class="bc-wrap"><input data-af="barcode" id="art-barcode" value="${esc(x.barcode || '')}" ${dis} placeholder="scannen oder eintippen" inputmode="numeric">
          ${admin ? '<button class="scan-btn sm no-print" data-act="scan-art-barcode" type="button" title="Barcode scannen">📷</button>' : ''}</div></div>
        <div class="o-field art-wide"><label>Bezeichnung</label><input data-af="name" value="${esc(x.name)}" ${dis}></div>
        <div class="o-field"><label>Kategorie</label><select data-af="kat" ${dis}>${optList(kategorien(), x.kat, '+ Neue Kategorie …')}</select></div>
        <div class="o-field"><label>Lagerort</label><select data-af="lagerort" ${dis}>${optList(lagerorte(), x.lagerort, '+ Neuer Lagerort …')}</select></div>
        <div class="o-field"><label>Einheit</label><select data-af="einheit" ${dis}>${[...new Set([...EINHEITEN, x.einheit])].map(v => `<option ${v === x.einheit ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        <div class="o-field"><label>Gebinde / Verpackung</label><input data-af="gebinde" value="${esc(x.gebinde)}" ${dis} placeholder="z. B. 20-L-Kanister"></div>
        <div class="o-field"><label>Mindestbestand</label><input data-af="minBestand" inputmode="decimal" value="${esc(String(x.minBestand).replace('.', ','))}" ${dis}></div>
        <div class="o-field"><label>Einzelpreis (€)</label><input data-af="preis" inputmode="decimal" value="${esc(String(x.preis).replace('.', ','))}" ${dis}></div>
      </div>
    </div>

    <div class="box">
      <div class="sec-title"><div class="title-left"><span>Lieferanten &amp; Bezugsquellen</span></div>
        ${admin ? '<button class="btn-sec no-print" data-act="add-supplier" type="button">+ Lieferant</button>' : ''}</div>
      ${x.suppliers.length ? `<table class="service-table sup-table">
        <thead><tr><th>Lieferant</th><th>Bestell-Nr.</th><th>Gebinde</th><th>Preis (€)</th>${admin ? '<th class="no-print"></th>' : ''}</tr></thead>
        <tbody>${x.suppliers.map((s, i) => `<tr>
          <td data-l="Lieferant"><input data-sf="name" data-idx="${i}" value="${esc(s.name)}" ${dis}></td>
          <td data-l="Bestell-Nr."><input data-sf="bestellNr" data-idx="${i}" value="${esc(s.bestellNr)}" ${dis}></td>
          <td data-l="Gebinde"><input data-sf="gebinde" data-idx="${i}" value="${esc(s.gebinde)}" ${dis}></td>
          <td data-l="Preis"><input data-sf="preis" data-idx="${i}" inputmode="decimal" value="${esc(String(s.preis).replace('.', ','))}" ${dis}></td>
          ${admin ? `<td class="no-print"><button class="btn-del-row" data-act="del-supplier" data-idx="${i}" title="Entfernen">✕</button></td>` : ''}
        </tr>`).join('')}</tbody></table>` : '<p class="proto-meta">Keine Lieferanten hinterlegt.</p>'}
    </div>

    <div class="box">
      <div class="sec-title"><div class="title-left"><span>Bemerkungen / Hinweise</span></div></div>
      <textarea class="o-ta o-notes" data-af="notes" rows="3" ${dis} placeholder="Spezifikation, Freigaben, Ersatz-Teilenummern …">${esc(x.notes)}</textarea>
    </div>

    <div class="box">
      <div class="sec-title"><div class="title-left"><span>Historie</span></div></div>
      <div id="a-history"></div>
    </div>`;
  renderArtCards();
  renderHistory();
  renderChrome();
  $('view-article').querySelectorAll('.o-ta').forEach(autoSize);
}
/* Bestand, Ampel und Werte – wird bei jeder Buchung aktualisiert, ohne Eingaben zu stören */
function renderArtCards() {
  const box = $('a-cards'), x = S.artEdit; if (!box || !x) return;
  const live = S.articles.find(y => y.id === x.id) || x, st = artStatus({ bestand: live.bestand, minBestand: x.minBestand });
  box.innerHTML = `
      <div class="art-card st-${st}"><label>Bestand</label><b>${esc(fmtNum(live.bestand))}</b><span>${esc(x.einheit)}</span>${artBadge({ bestand: live.bestand, minBestand: x.minBestand })}</div>
      <div class="art-card"><label>Mindestbestand</label><b>${esc(fmtNum(x.minBestand))}</b><span>${esc(x.einheit)}</span></div>
      <div class="art-card"><label>Einzelpreis</label><b>${esc(fmtEuro(x.preis))}</b><span>je ${esc(x.einheit)}</span></div>
      <div class="art-card"><label>Gesamtwert</label><b>${esc(fmtEuro(num(live.bestand) * num(x.preis)))}</b><span>&nbsp;</span></div>`;
}
function renderHistory() {
  const box = $('a-history'); if (!box) return;
  const x = S.artEdit;
  if (!S.bookings.length) { box.innerHTML = '<p class="proto-meta">Noch keine Buchungen.</p>'; return; }
  box.innerHTML = `<table class="service-table hist-table">
    <thead><tr><th>Datum</th><th>Art</th><th>Menge</th><th>Bestand danach</th><th>Grund</th><th>Wer</th></tr></thead>
    <tbody>${S.bookings.map(b => {
      const d = new Date(b.ts || 0), m = num(b.menge);
      const sign = b.typ === 'Zulauf' ? '+' : b.typ === 'Entnahme' ? '−' : (m >= 0 ? '+' : '−');
      return `<tr class="h-${esc(b.typ)}">
        <td data-l="Datum">${esc(d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }))}</td>
        <td data-l="Art">${esc(b.typ)}</td>
        <td data-l="Menge" class="mono">${sign}${esc(fmtNum(Math.abs(m)))} ${esc(x ? x.einheit : '')}</td>
        <td data-l="Bestand" class="mono">${esc(fmtNum(b.bestandNachher))}</td>
        <td data-l="Grund">${esc(b.grund || '')}</td>
        <td data-l="Wer">${esc(b.von || '')}</td></tr>`;
    }).join('')}</tbody></table>`;
}

async function onArticleInput(t, type) {
  const x = S.artEdit;
  if (!amAdmin()) return;
  if (t.dataset.af) {
    const f = t.dataset.af;
    if ((f === 'kat' || f === 'lagerort') && t.value === '__neu__') {
      if (type !== 'change') return;
      const label = f === 'kat' ? 'Name der neuen Kategorie:' : 'Name des neuen Lagerorts:';
      const v = ((await promptModal(label, 'Hinzufügen')) || '').trim();
      if (!v) { t.value = x[f]; return; }
      const key = f === 'kat' ? 'kategorien' : 'lagerorte';
      const list = [...new Set([...(S.lagerCfg[key] || []), v])];
      S.lagerCfg = { ...S.lagerCfg, [key]: list };
      S.store.saveLagerCfg({ [key]: list }).catch(() => {});
      x[f] = v; renderArticle(); queueArtSave(); return;
    }
    x[f] = (f === 'minBestand' || f === 'preis') ? t.value : t.value;
    if (t.tagName === 'TEXTAREA') autoSize(t);
    if (f === 'name') $('main-title').textContent = t.value || 'Artikel';
    if (f === 'minBestand' || f === 'preis' || f === 'einheit') renderArtCards();
    queueArtSave();
  } else if (t.dataset.sf) {
    const s = x.suppliers[+t.dataset.idx]; if (!s) return;
    s[t.dataset.sf] = t.value; queueArtSave();
  }
}
let artSaveTimer = null;
function queueArtSave() {
  S.artDirty = true;
  const el = $('a-saved'); if (el) el.textContent = 'wird gespeichert …';
  clearTimeout(artSaveTimer); artSaveTimer = setTimeout(saveArtNow, 600);
}
function saveArtNow() {
  clearTimeout(artSaveTimer); artSaveTimer = null;
  const x = S.artEdit;
  if (!x || !S.artDirty || !amAdmin()) return;
  S.artDirty = false;
  const d = {};
  ART_FIELDS.forEach(f => { d[f] = x[f]; });
  d.minBestand = num(d.minBestand); d.preis = num(d.preis);
  d.suppliers = x.suppliers.map(s => ({ name: String(s.name || '').trim(), bestellNr: String(s.bestellNr || '').trim(), gebinde: String(s.gebinde || '').trim(), preis: num(s.preis) }));
  ['sku', 'barcode', 'name', 'gebinde', 'notes'].forEach(f => { d[f] = String(d[f] || '').trim(); });
  const local = S.articles.find(y => y.id === x.id); if (local) Object.assign(local, d);
  S.store.saveArticle(x.id, d, S.me, false)
    .then(() => { const el = $('a-saved'); if (el && !S.artDirty) el.textContent = 'gespeichert ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); })
    .catch((err) => { if (err && err.code === 'permission-denied') adminRejected(); else { S.artDirty = true; setTimeout(saveArtNow, 3000); } });
}
function flushArtSave() { if (artSaveTimer) saveArtNow(); }

async function doBooking(typ, quick) {
  const x = quick ? S.articles.find(y => y.id === S.expandedArt) : S.artEdit; if (!x) return;
  const qEl = $(quick ? 'qd-qty' : 'bk-qty'), nEl = $(quick ? 'qd-note' : 'bk-note');
  const qty = num(qEl.value);
  if (!(qty > 0)) { showToast('Bitte eine Menge größer 0 eingeben'); qEl.focus(); return; }
  const grund = nEl.value.trim();
  try {
    const neu = await S.store.book(x.id, { typ, menge: qty, grund }, S.me);
    if ($(qEl.id)) $(qEl.id).value = ''; if ($(nEl.id)) $(nEl.id).value = '';
    showToast(`${typ === 'Zulauf' ? 'Zulauf' : 'Entnahme'} gebucht – Bestand ${fmtNum(neu)} ${x.einheit}`);
  } catch (e) {
    if (e && e.code === 'zu-wenig') showToast(`Nur ${fmtNum(e.bestand)} ${x.einheit} am Lager – Entnahme nicht gebucht`);
    else if (e && e.code === 'permission-denied') showToast('Buchung abgelehnt – bitte erneut versuchen');
    else showToast((e && e.message) || 'Buchen fehlgeschlagen');
  }
}
async function doInventur() {
  const x = S.artEdit; if (!x || !amAdmin()) return;
  const live = S.articles.find(y => y.id === x.id) || x;
  const v = await promptModal(`Gezählter Bestand für „${x.name}“ (${x.einheit}). Aktuell: ${fmtNum(live.bestand)}`, 'Bestand festlegen', { value: String(fmtNum(live.bestand)), inputmode: 'decimal' });
  if (v === null) return;
  const n = num(v);
  if (!(n >= 0) || String(v).trim() === '') { showToast('Bitte einen Bestand ab 0 eingeben'); return; }
  try {
    await S.store.book(x.id, { typ: 'Korrektur', menge: n, grund: 'Inventur / Bestandskorrektur' }, S.me);
    showToast('Bestand auf ' + fmtNum(n) + ' ' + x.einheit + ' gesetzt');
  } catch (e) { if (e && e.code === 'permission-denied') adminRejected(); else showToast((e && e.message) || 'Korrektur fehlgeschlagen'); }
}
async function deleteArticle() {
  const x = S.artEdit; if (!x || !amAdmin()) return;
  if (!(await confirmModal(`Artikel „${x.name}“ samt aller Buchungen endgültig löschen?`, 'Löschen'))) return;
  try {
    clearTimeout(artSaveTimer); S.artDirty = false;
    await S.store.deleteArticle(x.id);
    closeArticleSubs(); S.openArticleId = null; S.artEdit = null; S.view = 'stock'; render(); showToast('Artikel gelöscht');
  } catch (e) { if (e && e.code === 'permission-denied') adminRejected(); else showToast((e && e.message) || 'Löschen fehlgeschlagen'); }
}

/* ---------- Bestellvorschläge ---------- */
function renderReorder() {
  const low = S.articles.filter(x => artStatus(x) !== 'ok').sort((x, y) => deSort(x.name || '', y.name || ''));
  if (!S.articles.length) { $('view-reorder').innerHTML = '<div class="empty-note">Noch keine Artikel im Lager.</div>'; return; }
  if (!low.length) { $('view-reorder').innerHTML = '<div class="empty-note">✓ Alle Bestände liegen über dem Mindestbestand – nichts nachzubestellen.</div>'; return; }
  $('view-reorder').innerHTML = `
    <p class="proto-meta no-print" style="margin:0 0 10px">Alle Artikel am oder unter dem Mindestbestand. Empfohlen: auf das Doppelte des Mindestbestands auffüllen.
      Stand ${esc(new Date().toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }))}.</p>
    <table class="fleet-table reorder-table">
      <thead><tr><th>Art.-Nr.</th><th>Artikel</th><th>Lagerort</th><th>Bestand</th><th>Mindest</th><th>Empfohlen</th><th>Lieferant</th></tr></thead>
      <tbody>${low.map(x => { const s = (x.suppliers || [])[0] || {}; return `
        <tr class="fleet-row art-row" data-aid="${esc(x.id)}">
          <td data-l="Art.-Nr." class="mono">${esc(x.sku || '—')}</td>
          <td data-l="Artikel"><b>${esc(x.name)}</b> ${artBadge(x)}</td>
          <td data-l="Lagerort">${esc(x.lagerort || '—')}</td>
          <td data-l="Bestand" class="mono">${esc(fmtNum(x.bestand))} ${esc(x.einheit)}</td>
          <td data-l="Mindest" class="mono">${esc(fmtNum(x.minBestand))} ${esc(x.einheit)}</td>
          <td data-l="Empfohlen" class="mono"><b>+${esc(fmtNum(recQty(x)))} ${esc(x.einheit)}</b></td>
          <td data-l="Lieferant">${esc([s.name, s.bestellNr].filter(Boolean).join(' · ') || '—')}</td>
        </tr>`; }).join('')}</tbody>
    </table>`;
}

/* =====================================================================
   Werkstattaufträge
   ===================================================================== */
const ORDER_FIELDS = ['nr', 'created', 'status', 'vehId', 'fahrzeug', 'code', 'werk', 'kz', 'km', 'ow', 'uw', 'datum',
  'rows', 'notes', 'crew', 'erstelltVon', 'source', 'lager', 'svc'];
const ORDER_STATUS = { offen: 'Offen', arbeit: 'In Arbeit', fertig: 'Abgeschlossen' };
const emptyOrderRow = () => ({ id: newId(), text: '', mat: '', h: '', done: false });
const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? 0 : n; };
const fmtHours = (n) => n.toFixed(1).replace('.', ',') + ' h';
const orderHours = (o) => (o.rows || []).reduce((a, r) => a + num(r.h), 0);
function pickOrder(o) { const d = {}; ORDER_FIELDS.forEach(f => { if (o[f] !== undefined) d[f] = o[f]; }); return d; }
function normalizeOrder(o) {
  const d = pickOrder(o);
  d.id = o.id;
  d.status = ORDER_STATUS[d.status] ? d.status : 'offen';
  d.rows = Array.isArray(d.rows) && d.rows.length ? d.rows.map(r => ({ ...emptyOrderRow(), ...r })) : [emptyOrderRow()];
  d.crew = Array.isArray(d.crew) ? d.crew : [];
  d.lager = Array.isArray(d.lager) ? d.lager : [];
  d.svc = Array.isArray(d.svc) ? d.svc : [];     // Servicelisten zum Auftrag: { cat, draft, von, ts, protoId }
  ['fahrzeug', 'code', 'werk', 'kz', 'km', 'ow', 'uw', 'datum', 'notes'].forEach(f => { d[f] = d[f] || ''; });
  return d;
}
const statusBadge = (st) => `<span class="badge st-${esc(st)}">${esc(ORDER_STATUS[st] || st)}</span>`;

function renderOrders() {
  if (S.ordersError) {
    $('orders-list').innerHTML = `<div class="empty-note">${S.ordersError === 'rules'
      ? '<b>Aufträge noch nicht freigeschaltet.</b><br>Die Firebase-Regeln werden beim nächsten Update eingespielt.'
      : 'Die Aufträge konnten nicht geladen werden. Bitte später erneut versuchen.'}</div>`;
    return;
  }
  const q = $('orders-search').value.trim().toLowerCase(), st = S.ordersFilter;
  const list = S.orders
    .filter(o => !st || (st === 'open' ? o.status !== 'fertig' : o.status === st))
    .filter(o => !q || [o.nr, o.fahrzeug, o.code, o.kz, o.werk, o.notes, ...(o.crew || []).map(monteurLabel),
      ...(o.rows || []).flatMap(r => [r.text, r.mat])].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (b.created || 0) - (a.created || 0));
  if (!list.length) {
    $('orders-list').innerHTML = `<div class="empty-note">${S.orders.length
      ? 'Keine Aufträge zu dieser Auswahl.' : 'Noch keine Werkstattaufträge.<br>Über „+ Neuer Auftrag“ den ersten anlegen.'}</div>`;
    return;
  }
  $('orders-list').innerHTML = list.map(o => {
    const done = (o.rows || []).filter(r => r.text && r.done).length, all = (o.rows || []).filter(r => r.text).length;
    return `
    <button class="arch-row order-row" data-oid="${esc(o.id)}" type="button">
      <span class="arch-date">${esc(fmtDay(o.datum) || '')}</span>
      <span class="arch-main">
        <span class="veh"><span class="mono" style="font-size:14px">${esc(o.nr)}</span> · ${esc([o.code, o.fahrzeug].filter(Boolean).join(' · ') || '—')}</span>
        <span class="meta" style="display:block">${esc([o.kz, all ? `${done}/${all} Positionen erledigt` : '', orderHours(o) ? fmtHours(orderHours(o)) : '',
          (o.crew || []).join(', ')].filter(Boolean).join(' · '))}</span>
      </span>
      <span class="badges">${statusBadge(o.status)}${o._pending ? '<span class="badge pend" title="Wird übertragen">⟳</span>' : ''}</span>
    </button>`;
  }).join('');
}

function openOrder(id) {
  const o = S.orders.find(x => x.id === id);
  if (!o) return;
  flushOrderSave();
  S.openOrderId = id; S.orderEdit = normalizeOrder(o); S.orderDirty = false;
  S.view = 'order'; render(); window.scrollTo(0, 0);
}

function orderRowHtml(r, i) {
  return `<tr data-rid="${esc(r.id)}" class="${r.done ? 'is-done' : ''}">
    <td class="pos">${String(i + 1).padStart(2, '0')}</td>
    <td><textarea class="o-ta" data-f="text" rows="1" placeholder="z. B. Hydrauliköl gewechselt, Filter erneuert">${esc(r.text)}</textarea></td>
    <td><div class="o-mat"><textarea class="o-ta" data-f="mat" rows="1" placeholder="Teile-Nr. / Menge">${esc(r.mat)}</textarea>
      <button class="o-mat-lager no-print" data-act="order-stock-row" type="button" title="Material aus dem Lager entnehmen und hier eintragen">+ Lager</button></div></td>
    <td><input class="o-h" data-f="h" inputmode="decimal" placeholder="0,0" value="${esc(r.h)}"></td>
    <td class="center"><input type="checkbox" class="chk-status" data-f="done" ${r.done ? 'checked' : ''} aria-label="erledigt"></td>
    <td class="center no-print"><button class="btn-del-row" data-act="order-del-row" title="Position löschen">✕</button></td>
  </tr>`;
}

/* Abgeschlossene Aufträge dürfen nur Admins (SE, KÖ mit PIN) ändern */
const orderLocked = (o) => !!o && o.status === 'fertig' && !amAdmin();

function renderOrder() {
  const o = S.orderEdit;
  if (!o) { S.view = 'orders'; render(); return; }
  const admin = amAdmin();
  const locked = orderLocked(o);
  const vehLine = [o.kz, o.werk ? 'Werk-Nr. ' + o.werk : ''].filter(Boolean).join(' · ');
  const created = o.created ? new Date(o.created).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '';
  const src = o.source ? S.protocols.find(p => p.id === o.source) : null;
  $('view-order').innerHTML = `
    <div class="proto-banner no-print">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button class="btn-sec" data-act="back-orders">← Alle Aufträge</button>
        <span class="o-saved" id="o-saved"></span>
      </div>
      <div class="actions">
        <select id="o-status" class="o-status" data-f="status" aria-label="Status" ${locked ? 'disabled' : ''}>
          ${Object.entries(ORDER_STATUS).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        ${admin ? '<button class="btn-sec btn-danger" data-act="delete-order">🗑️ Löschen</button>' : ''}
      </div>
    </div>

    <div class="box">
      <div class="sec-title"><div class="title-left"><span>Auftrag <span class="mono" style="font-size:16px">${esc(o.nr)}</span></span></div><span id="o-badge">${statusBadge(o.status)}</span></div>
      ${locked ? '<p class="o-locked no-print">🔒 Abgeschlossen – ändern können nur die Admins (SE, KÖ).</p>' : ''}
      <div class="o-grid">
        <div class="o-field o-veh">
          <label>Fahrzeug</label>
          <button type="button" class="o-veh-btn" data-act="order-vehicle" title="Fahrzeug ändern">
            <b>${esc([o.code, o.fahrzeug].filter(Boolean).join(' · ') || 'Fahrzeug wählen …')}</b>
            <small>${esc(vehLine)}</small>
          </button>
        </div>
        <div class="o-field"><label for="o-km">Km-Stand</label><input id="o-km" data-f="km" inputmode="numeric" value="${esc(o.km)}" placeholder="0"></div>
        <div class="o-field"><label for="o-ow">Std. OW</label><input id="o-ow" data-f="ow" inputmode="decimal" value="${esc(o.ow)}" placeholder="0"></div>
        <div class="o-field"><label for="o-uw">Std. UW</label><input id="o-uw" data-f="uw" inputmode="decimal" value="${esc(o.uw)}" placeholder="0"></div>
        <div class="o-field"><label for="o-datum">Datum</label><input id="o-datum" data-f="datum" type="date" value="${esc(o.datum)}"></div>
      </div>
    </div>

    <div class="box">
      <div class="sec-title"><div class="title-left"><span>Durchgeführte Arbeiten</span></div></div>
      <table class="service-table o-rows">
        <thead><tr>
          <th class="o-c-pos">Pos</th><th>Arbeit / Beschreibung</th><th class="o-c-mat">Material / Teile</th>
          <th class="o-c-h">Std.</th><th class="col-status">Erl.</th><th class="col-act no-print"></th>
        </tr></thead>
        <tbody id="o-rows">${o.rows.map(orderRowHtml).join('')}</tbody>
      </table>
      <div class="box-actions" style="justify-content:space-between;align-items:center">
        <button class="btn-sec no-print" data-act="order-add-row">+ Position</button>
        <span class="o-sum">Summe Arbeitsstunden <b id="o-sum">${fmtHours(orderHours(o))}</b></span>
      </div>
    </div>

    <div class="box">
      <div class="sec-title"><div class="title-left"><span>Material aus dem Lager</span></div>
        <button class="btn-sec no-print" data-act="order-stock-add" type="button">+ Aus Lager entnehmen</button></div>
      <div id="o-lager"></div>
    </div>

    <div class="box">
      <div class="sec-title"><div class="title-left"><span>Serviceliste</span></div>
        <button class="btn-sec no-print" data-act="order-add-service" type="button" id="o-svc-btn">📋 Serviceliste hinzufügen</button></div>
      <div id="o-svc"></div>
    </div>

    <div class="box">
      <div class="sec-title"><div class="title-left"><span>Bemerkungen / Mängel</span></div></div>
      <textarea class="o-ta o-notes" data-f="notes" rows="3" placeholder="Auffälligkeiten, offene Punkte, Folgeauftrag …">${esc(o.notes)}</textarea>
    </div>

    <div class="box monteure">
      <div class="sec-title"><div class="title-left"><span>Ausführende Mitarbeiter</span></div></div>
      <div class="o-crew no-print" id="o-crew"></div>
      <div class="ms-print" id="o-crew-print"></div>
    </div>
    <p class="proto-meta">${esc([created ? 'angelegt ' + created + (o.erstelltVon ? ' von ' + o.erstelltVon : '') : '',
      src ? 'aus Serviceprotokoll ' + src.category + ' vom ' + fmtDate(src) : ''].filter(Boolean).join(' · '))}</p>
    <div class="o-done no-print">
      <button class="btn-big o-done-btn" data-act="order-done" type="button">${locked ? 'Schließen' : S.orderIsNew === o.id ? '✓ Auftrag anlegen' : '✓ Auftrag speichern'}</button>
    </div>`;
  renderOrderCrew();
  renderOrderStock();
  renderOrderService();
  if (locked) lockOrderView();
  renderChrome();                       // erst sichtbar machen, dann Höhen berechnen
  sizeOrderTextareas();
}
/* Schreibschutz für abgeschlossene Aufträge (Nicht-Admins) */
function lockOrderView() {
  const v = $('view-order');
  v.querySelectorAll('input, textarea, select').forEach(el => { el.disabled = true; });
  v.querySelectorAll('[data-act="order-add-row"], [data-act="order-del-row"], [data-act="order-stock-add"], [data-act="order-stock-del"], [data-act="order-stock-row"], [data-act="order-add-service"], [data-act="order-svc-del"]').forEach(el => el.classList.add('hidden'));
  v.querySelectorAll('[data-act="order-vehicle"], [data-act="order-crew"]').forEach(el => { el.disabled = true; });
}
/* Admin ändert einen abgeschlossenen Auftrag und es ist nicht mehr alles erledigt → wieder „Offen“ */
function reopenIfIncomplete() {
  const o = S.orderEdit;
  if (!o || o.status !== 'fertig' || !amAdmin()) return;
  const open = o.rows.some(r => (String(r.text || '').trim() || String(r.mat || '').trim() || String(r.h || '').trim()) && !r.done);
  if (!open) return;
  o.status = 'offen';
  if ($('o-status')) $('o-status').value = 'offen';
  if ($('o-badge')) $('o-badge').innerHTML = statusBadge('offen');
  showToast('Nicht alle Positionen erledigt – Auftrag wieder auf „Offen“ gesetzt');
}
/* Textfelder an ihren Inhalt anpassen – nur wenn sichtbar (sonst ergibt die Messung 0) */
function sizeOrderTextareas() {
  const run = () => $('view-order').querySelectorAll('.o-ta').forEach(autoSize);
  run();
  requestAnimationFrame(run);                                   // nach dem Zeichnen nochmals
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(run);   // nach dem Laden der Schrift
}
function renderOrderCrew() {
  const o = S.orderEdit;
  $('o-crew').innerHTML = MONTEURE.map(m => `<button type="button" class="o-chip ${o.crew.includes(m.code) ? 'on' : ''}" data-act="order-crew" data-code="${esc(m.code)}">
    <code>${esc(m.code)}</code>${esc(m.name)}</button>`).join('');
  $('o-crew-print').textContent = o.crew.map(monteurLabel).join(', ') || '—';
}
/* ---------- Material aus dem Lager im Auftrag ---------- */
function renderOrderStock() {
  const o = S.orderEdit, box = $('o-lager'); if (!box) return;
  if (!o.lager.length) { box.innerHTML = '<p class="proto-meta">Noch kein Material aus dem Lager entnommen.</p>'; return; }
  const locked = orderLocked(o);
  box.innerHTML = `<table class="service-table ol-table">
    <thead><tr><th>Pos.</th><th>Art.-Nr.</th><th>Artikel</th><th>Menge</th><th>Entnommen</th><th class="col-act no-print"></th></tr></thead>
    <tbody>${o.lager.map(m => { const pi = m.rid ? o.rows.findIndex(r => r.id === m.rid) : -1; return `<tr>
      <td data-l="Pos." class="mono">${pi >= 0 ? String(pi + 1).padStart(2, '0') : '—'}</td>
      <td data-l="Art.-Nr." class="mono">${esc(m.sku || '—')}</td>
      <td data-l="Artikel"><b>${esc(m.name)}</b></td>
      <td data-l="Menge" class="mono">${esc(fmtNum(m.menge))} ${esc(m.einheit || '')}</td>
      <td data-l="Entnommen">${esc(new Date(m.ts || 0).toLocaleDateString('de-DE'))} · ${esc(m.von || '')}</td>
      <td class="col-act no-print">${locked ? '' : `<button class="btn-del-row" data-act="order-stock-del" data-mid="${esc(m.id)}" title="Zurück ins Lager buchen">✕</button>`}</td>
    </tr>`; }).join('')}</tbody></table>`;
}
const orderBookingText = (o) => 'Auftrag ' + o.nr + ([o.code, o.fahrzeug].filter(Boolean).length ? ' · ' + [o.code, o.fahrzeug].filter(Boolean).join(' ') : '');
function saveOrderImmediately() { S.orderDirty = true; saveOrderNow(); }

/* Auswahl: Artikel suchen → Menge → als Entnahme buchen und im Auftrag festhalten */
function openOrderStockPicker(rid) {
  const o = S.orderEdit; if (!o || orderLocked(o)) return;
  const row = rid ? o.rows.find(r => r.id === rid) : null;
  const pos = row ? String(o.rows.indexOf(row) + 1).padStart(2, '0') : '';
  if (S.lagerError) { showToast('Das Lager ist noch nicht verfügbar'); return; }
  const ov = $('setup');
  let sel = null;
  ov.innerHTML = `<div class="setup-card osp-card">${cardHead}
    <h3>Material aus dem Lager</h3>
    <p>Wird als Entnahme mit <b>Auftrag ${esc(o.nr)}</b> gebucht${pos ? ` und bei <b>Position ${pos}</b> unter „Material / Teile“ eingetragen` : ''}.</p>
    <div class="field bc-wrap"><input id="osp-q" placeholder="Artikel suchen: Name, Art.-Nr. …" autocomplete="off"><button class="scan-btn" type="button" data-n="scan" title="Barcode scannen">📷</button></div>
    <div id="osp-list" class="osp-list"></div>
    <form id="osp-form" class="osp-form hidden" novalidate>
      <div class="osp-sel" id="osp-sel"></div>
      <div class="field"><label for="osp-qty" id="osp-qty-l">Menge</label><input id="osp-qty" inputmode="decimal" autocomplete="off"></div>
      <button class="btn-big" type="submit">Entnehmen</button>
    </form>
    <div class="setup-err" id="osp-err"></div>
    <div class="setup-back"><button class="link-btn" data-n="close" type="button">Abbrechen</button></div>
  </div>`;
  ov.classList.remove('hidden');
  const list = () => {
    const q = $('osp-q').value.trim().toLowerCase();
    const arts = S.articles.filter(x => !q || [x.sku, x.name, x.kat, x.lagerort].join(' ').toLowerCase().includes(q))
      .sort((x, y) => deSort(x.name || '', y.name || ''));
    $('osp-list').innerHTML = arts.length ? arts.map(x => `<button type="button" class="osp-item${sel && sel.id === x.id ? ' on' : ''}" data-aid="${esc(x.id)}" ${num(x.bestand) <= 0 ? 'disabled' : ''}>
        <span><b>${esc(x.name)}</b><small>${esc([x.sku, x.lagerort].filter(Boolean).join(' · '))}</small></span>
        <span class="mono">${esc(fmtNum(x.bestand))} ${esc(x.einheit || '')}</span></button>`).join('')
      : `<p class="proto-meta">${S.articles.length ? 'Kein Artikel gefunden.' : 'Noch keine Artikel im Lager.'}</p>`;
  };
  list();
  setTimeout(() => $('osp-q') && $('osp-q').focus(), 30);
  const close = () => { ov.classList.add('hidden'); ov.onclick = null; ov.onsubmit = null; ov.oninput = null; };
  ov.oninput = (e) => { if (e.target.id === 'osp-q') list(); };
  ov.onclick = async (e) => {
    if (e.target.closest('[data-n="close"]')) { close(); return; }
    if (e.target.closest('[data-n="scan"]')) {
      const code = await scanBarcode('Artikel scannen'); if (!code) return;
      const x = findArticleByCode(code);
      if (!x) { $('osp-err').textContent = `Code ${code} ist keinem Artikel zugeordnet.`; return; }
      if (num(x.bestand) <= 0) { $('osp-err').textContent = `${x.name}: nichts am Lager.`; return; }
      $('osp-q').value = ''; list();
      const b2 = ov.querySelector(`.osp-item[data-aid="${CSS.escape(x.id)}"]`); if (b2) b2.click();
      return;
    }
    const it = e.target.closest('.osp-item');
    if (it && !it.disabled) {
      sel = S.articles.find(x => x.id === it.dataset.aid); if (!sel) return;
      list();
      $('osp-form').classList.remove('hidden');
      $('osp-sel').innerHTML = `<b>${esc(sel.name)}</b> · am Lager ${esc(fmtNum(sel.bestand))} ${esc(sel.einheit || '')}`;
      $('osp-qty-l').textContent = `Menge (${sel.einheit || 'Stk.'})`;
      $('osp-err').textContent = '';
      $('osp-qty').focus();
    }
  };
  ov.onsubmit = async (e) => {
    e.preventDefault();
    if (!sel) return;
    const qty = num($('osp-qty').value);
    if (!(qty > 0)) { $('osp-err').textContent = 'Bitte eine Menge größer 0 eingeben.'; return; }
    const btn = ov.querySelector('#osp-form button[type="submit"]');
    btn.disabled = true; $('osp-err').textContent = 'wird gebucht …';
    try {
      const neu = await S.store.book(sel.id, { typ: 'Entnahme', menge: qty, grund: orderBookingText(o) }, S.me);
      if (S.orderEdit && S.orderEdit.id === o.id) {
        const entry = { id: newId(), aid: sel.id, name: sel.name || '', sku: sel.sku || '', einheit: sel.einheit || '', menge: qty, ts: Date.now(), von: S.me || '' };
        const r = rid && S.orderEdit.rows.find(x => x.id === rid);
        if (r) {   // auch bei der Position unter „Material / Teile“ eintragen
          entry.rid = rid;
          entry.matText = [sel.sku, sel.name].filter(Boolean).join(' ') + ' – ' + fmtNum(qty) + ' ' + (sel.einheit || '');
          r.mat = [String(r.mat || '').trim(), entry.matText].filter(Boolean).join('\n');
          const ta = $('view-order').querySelector(`tr[data-rid="${rid}"] textarea[data-f="mat"]`); if (ta) { ta.value = r.mat; autoSize(ta); }
        }
        S.orderEdit.lager.push(entry);
        saveOrderImmediately(); renderOrderStock();
      }
      close();
      showToast(`${fmtNum(qty)} ${sel.einheit || ''} ${sel.name} entnommen – Restbestand ${fmtNum(neu)}`);
    } catch (err) {
      btn.disabled = false;
      $('osp-err').textContent = err && err.code === 'zu-wenig' ? `Nur ${fmtNum(err.bestand)} ${sel.einheit || ''} am Lager.`
        : (err && err.message) || 'Buchen fehlgeschlagen.';
    }
  };
}
async function removeOrderStock(mid) {
  const o = S.orderEdit; if (!o || orderLocked(o)) return;
  const m = o.lager.find(x => x.id === mid); if (!m) return;
  const art = S.articles.find(x => x.id === m.aid);
  if (!art) {
    if (!(await confirmModal(`„${m.name}“ gibt es im Lager nicht mehr. Nur aus dem Auftrag entfernen?`, 'Entfernen'))) return;
  } else if (!(await confirmModal(`${fmtNum(m.menge)} ${m.einheit} „${m.name}“ wieder ins Lager zurückbuchen und aus dem Auftrag entfernen?`, 'Zurückbuchen'))) return;
  try {
    if (art) await S.store.book(m.aid, { typ: 'Zulauf', menge: num(m.menge), grund: 'Rückgabe aus ' + orderBookingText(o) }, S.me);
    const cur = S.orderEdit && S.orderEdit.id === o.id ? S.orderEdit : o;
    cur.lager = cur.lager.filter(x => x.id !== mid);
    const r = m.rid && cur.rows.find(x => x.id === m.rid);
    if (r && m.matText) {   // Eintrag bei der Position wieder herausnehmen
      r.mat = String(r.mat || '').split('\n').filter((l, i, arr) => l !== m.matText || arr.indexOf(m.matText) !== i).join('\n');
      const ta = $('view-order').querySelector(`tr[data-rid="${m.rid}"] textarea[data-f="mat"]`); if (ta) { ta.value = r.mat; autoSize(ta); }
    }
    saveOrderImmediately(); renderOrderStock();
    showToast(art ? 'Zurück ins Lager gebucht' : 'Aus dem Auftrag entfernt');
  } catch (err) { showToast((err && err.message) || 'Rückbuchung fehlgeschlagen'); }
}

/* ---------- Serviceliste zum Auftrag ---------- */
/* Fahrzeuggruppe (Fuhrpark) → Kategorie der Serviceliste */
const GROUP_CAT = { krane: 'Kran', ladekrane: 'Ladekran', zugmaschinen: 'LKW', bf3: 'BF3', pkw: 'PKW' };
const orderVehicle = (o) => S.vehicles.find(v => v.id === o.vehId) || (o.code ? S.vehicles.find(v => v.code === o.code) : null) || null;
const catForVehicle = (v) => v ? GROUP_CAT[String(v.gruppe || '').toLowerCase()] || null : null;
const draftHasData = (d) => !!(d && ((d.header && String(d.header.fId || '').trim()) || Object.keys(d.status || {}).length || Object.values(d.notes || {}).some(Boolean)));
/* Laufende (noch nicht abgeschlossene) Servicelisten dieses Geräts zu einem Auftrag */
const draftsForOrder = (oid) => CATEGORIES.filter(c => { const d = c === S.cat ? draft : loadDraft(c); return d.header && d.header.orderId === oid; });
function renderOrderService() {
  const o = S.orderEdit, box = $('o-svc'); if (!box || !o) return;
  const locked = orderLocked(o);
  const running = draftsForOrder(o.id).filter(c => !o.svc.some(x => x.cat === c && x.ts >= ((c === S.cat ? draft : loadDraft(c)).svcTs || 0)));
  const cat = catForVehicle(orderVehicle(o));
  const btn = $('o-svc-btn'); if (btn) btn.textContent = '📋 Serviceliste hinzufügen' + (cat ? ` (${cat})` : '');
  const rows = o.svc.map((x, i) => { const st = protoStats(buildProtocolFrom(x.cat, x.draft)); return `<div class="o-svc-item">
      <button type="button" class="o-svc-row" data-act="order-svc-open" data-idx="${i}">
        ${st.open ? `<span class="badge bad">${st.open} n.i.O.</span>` : `<span class="badge ok">${st.ok + st.fixed}/${st.total} i.O.</span>`}
        <b>Serviceliste ${esc(x.cat)}</b>
        <small>${x.protoId ? 'mit Auftragsabschluss in Archiv und Fahrzeug-Historie übernommen' : 'im Auftrag gespeichert'} · ${esc(x.von || '')} · ${esc(new Date(x.ts || 0).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }))}</small>
      </button>${locked ? '' : `<button class="btn-del-row no-print" data-act="order-svc-del" data-idx="${i}" title="Aus dem Auftrag entfernen">✕</button>`}</div>`; }).join('');
  const runs = running.map(c => `<div class="o-svc-item"><button type="button" class="o-svc-row" data-act="order-open-draft" data-cat="${esc(c)}">
      <span class="badge pend">in Arbeit</span><b>Serviceliste ${esc(c)}</b><small>auf diesem Gerät, noch nicht zum Auftrag hinzugefügt – weiter ausfüllen</small></button></div>`).join('');
  box.innerHTML = (rows || runs) ? `<div class="o-svc-list">${runs}${rows}</div>`
    : `<p class="proto-meta">Noch keine Serviceliste zu diesem Auftrag.${cat ? '' : ' Für die Fahrzeuggruppe gibt es keine feste Liste – die Kategorie wird beim Hinzufügen gewählt.'}</p>`;
}
/* Serviceliste aus dem Auftrag öffnen (zum Weiterbearbeiten bzw. Ansehen) */
async function openOrderSvc(idx) {
  const o = S.orderEdit; const x = o && o.svc[idx]; if (!x) return;
  if (orderLocked(o)) {                       // abgeschlossen: nur ansehen
    if (x.protoId && S.protocols.some(p => p.id === x.protoId)) { flushOrderSave(); S.openId = x.protoId; S.view = 'protocol'; render(); window.scrollTo(0, 0); }
    else showToast('Der Auftrag ist abgeschlossen – ändern können nur SE und KÖ');
    return;
  }
  const cur = x.cat === S.cat ? draft : loadDraft(x.cat);
  if (draftHasData(cur) && !(cur.header && cur.header.orderId === o.id)
      && !(await confirmModal(`In der Serviceliste ${x.cat} sind auf diesem Gerät noch andere Eingaben${cur.header.fId ? ` („${cur.header.fId}“)` : ''}. Verwerfen und die Liste aus dem Auftrag öffnen?`, 'Öffnen'))) return;
  const d = JSON.parse(JSON.stringify(x.draft)); d.svcTs = x.ts;
  lsSet(draftKey(x.cat), JSON.stringify(d));
  openOrderDraft(x.cat);
}
/* „✓ Zum Auftrag hinzufügen“: laufende Serviceliste im Auftrag speichern (für alle Geräte sichtbar) */
async function saveDraftToOrder() {
  const oid = draft.header && draft.header.orderId;
  const base = oid && (S.orderEdit && S.orderEdit.id === oid ? S.orderEdit : S.orders.find(x => x.id === oid));
  if (!base) { showToast('Der Auftrag wurde nicht gefunden'); return; }
  const o = S.orderEdit && S.orderEdit.id === oid ? S.orderEdit : normalizeOrder(base);
  if (orderLocked(o)) { showToast('Der Auftrag ist abgeschlossen – ändern können nur SE und KÖ'); return; }
  const { svcTs, ...clean } = JSON.parse(JSON.stringify(draft));
  const entry = { cat: S.cat, draft: clean, von: S.me || '', ts: Date.now() };
  const i = o.svc.findIndex(x => x.cat === S.cat);
  if (i >= 0) o.svc[i] = entry; else o.svc.push(entry);
  const data = pickOrder(o); data.rows = o.rows.map(r => ({ id: r.id, text: r.text || '', mat: r.mat || '', h: r.h || '', done: !!r.done }));
  const local = S.orders.find(x => x.id === oid); if (local) local.svc = o.svc;
  S.store.saveOrder(oid, data, S.me).catch((err) => showToast(err && err.code === 'permission-denied' ? 'Nicht gespeichert – der Auftrag ist abgeschlossen' : 'Speichern fehlgeschlagen'));
  draft = emptyDraft(); saveDraft();
  openOrder(oid);
  showToast(`Serviceliste ${entry.cat} zum Auftrag ${o.nr} hinzugefügt`);
}
/* Beim Abschließen des Auftrags: Servicelisten ins Archiv (→ auch in die Historie des Fahrzeugs) */
async function archiveOrderServices(o) {
  if (!o || !o.svc.length) return;
  let changed = false;
  for (const x of o.svc) {
    if (x.protoId && x.archivedTs === x.ts) continue;
    const p = buildProtocolFrom(x.cat, x.draft, x.von || S.me);
    p.header = { ...p.header, orderId: o.id, orderNr: o.nr };
    p.ts = Date.now();
    try {
      if (x.protoId && amAdmin() && S.protocols.some(q => q.id === x.protoId)) await S.store.deleteProtocol(x.protoId).catch(() => {});
      x.protoId = await S.store.addProtocol(p); x.archivedTs = x.ts; changed = true;
      const veh = p.header.vehId && S.vehicles.find(v => v.id === p.header.vehId);
      const day = /^\d{4}-\d{2}-\d{2}$/.test(p.header.fDate || '') ? p.header.fDate : todayIso();
      if (veh && (!veh.letzterService || day > veh.letzterService)) S.store.setLastService(veh.id, day, S.me).catch(() => {});
    } catch (e) { showToast('Serviceliste konnte nicht ins Archiv übernommen werden'); }
  }
  if (changed) { queueOrderSave(); showToast('Auftrag abgeschlossen – Serviceliste ins Archiv und in die Fahrzeug-Historie übernommen'); }
}
function pickCategory(suggest) {
  return new Promise((resolve) => {
    const ov = $('setup');
    ov.innerHTML = `<div class="setup-card">${cardHead}<h3>Welche Serviceliste?</h3>
      <p>Für dieses Fahrzeug ist keine Liste fest zugeordnet. Bitte die passende wählen.</p>
      <div class="set-list">${CATEGORIES.map(c => `<button class="set-btn" type="button" data-c="${esc(c)}">Serviceliste ${esc(c)}${c === suggest ? ' <small>vorgeschlagen</small>' : ''}</button>`).join('')}</div>
      <div class="setup-back"><button class="link-btn" data-c="" type="button">Abbrechen</button></div></div>`;
    ov.classList.remove('hidden');
    ov.onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; ov.classList.add('hidden'); ov.onclick = null; resolve(b.dataset.c || null); };
  });
}
async function addServiceToOrder() {
  const o = S.orderEdit; if (!o || orderLocked(o)) return;
  const v = orderVehicle(o);
  let cat = catForVehicle(v);
  if (!cat) { cat = await pickCategory(); if (!cat) return; }
  flushOrderSave(); flushTemplateSave();
  const have = o.svc.findIndex(x => x.cat === cat);
  if (have >= 0) { openOrderSvc(have); return; }      // gibt es schon im Auftrag → dort weiter
  const cur = cat === S.cat ? draft : loadDraft(cat);
  if (cur.header && cur.header.orderId === o.id) { openOrderDraft(cat); return; }      // läuft schon → weiter ausfüllen
  if (draftHasData(cur) && !(await confirmModal(`In der Serviceliste ${cat} sind auf diesem Gerät schon Eingaben${cur.header.fId ? ` für „${cur.header.fId}“` : ''}, die noch nicht abgeschlossen sind. Verwerfen und neu für diesen Auftrag beginnen?`, 'Neu beginnen'))) return;
  const d = emptyDraft();
  d.header = { ...d.header, fId: v ? vehicleLabel(v) : (o.fahrzeug || o.code || ''), fKm: o.km || '', fOw: o.ow || '', fUw: o.uw || '', fDate: o.datum || todayIso(),
    orderId: o.id, orderNr: o.nr };
  if (v) Object.assign(d.header, { vehId: v.id, kz: v.kz || '', werk: v.werk || '', typ: v.typ || '' });
  d.monteure = [...(o.crew || [])];
  lsSet(draftKey(cat), JSON.stringify(d));
  openOrderDraft(cat);
  showToast(`Serviceliste ${cat} für Auftrag ${o.nr} begonnen`);
}
function openOrderDraft(cat) {
  flushOrderSave();
  if (S.edit) { S.edit = false; S.editTpl = null; }
  S.cat = cat; lsSet('kds_cat', cat); draft = loadDraft(cat);
  S.view = 'list'; render(); window.scrollTo(0, 0);
}
/* Hinweis über der Serviceliste, wenn sie zu einem Auftrag gehört */
function renderOrderLink() {
  const el = $('order-link'); if (!el) return;
  const oid = S.view === 'list' && !S.edit && draft.header && draft.header.orderId;
  const o = oid && S.orders.find(x => x.id === oid);
  el.classList.toggle('hidden', !oid);
  if (!oid) { el.innerHTML = ''; return; }
  el.innerHTML = `<span>📋 Gehört zu <b>Auftrag ${esc(o ? o.nr : draft.header.orderNr || '')}</b> – mit „✓ Zum Auftrag hinzufügen“ wird sie dort gespeichert.</span>
    ${o ? `<button class="btn-sec" data-act="order-link-open" type="button">← Zum Auftrag</button>` : ''}`;
}

function autoSize(ta) {
  if (!ta.offsetParent) return;          // unsichtbar: nicht messen
  ta.style.height = 'auto';
  ta.style.height = (ta.scrollHeight + 2) + 'px';
}
window.addEventListener('resize', () => { if (S.view === 'order') sizeOrderTextareas(); });

function onOrderInput(t) {
  const o = S.orderEdit, f = t.dataset.f;
  if (!f || orderLocked(o)) return;
  const tr = t.closest('tr[data-rid]');
  if (tr) {
    const r = o.rows.find(x => x.id === tr.dataset.rid);
    if (!r) return;
    r[f] = t.type === 'checkbox' ? t.checked : t.value;
    if (f === 'done') tr.classList.toggle('is-done', t.checked);
    if (f === 'h') $('o-sum').textContent = fmtHours(orderHours(o));
  } else {
    o[f] = t.value;
    if (f === 'status') { renderOrder(); if (t.value === 'fertig') archiveOrderServices(o); }
  }
  if (f !== 'status') reopenIfIncomplete();
  if (t.tagName === 'TEXTAREA') autoSize(t);
  queueOrderSave();
}
function addOrderRow() {
  if (orderLocked(S.orderEdit)) return;
  S.orderEdit.rows.push(emptyOrderRow());
  renderOrder(); queueOrderSave();
  const all = $('view-order').querySelectorAll('textarea[data-f="text"]');
  all[all.length - 1].focus();
}
// Fuhrpark: Doppelklick bzw. Enter auf einer Zeile öffnet das Fahrzeug direkt
document.addEventListener('dblclick', (e) => { if (e.target.closest && e.target.closest('.fe-in')) return; const r = e.target.closest && e.target.closest('#fleet-list .fleet-row'); if (r) { S.selVeh = r.dataset.vid; openAkte(r.dataset.vid); } });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches && e.target.matches('#fleet-list .fe-in')) { e.target.blur(); return; }
  if (e.key === 'Enter' && e.target.matches && e.target.matches('#fleet-list .fleet-row')) { S.selVeh = e.target.dataset.vid; openAkte(e.target.dataset.vid); }
});
// Enter in „Arbeit“ = neue Position (Umschalt+Enter = neue Zeile im Feld)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && e.target.matches && e.target.matches('#view-order textarea[data-f="text"]')) {
    e.preventDefault(); addOrderRow();
  }
});

let orderSaveTimer = null;
function queueOrderSave() {
  S.orderDirty = true;
  const el = $('o-saved'); if (el) el.textContent = 'wird gespeichert …';
  clearTimeout(orderSaveTimer);
  orderSaveTimer = setTimeout(saveOrderNow, 600);
}
function saveOrderNow() {
  clearTimeout(orderSaveTimer); orderSaveTimer = null;
  const o = S.orderEdit;
  if (!o || !S.orderDirty) return;
  S.orderDirty = false;
  const data = pickOrder(o);
  data.rows = o.rows.map(r => ({ id: r.id, text: r.text || '', mat: r.mat || '', h: r.h || '', done: !!r.done }));
  const local = S.orders.find(x => x.id === o.id); if (local) Object.assign(local, data);
  S.store.saveOrder(o.id, data, S.me)
    .then(() => { const el = $('o-saved'); if (el && S.openOrderId === o.id && !S.orderDirty) el.textContent = 'gespeichert ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); })
    .catch((err) => {
      if (err && err.code === 'permission-denied') {
        // z. B. Auftrag wurde inzwischen abgeschlossen: Stand vom Server übernehmen, nicht endlos wiederholen
        const remote = S.orders.find(x => x.id === o.id);
        showToast('Änderung nicht gespeichert – der Auftrag ist abgeschlossen (nur SE/KÖ)');
        if (remote && S.openOrderId === o.id) { S.orderEdit = normalizeOrder(remote); renderOrder(); }
        return;
      }
      S.orderDirty = true; const el = $('o-saved'); if (el) el.textContent = 'nicht gespeichert – erneuter Versuch …'; setTimeout(saveOrderNow, 3000);
    });
  const el = $('o-saved'); if (el) el.textContent = navigator.onLine ? 'wird gespeichert …' : 'offline gespeichert – wird übertragen';
}
function flushOrderSave() { if (orderSaveTimer) saveOrderNow(); }
window.addEventListener('pagehide', flushOrderSave);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushOrderSave(); });

/* Neuer Auftrag bzw. Fahrzeug wechseln: Fahrzeug aus dem Fuhrpark wählen */
function openNewOrder(pre = {}) {
  const ov = $('setup');
  const change = !!pre.change;
  const vehicles = sortVehicles(S.vehicles);
  const curVeh = change ? (S.orderEdit && S.orderEdit.vehId) : pre.vehId;
  const freeName = change ? (S.orderEdit && !S.orderEdit.vehId ? S.orderEdit.fahrzeug : '') : (!pre.vehId ? (pre.freeName || '') : '');
  ov.innerHTML = `<div class="setup-card">${cardHead}
    <h3>${change ? 'Fahrzeug ändern' : 'Neuer Werkstattauftrag'}</h3>
    <p>${change ? 'Die Auftragsnummer bleibt unverändert.' : 'Fahrzeug wählen – Kennzeichen und Werk-Nr. werden übernommen. Die Nummer wird fortlaufend vergeben.'}
      ${pre.rows && pre.rows.length ? `<br><b>${pre.rows.length} offene Mängel</b> werden als Positionen übernommen.` : ''}</p>
    <form id="no-form" novalidate>
      <div class="field"><label for="no-veh">Fahrzeug aus dem Fuhrpark</label>
        <select id="no-veh">
          ${vehicles.map(v => `<option value="${esc(v.id)}" ${v.id === curVeh ? 'selected' : ''}>${esc(vehicleLabel(v))}${v.kz ? ' · ' + esc(v.kz) : ''}</option>`).join('')}
          <option value="" ${!curVeh && (freeName || !vehicles.length) ? 'selected' : ''}>— anderes Fahrzeug (nicht im Fuhrpark) —</option>
        </select></div>
      <div class="field" id="no-free-wrap"><label for="no-free">Fahrzeug (frei)</label>
        <input id="no-free" value="${esc(freeName)}" placeholder="z. B. Werkstatt-Stapler" autocomplete="off"></div>
      <button class="btn-big" type="submit">${change ? 'Übernehmen' : 'Auftrag anlegen'}</button>
      <div class="setup-err" id="no-err"></div>
    </form>
    <div class="setup-back"><button class="link-btn" data-n="close" type="button">Abbrechen</button></div>
  </div>`;
  ov.classList.remove('hidden');
  const sync = () => { $('no-free-wrap').style.display = $('no-veh').value ? 'none' : ''; };
  sync();
  const close = () => { ov.classList.add('hidden'); ov.onclick = null; ov.onsubmit = null; ov.onchange = null; };
  ov.onchange = (e) => { if (e.target.id === 'no-veh') sync(); };
  ov.onclick = (e) => { if (e.target.closest('[data-n="close"]')) close(); };
  ov.onsubmit = async (e) => {
    e.preventDefault();
    const v = S.vehicles.find(x => x.id === $('no-veh').value);
    const free = $('no-free').value.trim();
    if (!v && !free) { $('no-err').textContent = 'Bitte ein Fahrzeug wählen oder eintragen.'; return; }
    const veh = v ? { vehId: v.id, fahrzeug: v.typ || '', code: v.code || '', werk: v.werk || '', kz: v.kz || '' }
                  : { vehId: '', fahrzeug: free, code: '', werk: '', kz: '' };
    if (change) {
      Object.assign(S.orderEdit, veh); reopenIfIncomplete(); close(); renderOrder(); queueOrderSave(); return;
    }
    const btn = ov.querySelector('#no-form button[type="submit"]');
    btn.disabled = true; $('no-err').textContent = 'Nummer wird vergeben …';
    try {
      const d = new Date(), ymd = '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
      const prefix = String(veh.code || veh.fahrzeug || 'AUFTRAG').replace(/[\/\\.#$\[\]\s]+/g, '-').slice(0, 30);
      const n = await S.store.nextOrderNr(prefix + '-' + ymd);
      const o = normalizeOrder({
        id: S.store.newOrderId(), nr: `${prefix}-${ymd}-${String(n).padStart(3, '0')}`, created: Date.now(), status: 'offen',
        ...veh, km: pre.km || '', ow: pre.ow || '', uw: pre.uw || '', datum: todayIso(),
        rows: pre.rows && pre.rows.length ? pre.rows : [emptyOrderRow()], notes: pre.notes || '',
        crew: S.me ? [S.me] : [], erstelltVon: S.me || '', source: pre.source || ''
      });
      S.orders.unshift({ ...o });
      S.store.saveOrder(o.id, pickOrder(o), S.me).catch(() => showToast('Auftrag konnte nicht gespeichert werden'));
      close();
      S.openOrderId = o.id; S.orderEdit = o; S.orderDirty = false; S.orderIsNew = o.id; S.view = 'order'; render(); window.scrollTo(0, 0);
      showToast('Auftrag ' + o.nr + ' angelegt');
    } catch (err) {
      console.error(err);
      $('no-err').textContent = (err && err.message) || 'Auftrag konnte nicht angelegt werden.';
      btn.disabled = false;
    }
  };
}

/* =====================================================================
   Fuhrpark
   ===================================================================== */
/* Fahrzeuge aus einer Liste, die es im Fuhrpark noch nicht gibt (gleiche Werk-Nr. bzw. gleicher Code + Typ) */
function newVehicles(list) {
  const norm = (x) => String(x || '').replace(/\s+/g, '').toLowerCase();
  return list.filter(v => !S.vehicles.some(x =>
    (v.werk && norm(x.werk) === norm(v.werk)) || (norm(x.code) === norm(v.code) && norm(x.typ) === norm(v.typ))));
}
const sortVehicles = (list) => list.slice().sort((a, b) =>
  String(a.code || a.typ || '').localeCompare(String(b.code || b.typ || ''), 'de', { numeric: true }));
const fmtDay = (iso) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
  const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}.${m}.${y}`;
};
/* Fälligkeit: over = überfällig, soon = innerhalb 30 Tagen, ok, '' = kein Datum */
function dueState(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
  const today = new Date(todayIso() + 'T00:00:00');
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  const days = Math.round((d - today) / 86400000);
  return days < 0 ? 'over' : days <= 30 ? 'soon' : 'ok';
}
const DUE_FIELDS = [['uvv', 'UVV'], ['hu', 'HU'], ['sp', 'SP']];
/* Service: fällig 12 Monate nach dem letzten Service (gelb ab 30 Tage vorher) */
const SERVICE_MONTHS = 12;
function serviceDue(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
  const d = new Date(iso.slice(0, 10) + 'T00:00:00'); d.setMonth(d.getMonth() + SERVICE_MONTHS);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
/* Fälligkeitsdatum je Prüfung (für Service: errechnet aus dem letzten Service) */
const dueDateOf = (v, kind) => kind === 'service' ? serviceDue(v.letzterService) : (v[kind] || '');

function renderFleet() {
  const q = $('fleet-search').value.trim().toLowerCase();
  const kind = $('fleet-kind').value, state = $('fleet-state').value;
  const KIND_LABEL = { sp: 'SP', hu: 'HU', uvv: 'UVV', service: 'Service' };
  // ohne gewählte Prüfung gilt der Zustand für irgendeine der Prüfungen
  const kinds = kind ? [kind] : ['uvv', 'hu', 'sp', 'service'];
  const stateOk = (v) => {
    if (!state) return true;
    const sts = kinds.map(k => dueState(dueDateOf(v, k)));
    if (state === 'due') return sts.some(s => s === 'over' || s === 'soon');
    if (state === 'none') return sts.some(s => s === '');
    return sts.includes(state);
  };
  // Gruppen (Krane, Ladekrane, …) in der Reihenfolge der Fahrzeugliste
  const groups = fleetGroups();
  const gsel = $('fleet-grp'), gcur = gsel.value;
  gsel.innerHTML = '<option value="">Alle Gruppen</option>' + groups.map(g => `<option value="${esc(g || '__none__')}">${esc(g || 'Ohne Gruppe')} (${S.vehicles.filter(v => (v.gruppe || '') === g).length})</option>`).join('');
  gsel.value = groups.map(g => g || '__none__').includes(gcur) ? gcur : '';
  const grp = gsel.value === '__none__' ? '' : gsel.value, grpOn = gsel.value !== '';
  let list = sortVehicles(S.vehicles).filter(v => !q ||
    [v.code, v.hersteller, v.typ, v.kz, v.fahrer, v.werk, v.fin, v.baujahr, v.gruppe].join(' ').toLowerCase().includes(q))
    .filter(v => !grpOn || (v.gruppe || '') === grp).filter(stateOk);
  const gi = (v) => { const i = groups.indexOf(v.gruppe || ''); return i < 0 ? 999 : i; };
  if (!kind) list = list.slice().sort((x, y) => gi(x) - gi(y));   // stabil: innerhalb der Gruppe nach ID
  // mit gewählter Prüfung: nach Fälligkeit sortieren (früheste zuerst, ohne Datum ans Ende)
  if (kind) list = list.slice().sort((x, y) => (dueDateOf(x, kind) || '9999').localeCompare(dueDateOf(y, kind) || '9999'));
  let over = 0, soon = 0;
  S.vehicles.forEach(v => kinds.forEach(k => { const st = dueState(dueDateOf(v, k)); if (st === 'over') over++; if (st === 'soon') soon++; }));
  const lbl = kind ? KIND_LABEL[kind] + ': ' : '';
  $('fleet-summary').innerHTML = S.vehicles.length ? `<div class="fleet-summary">
      ${over ? `<span class="badge bad">${lbl}${over} überfällig</span>` : ''}
      ${soon ? `<span class="badge pend">${lbl}${soon} in den nächsten 30 Tagen fällig</span>` : ''}
      ${!over && !soon ? `<span class="badge ok">${lbl}Keine Fälligkeiten in den nächsten 30 Tagen</span>` : ''}
      ${kind || state || grpOn ? `<span class="badge cat">${list.length} von ${S.vehicles.length} Fahrzeugen</span>` : `<span class="badge cat">${S.vehicles.length} Fahrzeuge</span>`}
    </div>` : '';
  if (S.fleetError) {
    $('fleet-list').innerHTML = `<div class="empty-note">${S.fleetError === 'rules'
      ? '<b>Fuhrpark noch nicht freigeschaltet.</b><br>Die Firebase-Regeln müssen aktualisiert werden (Firebase-Konsole → Firestore → Regeln → Inhalt von firestore.rules einfügen → Veröffentlichen).'
      : 'Der Fuhrpark konnte nicht geladen werden. Bitte später erneut versuchen.'}</div>`;
    return;
  }
  if (!S.vehicles.length) {
    $('fleet-list').innerHTML = `<div class="empty-note">Noch keine Fahrzeuge im Fuhrpark.<br>${amAdmin()
      ? 'Über „+ Fahrzeug“ anlegen oder unter ⚙ Einstellungen → „Daten aus alter Version übernehmen“ die alte Fahrzeugliste einlesen.'
      : 'Fahrzeuge legen die Admins (SE, KÖ) an.'}</div>`;
    return;
  }
  // Auswahl: Zeile antippen markiert, Doppelklick öffnet das Fahrzeug
  if (S.selVeh && !list.some(v => v.id === S.selVeh)) S.selVeh = null;
  const edit = S.fleetEdit && amAdmin();
  if (!list.length) { $('fleet-list').innerHTML = '<div class="empty-note">Kein Fahrzeug zu dieser Auswahl.</div>'; return; }
  const due = (v, f) => { const st = dueState(v[f]); return `<span class="due ${st}">${esc(fmtDay(v[f]) || '—')}</span>`; };
  const svc = (v) => { const nd = serviceDue(v.letzterService), st = dueState(nd);
    return v.letzterService ? `<span class="due ${st}" title="nächster Service fällig ${esc(fmtDay(nd))}">${esc(fmtDay(v.letzterService))}</span>` : '—'; };
  const hl = (k) => kind === k ? ' class="col-hl"' : '';
  // Bearbeitungsmodus (Stift): das ganze Blatt wird zu Eingabefeldern, Änderungen speichern sich selbst
  const val = (v, f) => (S.fePending[v.id] && S.fePending[v.id][f] !== undefined) ? S.fePending[v.id][f] : (v[f] || '');
  const inp = (v, f, type = 'text', cls = '') => `<input class="fe-in ${cls}" data-fe="${f}" data-vid="${esc(v.id)}" type="${type}" value="${esc(val(v, f))}" autocomplete="off" aria-label="${f}">`;
  const cells = (v) => edit ? `
          <td data-l="ID">${inp(v, 'code', 'text', 'mono')}</td>
          <td data-l="Hersteller">${inp(v, 'hersteller')}</td>
          <td data-l="Fahrzeug">${inp(v, 'typ', 'text', 'fe-typ')}</td>
          <td data-l="Kennzeichen">${inp(v, 'kz', 'text', 'mono')}</td>
          <td data-l="Fahrer">${inp(v, 'fahrer')}</td>
          <td data-l="FIN">${inp(v, 'fin', 'text', 'mono')}</td>
          <td data-l="Werk-Nr.">${inp(v, 'werk', 'text', 'mono')}</td>
          <td data-l="Baujahr">${inp(v, 'baujahr', 'text', 'mono')}</td>
          <td data-l="UVV fällig">${inp(v, 'uvv', 'date')}</td>
          <td data-l="HU fällig">${inp(v, 'hu', 'date')}</td>
          <td data-l="SP fällig">${inp(v, 'sp', 'date')}</td>
          <td data-l="Letzter Service">${inp(v, 'letzterService', 'date')}</td>` : `
          <td data-l="ID" class="mono"><b>${esc(v.code || '—')}</b></td>
          <td data-l="Hersteller">${esc(v.hersteller || '—')}</td>
          <td data-l="Fahrzeug"><b>${esc(v.typ || '—')}</b>${v._pending ? ' <span class="badge pend" title="Wird übertragen">⟳</span>' : ''}</td>
          <td data-l="Kennzeichen" class="mono">${esc(v.kz || '—')}</td>
          <td data-l="Fahrer">${esc(v.fahrer || '—')}</td>
          <td data-l="FIN" class="mono fin">${esc(v.fin || '—')}</td>
          <td data-l="Werk-Nr." class="mono">${esc(v.werk || '—')}</td>
          <td data-l="Baujahr" class="mono">${esc(v.baujahr || '—')}</td>
          <td data-l="UVV fällig">${due(v, 'uvv')}</td>
          <td data-l="HU fällig">${due(v, 'hu')}</td>
          <td data-l="SP fällig">${due(v, 'sp')}</td>
          <td data-l="Letzter Service">${svc(v)}</td>`;
  $('fleet-list').innerHTML = `
    ${edit ? '<div class="fe-bar no-print">✎ <b>Bearbeitungsmodus</b> – Änderungen werden automatisch gespeichert. Zum Beenden den Stift erneut antippen.</div>' : ''}
    <div class="fleet-scroll"><table class="fleet-table${edit ? ' fe-mode' : ''}">
      <thead><tr><th>ID</th><th>Hersteller</th><th>Fahrzeug</th><th>Kennzeichen</th><th>Fahrer</th><th>FIN</th><th>Werk-Nr.</th><th>Baujahr</th><th${hl('uvv')}>UVV</th><th${hl('hu')}>HU</th><th${hl('sp')}>SP</th><th${hl('service')}>Letzter Service</th></tr></thead>
      <tbody>${list.map((v, i) => `${!kind && (i === 0 || (list[i - 1].gruppe || '') !== (v.gruppe || '')) ? `
        <tr class="grp-row"><td colspan="12">${esc(v.gruppe || 'Ohne Gruppe')} <small>${list.filter(x => (x.gruppe || '') === (v.gruppe || '')).length}</small></td></tr>` : ''}
        <tr class="fleet-row${S.selVeh === v.id ? ' sel' : ''}" data-vid="${esc(v.id)}" tabindex="0" aria-selected="${S.selVeh === v.id}">${cells(v)}
        </tr>`).join('')}
      </tbody>
    </table></div>
    <p class="fleet-legend no-print"><span class="due over">rot</span> überfällig · <span class="due soon">gelb</span> innerhalb von 30 Tagen fällig · Service gilt ${SERVICE_MONTHS} Monate nach dem letzten als fällig · Fahrzeug antippen zum Markieren, doppelt antippen für ${amAdmin() ? 'Details und Bearbeiten · ✎ oben bearbeitet das ganze Blatt' : 'Details'}.</p>`;
  const pen = $('btn-fleet-edit'); if (pen) { pen.classList.toggle('on', edit); pen.setAttribute('aria-pressed', edit); pen.title = edit ? 'Bearbeiten beenden' : 'Fuhrpark bearbeiten'; }
}
function fleetGroups() {
  const used = [...new Set(S.vehicles.map(v => v.gruppe || ''))];
  return [...FLEET_GROUPS.filter(g => used.includes(g)), ...used.filter(g => !FLEET_GROUPS.includes(g)).sort(deSort)];
}
/* =====================================================================
   Fahrzeugakte: Historie (Aufträge, Servicelisten), Ersatzteile, Ölsorten,
   Bilder, Dokumente, Liebherr-Arbeitsberichte, Notizen
   ===================================================================== */
const AKTE_TABS = [['historie', 'Historie'], ['teile', 'Ersatzteile'], ['oele', 'Ölsorten'], ['bild', 'Bilder'],
  ['dok', 'Dokumente'], ['lbh', 'Liebherr-Arbeitsberichte'], ['notizen', 'Notizen']];
const TEILE_COLS = [['name', 'Bezeichnung'], ['nr', 'Teile-Nr.'], ['lieferant', 'Hersteller / Lieferant'], ['menge', 'Menge'], ['bem', 'Bemerkung']];
const OELE_COLS = [['bg', 'Baugruppe'], ['sorte', 'Ölsorte / Spezifikation'], ['menge', 'Füllmenge'], ['intervall', 'Wechselintervall'], ['bem', 'Bemerkung']];
const OEL_BAUGRUPPEN = ['Motor', 'Getriebe', 'Verteilergetriebe', 'Achsen', 'Hydraulik', 'Drehwerk', 'Hubwerk', 'Kühlmittel', 'Bremse'];
let akteUnsubs = [], akteSubVid = null;
function subscribeAkte(vid) {
  closeAkte(); akteSubVid = vid;
  S.akte = {}; S.akteNotes = []; S.akteFiles = [];
  const re = () => { if (S.view === 'vehicle' && S.openVehId === vid && !akteTyping()) renderAkte(); };
  akteUnsubs = [
    S.store.onAkte(vid, (d) => {
      d = d || {};
      // eigene, noch nicht gespeicherte Eingaben nicht vom Server-Stand überschreiben
      if (S.akteDirty || akteSaveTimer || akteTyping()) S.akte = { ...d, teile: S.akte.teile || d.teile, oele: S.akte.oele || d.oele };
      else { S.akte = d; re(); }
    }),
    S.store.onAkteNotes(vid, (l) => { S.akteNotes = l; re(); }),
    S.store.onAkteFiles(vid, (l) => { S.akteFiles = l; re(); }),
  ];
}
function closeAkte() { flushAkteSave(); akteSubVid = null; akteUnsubs.forEach(u => { try { u(); } catch (e) { /* schon beendet */ } }); akteUnsubs = []; }
const akteTyping = () => { const a = document.activeElement; return a && $('view-vehicle').contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };
function openAkte(vid) {
  if (!S.vehicles.some(v => v.id === vid)) return;
  flushFleetEdit();
  subscribeAkte(vid);
  S.openVehId = vid; S.akteTab = 'historie'; S.view = 'vehicle'; render(); window.scrollTo(0, 0);
}
/* Aufträge und Servicelisten dieses Fahrzeugs – über die Verknüpfung oder (z. B. nach dem
   Excel-Import mit neuen Fahrzeug-Kennungen) über ID bzw. Kennzeichen */
function vehicleHistory(v) {
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
  const sameCode = (c) => v.code && norm(c) === norm(v.code), sameKz = (k) => v.kz && norm(k) === norm(v.kz);
  const orders = S.orders.filter(o => o.vehId === v.id || sameCode(o.code) || sameKz(o.kz)).map(o => ({
    kind: 'auftrag', id: o.id, ts: o.created || 0, day: o.datum || '', title: 'Auftrag ' + (o.nr || ''),
    sub: [(o.rows || []).map(r => r.text).filter(Boolean).slice(0, 3).join(' · '), (o.crew || []).join(', ')].filter(Boolean).join(' — '),
    badge: statusBadge(o.status || 'offen') }));
  const protos = S.protocols.filter(p => { const h = p.header || {};
    if (h.vehId === v.id) return true;
    const f = norm(h.fId); return (v.code && (f === norm(v.code) || f.startsWith(norm(v.code) + '·'))) || sameKz(h.kz) || (v.kz && f.includes(norm(v.kz)));
  }).map(p => { const st = protoStats(p); return {
    kind: 'protokoll', id: p.id, ts: p.ts || 0, day: (p.header && p.header.fDate) || '', title: 'Serviceliste ' + (p.category || ''),
    sub: [(p.monteure || []).join(', '), p.header && p.header.fKm ? 'Km ' + p.header.fKm : '', p.header && p.header.fOw ? 'Std. OW ' + p.header.fOw : ''].filter(Boolean).join(' · '),
    badge: st.open ? `<span class="badge bad">${st.open} n.i.O.</span>` : '<span class="badge ok">i.O.</span>' }; });
  return [...orders, ...protos].sort((x, y) => (y.day || '').localeCompare(x.day || '') || y.ts - x.ts);
}
function renderAkte() {
  const v = S.vehicles.find(x => x.id === S.openVehId);
  if (!v) { closeAkte(); S.view = 'fleet'; render(); return; }
  const admin = amAdmin(), tab = S.akteTab;
  const hist = vehicleHistory(v);
  const cnt = { historie: hist.length, teile: (S.akte.teile || []).length, oele: (S.akte.oele || []).length,
    bild: S.akteFiles.filter(f => f.kind === 'bild').length, dok: S.akteFiles.filter(f => f.kind === 'dok').length,
    lbh: S.akteFiles.filter(f => f.kind === 'lbh').length, notizen: S.akteNotes.length };
  const due = (label, iso) => { const st = dueState(iso); return `<div class="ak-f"><label>${label}</label><span class="due ${st}">${esc(fmtDay(iso) || '—')}</span></div>`; };
  const fld = (label, val, cls = '') => `<div class="ak-f"><label>${label}</label><b class="${cls}">${esc(val || '—')}</b></div>`;
  $('view-vehicle').innerHTML = `
    <div class="proto-banner no-print">
      <button class="btn-sec" data-act="back-fleet" type="button">← Fuhrpark</button>
      <div class="actions">${admin ? '<button class="btn-sec" data-act="akte-stamm" type="button">✎ Stammdaten</button>' : ''}</div>
    </div>
    <div class="box ak-head">
      <div class="ak-title"><span class="ak-id mono">${esc(v.code || '—')}</span><div><h3>${esc([v.hersteller, v.typ].filter(Boolean).join(' '))}</h3>
        <span class="proto-meta">${esc([v.gruppe, v.kz].filter(Boolean).join(' · '))}</span></div></div>
      <div class="ak-grid">
        ${fld('Kennzeichen', v.kz, 'mono')}${fld('Fahrer', v.fahrer)}${fld('FIN', v.fin, 'mono')}${fld('Werk-Nr.', v.werk, 'mono')}${fld('Baujahr', v.baujahr, 'mono')}
        ${due('UVV fällig', v.uvv)}${due('HU fällig', v.hu)}${due('SP fällig', v.sp)}
        <div class="ak-f"><label>Letzter Service</label><span class="due ${dueState(serviceDue(v.letzterService))}">${esc(fmtDay(v.letzterService) || '—')}</span></div>
      </div>
    </div>
    <div class="ak-tabs no-print" role="tablist">${AKTE_TABS.map(([k, l]) => `<button type="button" role="tab" class="ak-tab${k === tab ? ' on' : ''}" data-act="akte-tab" data-tab="${k}" aria-selected="${k === tab}">${l}${cnt[k] ? ` <small>${cnt[k]}</small>` : ''}</button>`).join('')}</div>
    <div class="box ak-body">
      <div class="sec-title"><div class="title-left"><span>${esc(AKTE_TABS.find(t => t[0] === tab)[1])}</span></div><div id="ak-tools"></div></div>
      <div id="ak-content"></div>
    </div>`;
  renderAkteTab(v, hist);
  renderChrome();
}
function renderAkteTab(v, hist) {
  const tab = S.akteTab, admin = amAdmin(), box = $('ak-content'), tools = $('ak-tools');
  const fmtTs = (ts) => new Date(ts || 0).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  tools.innerHTML = '';
  if (tab === 'historie') {
    box.innerHTML = hist.length ? `<div class="ak-hist">${hist.map(h => `
      <button type="button" class="ak-h" data-act="akte-open" data-kind="${h.kind}" data-id="${esc(h.id)}">
        <span class="ak-h-day mono">${esc(fmtDay(h.day) || new Date(h.ts).toLocaleDateString('de-DE'))}</span>
        <span class="ak-h-kind ${h.kind}">${h.kind === 'auftrag' ? 'Auftrag' : 'Serviceliste'}</span>
        <span class="ak-h-main"><b>${esc(h.title)}</b><small>${esc(h.sub)}</small></span>
        <span>${h.badge}</span>
      </button>`).join('')}</div>`
      : '<p class="proto-meta">Für dieses Fahrzeug gibt es noch keine Aufträge oder abgeschlossenen Servicelisten.</p>';
    tools.innerHTML = '<button class="btn-sec no-print" data-act="akte-new-order" type="button">+ Neuer Auftrag</button>';
    return;
  }
  if (tab === 'teile' || tab === 'oele') {
    const cols = tab === 'teile' ? TEILE_COLS : OELE_COLS, rows = S.akte[tab] || [];
    if (admin) tools.innerHTML = `<button class="btn-sec no-print" data-act="akte-add-row" type="button">+ ${tab === 'teile' ? 'Ersatzteil' : 'Ölsorte'}</button>`;
    box.innerHTML = rows.length ? `<table class="service-table ak-table">
      <thead><tr>${cols.map(c => `<th>${c[1]}</th>`).join('')}${admin ? '<th class="no-print"></th>' : ''}</tr></thead>
      <tbody>${rows.map((r, i) => `<tr>${cols.map(([k, l]) => `<td data-l="${l}">${admin
        ? `<input class="ak-in" data-ak="${k}" data-idx="${i}" value="${esc(r[k] || '')}" ${k === 'bg' ? 'list="ak-bg"' : ''} autocomplete="off">`
        : esc(r[k] || '—')}</td>`).join('')}${admin ? `<td class="no-print"><button class="btn-del-row" data-act="akte-del-row" data-idx="${i}" title="Entfernen">✕</button></td>` : ''}</tr>`).join('')}</tbody></table>
      <datalist id="ak-bg">${OEL_BAUGRUPPEN.map(b => `<option value="${b}">`).join('')}</datalist>
      ${admin ? '<p class="proto-meta no-print" id="ak-saved">Änderungen werden automatisch gespeichert.</p>' : ''}`
      : `<p class="proto-meta">${tab === 'teile' ? 'Noch keine Ersatzteile hinterlegt.' : 'Noch keine Ölsorten hinterlegt.'}${admin ? '' : ' Pflegen können das die Admins (SE, KÖ).'}</p>`;
    return;
  }
  if (tab === 'notizen') {
    box.innerHTML = `<div class="ak-note-new no-print">
        <textarea id="ak-note" class="o-ta o-notes" rows="3" placeholder="Notiz zum Fahrzeug, z. B. Auffälligkeit, Absprache, Hinweis …"></textarea>
        <button class="btn-sec" data-act="akte-add-note" type="button">Notiz speichern</button></div>
      ${S.akteNotes.length ? S.akteNotes.map(n => `<div class="ak-note"><div class="ak-note-h"><span>${esc(fmtTs(n.ts))} · <b>${esc(n.von || '')}</b></span>
        ${admin || n.uid === S.store.uid ? `<button class="btn-del-row no-print" data-act="akte-del-note" data-id="${esc(n.id)}" title="Löschen">✕</button>` : ''}</div>
        <div class="ak-note-t">${esc(n.text)}</div></div>`).join('') : '<p class="proto-meta">Noch keine Notizen.</p>'}`;
    return;
  }
  // Bilder, Dokumente, Liebherr-Arbeitsberichte
  const files = S.akteFiles.filter(f => f.kind === tab);
  tools.innerHTML = `<button class="btn-sec no-print" data-act="akte-upload" type="button">+ ${tab === 'bild' ? 'Bilder' : 'Datei'} hinzufügen</button>`;
  const del = (f) => (admin || f.uid === S.store.uid) ? `<button class="btn-del-row no-print" data-act="akte-del-file" data-id="${esc(f.id)}" title="Löschen">✕</button>` : '';
  const up = S.akteUpload ? `<p class="ak-up">${esc(S.akteUpload)}</p>` : '';
  if (tab === 'bild') {
    box.innerHTML = up + (files.length ? `<div class="ak-gal">${files.map(f => `<figure class="ak-img">
        <button type="button" data-act="akte-view" data-id="${esc(f.id)}" title="${esc(f.name)}"><img src="${f.thumb || ''}" alt="${esc(f.name)}" loading="lazy"></button>
        <figcaption><span>${esc(fmtTs(f.ts))} · ${esc(f.von || '')}</span>${del(f)}</figcaption></figure>`).join('')}</div>`
      : '<p class="proto-meta">Noch keine Bilder. Am Handy kann direkt mit der Kamera fotografiert werden.</p>');
  } else {
    box.innerHTML = up + (files.length ? `<div class="ak-files">${files.map(f => `<div class="ak-file">
        <button type="button" class="ak-file-b" data-act="akte-view" data-id="${esc(f.id)}"><span class="ak-ext">${esc((f.name.split('.').pop() || 'DATEI').slice(0, 4).toUpperCase())}</span>
          <span><b>${esc(f.name)}</b><small>${esc(fmtSize(f.size))} · ${esc(fmtTs(f.ts))} · ${esc(f.von || '')}</small></span></button>${del(f)}</div>`).join('')}</div>`
      : `<p class="proto-meta">Noch keine ${tab === 'lbh' ? 'Liebherr-Arbeitsberichte' : 'Dokumente'}. PDF, Bilder, Word/Excel bis 15 MB.</p>`);
  }
}
const fmtSize = (b) => !b ? '' : b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';

/* Ersatzteile / Ölsorten: Eingaben sammeln und kurz danach speichern (nur Admins) */
let akteSaveTimer = null;
function onAkteInput(t) {
  if (!amAdmin()) return;
  const tab = S.akteTab, rows = (S.akte[tab] = (S.akte[tab] || []).slice());
  const i = +t.dataset.idx; rows[i] = { ...rows[i], [t.dataset.ak]: t.value };
  S.akteDirty = true; const el = $('ak-saved'); if (el) el.textContent = 'wird gespeichert …';
  clearTimeout(akteSaveTimer); akteSaveTimer = setTimeout(saveAkteNow, 700);
}
function saveAkteNow() {
  clearTimeout(akteSaveTimer); akteSaveTimer = null;
  if (!S.akteDirty || !S.openVehId || !amAdmin()) return;
  S.akteDirty = false;
  const clean = (l) => (l || []).map(r => Object.fromEntries(Object.entries(r).map(([k, x]) => [k, String(x || '').trim()])));
  S.store.saveAkte(S.openVehId, { teile: clean(S.akte.teile), oele: clean(S.akte.oele) }, S.me)
    .then(() => { const el = $('ak-saved'); if (el && !S.akteDirty) el.textContent = 'gespeichert ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); })
    .catch((err) => { if (err && err.code === 'permission-denied') adminRejected(); else showToast('Speichern fehlgeschlagen'); });
}
function flushAkteSave() { if (akteSaveTimer) saveAkteNow(); }

/* Dateien: Bilder werden verkleinert (max. 1600 px), alles andere bis 15 MB unverändert abgelegt */
const bufToB64 = (buf) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
function loadImg(file) { return new Promise((res, rej) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Bild konnte nicht gelesen werden')); }; im.src = u; }); }
function scaleImg(im, max, q) {
  const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
  c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', q);
}
async function uploadAkteFiles(files) {
  const vid = S.openVehId, kind = S.akteTab; if (!vid || !['bild', 'dok', 'lbh'].includes(kind)) return;
  let done = 0;
  for (const file of files) {
    try {
      S.akteUpload = `Lade hoch: ${file.name} …`; renderAkte();
      let meta, b64;
      if (file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
        const im = await loadImg(file);
        const full = kind === 'bild' ? scaleImg(im, 1600, 0.82) : null;
        b64 = full ? full.split(',')[1] : bufToB64(await file.arrayBuffer());
        meta = { kind, name: full ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name, type: full ? 'image/jpeg' : file.type, size: Math.round(b64.length * 0.75), thumb: scaleImg(im, 320, 0.7) };
      } else {
        if (kind === 'bild') throw new Error(`„${file.name}“ ist kein Bild`);
        if (file.size > 15 * 1024 * 1024) throw new Error(`„${file.name}“ ist größer als 15 MB`);
        b64 = bufToB64(await file.arrayBuffer());
        meta = { kind, name: file.name, type: file.type || 'application/octet-stream', size: file.size };
      }
      await S.store.addAkteFile(vid, meta, b64, S.me, (p) => { S.akteUpload = `Lade hoch: ${file.name} … ${Math.round(p * 100)} %`; const el = document.querySelector('.ak-up'); if (el) el.textContent = S.akteUpload; });
      done++;
    } catch (e) { showToast(e.message || 'Hochladen fehlgeschlagen'); }
  }
  S.akteUpload = ''; if (S.view === 'vehicle') renderAkte();
  if (done) showToast(done === 1 ? 'Datei gespeichert' : done + ' Dateien gespeichert');
}
async function viewAkteFile(fid) {
  const f = S.akteFiles.find(x => x.id === fid); if (!f) return;
  showToast('Wird geladen …');
  try {
    const b64 = await S.store.getAkteFile(S.openVehId, fid);
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([u], { type: f.type || 'application/octet-stream' }));
    if (f.kind === 'bild' || (f.type || '').startsWith('image/')) {
      const ov = $('setup');
      ov.innerHTML = `<div class="setup-card ak-lb"><img src="${url}" alt="${esc(f.name)}">
        <div class="setup-back" style="display:flex;justify-content:space-between;gap:10px"><a class="link-btn" href="${url}" download="${esc(f.name)}">Herunterladen</a>
        <button class="link-btn" data-v="close" type="button">Schließen</button></div></div>`;
      ov.classList.remove('hidden');
      ov.onclick = (e) => { if (e.target === ov || e.target.closest('[data-v="close"]')) { ov.classList.add('hidden'); ov.onclick = null; URL.revokeObjectURL(url); } };
    } else {
      const a = document.createElement('a'); a.href = url; a.download = f.name;
      if ((f.type || '') === 'application/pdf') { a.target = '_blank'; a.removeAttribute('download'); }
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  } catch (e) { showToast(e.message || 'Datei konnte nicht geladen werden'); }
}

/* ---------- Fuhrpark direkt im Blatt bearbeiten ---------- */
const feTimers = {};
function toggleFleetEdit(on) {
  if (!amAdmin()) return;
  const next = on === undefined ? !S.fleetEdit : on;
  if (!next) flushFleetEdit();
  S.fleetEdit = next; renderFleet();
  if (next) showToast('Bearbeitungsmodus an – Änderungen werden automatisch gespeichert');
}
function onFleetInput(t) {
  const vid = t.dataset.vid, f = t.dataset.fe;
  if (!S.fleetEdit || !amAdmin()) return;
  (S.fePending[vid] = S.fePending[vid] || {})[f] = t.value.trim();
  if (f === 'typ') t.classList.toggle('fe-err', !t.value.trim());
  clearTimeout(feTimers[vid]); feTimers[vid] = setTimeout(() => saveFleetRow(vid), 700);
}
function saveFleetRow(vid) {
  clearTimeout(feTimers[vid]); delete feTimers[vid];
  const p = S.fePending[vid]; if (!p) return;
  const v = S.vehicles.find(x => x.id === vid); if (!v) { delete S.fePending[vid]; return; }
  const data = {};
  VEHICLE_FIELDS.forEach(f => { data[f] = p[f] !== undefined ? p[f] : (v[f] || ''); });
  if (!data.typ) { showToast('„Fahrzeug / Typ“ darf nicht leer sein – nicht gespeichert'); return; }
  if (v.letzterServiceVon && data.letzterService === v.letzterService) data.letzterServiceVon = v.letzterServiceVon;
  delete S.fePending[vid];
  Object.assign(v, data);
  S.store.saveVehicle(vid, data, S.me).catch((err) => { if (err && err.code === 'permission-denied') adminRejected(); });
}
function flushFleetEdit() { Object.keys(S.fePending).forEach(saveFleetRow); }
function selectVehicle(id) {
  S.selVeh = S.selVeh === id ? null : id;
  document.querySelectorAll('#fleet-list .fleet-row').forEach(r => {
    const on = r.dataset.vid === S.selVeh; r.classList.toggle('sel', on); r.setAttribute('aria-selected', on);
  });
}

/* Fahrzeug anzeigen / bearbeiten (bearbeiten nur Admins) */
function openVehicle(id) {
  const v = id ? S.vehicles.find(x => x.id === id) : {};
  if (id && !v) return;
  const admin = amAdmin();
  const ov = $('setup');
  const field = (f, label, type = 'text', ph = '') => `<div class="field"><label for="vf-${f}">${label}</label>
    <input id="vf-${f}" type="${type}" value="${esc(v[f] || '')}" placeholder="${esc(ph)}" ${admin ? '' : 'disabled'} autocomplete="off"></div>`;
  ov.innerHTML = `<div class="setup-card veh-card">${cardHead}
    <h3>${id ? esc(vehicleLabel(v) || 'Fahrzeug') : 'Neues Fahrzeug'}</h3>
    ${admin ? '' : '<p>Nur Admins (SE, KÖ) können Fahrzeuge ändern.</p>'}
    <form id="veh-form" novalidate>
      <div class="veh-grid">
        <div class="field"><label for="vf-gruppe">Gruppe</label>
          <input id="vf-gruppe" list="vf-gruppen" value="${esc(v.gruppe || '')}" placeholder="z. B. Krane" ${admin ? '' : 'disabled'} autocomplete="off">
          <datalist id="vf-gruppen">${[...new Set([...FLEET_GROUPS, ...fleetGroups()])].filter(Boolean).map(g => `<option value="${esc(g)}">`).join('')}</datalist></div>
        ${field('code', 'ID (Kurzcode)', 'text', 'z. B. 088')}
        ${field('hersteller', 'Hersteller', 'text', 'z. B. Liebherr')}
        ${field('typ', 'Fahrzeug / Typ *', 'text', 'z. B. MK 88 Plus')}
        ${field('kz', 'Kennzeichen', 'text', 'z. B. OD-KS 088')}
        ${field('fahrer', 'Fahrer', 'text', 'z. B. Müller')}
        ${field('werk', 'Werk-Nr.', 'text', 'z. B. 110 128')}
        ${field('baujahr', 'Baujahr', 'text', 'z. B. 03/2021')}
        ${field('fin', 'Fahrgestellnr. (FIN)')}
        ${field('uvv', 'UVV fällig am', 'date')}
        ${field('hu', 'HU fällig am', 'date')}
        ${field('sp', 'SP fällig am', 'date')}
        ${field('letzterService', 'Letzter Service', 'date')}
      </div>
      ${v.letzterServiceVon ? `<p style="font-size:12px;margin-top:-4px">Letzter Service eingetragen von ${esc(monteurLabel(v.letzterServiceVon))}.</p>` : ''}
      ${admin ? '<button class="btn-big" type="submit">Speichern</button>' : ''}
      <div class="setup-err" id="veh-err"></div>
    </form>
    <div class="setup-back" style="display:flex;justify-content:space-between;gap:10px">
      ${admin && id ? '<button class="link-btn" data-v="delete" type="button" style="color:#c53030">Fahrzeug löschen</button>' : '<span></span>'}
      <button class="link-btn" data-v="close" type="button">${admin ? 'Abbrechen' : 'Schließen'}</button>
    </div>
  </div>`;
  ov.classList.remove('hidden');
  const close = () => { ov.classList.add('hidden'); ov.onclick = null; ov.onsubmit = null; };
  if (admin) setTimeout(() => $(id ? 'vf-kz' : 'vf-code').focus(), 30);
  ov.onclick = async (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    if (b.dataset.v === 'close') { close(); return; }
    if (b.dataset.v === 'delete') {
      if (!(await confirmModal(`Fahrzeug „${vehicleLabel(v)}“ aus dem Fuhrpark löschen? Abgeschlossene Protokolle bleiben erhalten.`, 'Löschen'))) return;
      try { await S.store.deleteVehicle(id); close(); showToast('Fahrzeug gelöscht'); }
      catch (err) { if (err && err.code === 'permission-denied') { close(); adminRejected(); } else showToast('Löschen fehlgeschlagen'); }
    }
  };
  ov.onsubmit = async (e) => {
    e.preventDefault();
    if (!amAdmin()) return;
    const data = {};
    VEHICLE_FIELDS.forEach(f => { data[f] = $('vf-' + f).value.trim(); });
    if (!data.typ) { $('veh-err').textContent = 'Bitte „Fahrzeug / Typ“ eintragen.'; $('vf-typ').focus(); return; }
    const dup = S.vehicles.find(x => x.id !== id && ((data.code && x.code === data.code) || (data.kz && x.kz === data.kz)));
    if (dup && !(await confirmModal(`Es gibt schon „${vehicleLabel(dup)}“ mit derselben ID oder demselben Kennzeichen. Trotzdem speichern?`, 'Speichern', false))) return;
    if (v.letzterServiceVon && data.letzterService === v.letzterService) data.letzterServiceVon = v.letzterServiceVon;
    try {
      await S.store.saveVehicle(id || null, data, S.me);
      close();
      showToast(id ? 'Fahrzeug gespeichert' : 'Fahrzeug angelegt');
    } catch (err) { if (err && err.code === 'permission-denied') { close(); adminRejected(); } else $('veh-err').textContent = 'Speichern fehlgeschlagen.'; }
  };
}

function markEmptyDate() { $('fDate').classList.toggle('is-empty', !$('fDate').value); }

/* ---------- Monteure (Mehrfachauswahl) ---------- */
function buildMonteurPanel() {
  const panel = $('ms-panel');
  panel.innerHTML = '';
  MONTEURE.forEach(m => {
    const label = document.createElement('label');
    label.className = 'ms-opt';
    label.innerHTML = '<input type="checkbox" class="chk-monteur"><code></code><span></span>';
    label.querySelector('input').value = m.code;
    label.querySelector('code').textContent = m.code;
    label.querySelector('span').textContent = m.name;
    panel.appendChild(label);
  });
}
function renderMonteure() {
  document.querySelectorAll('.chk-monteur').forEach(cb => { cb.checked = draft.monteure.includes(cb.value); });
  const names = draft.monteure.map(monteurLabel);
  $('ms-value').textContent = names.length ? names.join(', ') : 'Monteur(e) auswählen …';
  $('ms-value').classList.toggle('empty', !names.length);
  $('ms-print').textContent = names.join(', ');
}

/* ---------- Vorlage bearbeiten ---------- */
function rowEditHtml(it) {
  return `
    <tr data-iid="${esc(it.id)}">
      <td class="center no-print row-drag-cell"><span class="drag-handle row-drag-handle" title="Gedrückt halten zum Verschieben">⠿</span></td>
      <td contenteditable="true" class="editable-cell item-edit">${esc(it.text)}</td>
      <td class="center no-print"><button class="btn-del-row" data-act="delete-row" title="Prüfpunkt löschen">✕</button></td>
    </tr>`;
}
function groupEditHtml(g) {
  return `
    <div class="box" data-gid="${esc(g.id)}">
      <div class="sec-title">
        <div class="title-left">
          <span class="drag-handle no-print" title="Gedrückt halten zum Verschieben">⠿</span>
          <span class="sec-title-text" contenteditable="true" spellcheck="false">${esc(g.title)}</span>
        </div>
        <div class="no-print">
          <button class="btn-sec" data-act="copy-group" title="Gruppe kopieren, um sie in einer anderen Kategorie einzufügen">📋 Kopieren</button>
          <button class="btn-sec btn-danger" data-act="delete-group">🗑️ Gruppe löschen</button>
        </div>
      </div>
      <table class="service-table">
        <thead><tr>
          <th class="col-drag no-print"></th>
          <th class="col-desc" style="width:auto">Prüfpunkt / Arbeitsschritt</th>
          <th class="col-act no-print"></th>
        </tr></thead>
        <tbody>${g.items.map(rowEditHtml).join('')}</tbody>
      </table>
      <div class="box-actions no-print">
        <button class="btn-sec" data-act="add-row">+ Prüfpunkt hinzufügen</button>
      </div>
    </div>`;
}
function renderEdit() {
  $('groups-container').innerHTML = S.editTpl.groups.map(groupEditHtml).join('');
  initDrag();
  updatePasteButton();
}

/* Vorlage aus der Bearbeitungsansicht auslesen */
function readEditDom() {
  const groups = [];
  document.querySelectorAll('#groups-container > .box').forEach(box => {
    const title = box.querySelector('.sec-title-text').innerText.replace(/\s+/g, ' ').trim();
    const items = [];
    box.querySelectorAll('tbody tr').forEach(tr => {
      const text = tr.querySelector('.item-edit').innerText.replace(/\s+/g, ' ').trim();
      items.push({ id: tr.dataset.iid, text });
    });
    groups.push({ id: box.dataset.gid, title, items });
  });
  return { groups };
}

let saveTimer = null;
function templateChanged(immediate) {
  S.editTpl = readEditDom();
  clearTimeout(saveTimer);
  const doSave = () => {
    const tpl = cleanTemplate(S.editTpl);
    S.templates[S.cat] = { ...tpl, updatedBy: S.me };
    S.store.saveTemplate(S.cat, tpl, S.me).catch(err => {
      if (err && err.code === 'permission-denied') adminRejected(); else showToast('Speichern fehlgeschlagen');
    });
  };
  if (immediate) doSave(); else saveTimer = setTimeout(doSave, 700);
}
function flushTemplateSave() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; templateChanged(true); }
}
/* Platzhalter und leere Zeilen nicht speichern */
const PLACEHOLDERS = ['neuer prüfpunkt', 'erster prüfpunkt', 'neue hauptgruppe'];
function cleanTemplate(tpl) {
  return {
    groups: tpl.groups.map(g => ({
      id: g.id, title: g.title || 'Hauptgruppe',
      items: g.items.filter(i => i.text)
    }))
  };
}

/* ---------- Ansicht wechseln ---------- */
function render() {
  if (S.fleetEdit && (S.view !== 'fleet' || !amAdmin())) { flushFleetEdit(); S.fleetEdit = false; }
  if (S.view === 'reorder' && !amAdmin()) S.view = 'stock';   // Bestellvorschläge nur für SE/KÖ
  if (S.view === 'list') {
    if (S.edit) renderEdit();
    else { renderFill(); applyHeader(draft.header); renderMonteure(); }
  } else if (S.view === 'archive') renderArchive();
  else if (S.view === 'protocol') renderProtocol();
  else if (S.view === 'fleet') renderFleet();
  else if (S.view === 'vehicle') renderAkte();
  else if (S.view === 'orders') renderOrders();
  else if (S.view === 'order') renderOrder();
  else if (S.view === 'stock') renderStock();
  else if (S.view === 'article') renderArticle();
  else if (S.view === 'reorder') renderReorder();
  renderChrome();
  syncHistory();
}

function switchCategory(cat) {
  flushTemplateSave();
  S.cat = cat;
  lsSet('kds_cat', cat);
  draft = loadDraft(cat);
  S.view = 'list';
  if (S.edit) S.editTpl = structuredClone(tplFor(cat));
  render();
  window.scrollTo(0, 0);
}

/* =====================================================================
   Protokoll abschließen & Archiv
   ===================================================================== */
function buildProtocol() { return buildProtocolFrom(S.cat, draft, S.me); }
function buildProtocolFrom(cat, draft, closedBy) {
  const tpl = tplFor(cat);
  draft = { off: {}, status: {}, notes: {}, monteure: [], header: {}, ...draft };
  const groups = tpl.groups
    .filter(g => !draft.off[g.id])
    .map(g => ({
      title: g.title,
      header: g.items.length === 0,          // absichtlich leere Gruppe = Zwischenüberschrift (z. B. „Service UW“)
      items: g.items.filter(i => !draft.off[i.id]).map(i => {
        const st = draft.status[i.id] || {};
        return { text: i.text, note: draft.notes[i.id] || '', io: !!st.io, nio: !!st.nio, beh: !!st.beh };
      })
    }))
    .filter(g => g.items.length || g.header)   // ganz abgewählte Gruppen fallen weg, Überschriften bleiben
    .map(({ header, ...g }) => g);
  return {
    category: cat,
    header: { ...draft.header },
    monteure: [...draft.monteure],
    closedBy: closedBy || S.me,
    ts: Date.now(),
    groups
  };
}

function protoStats(p) {
  let open = 0, fixed = 0, ok = 0, total = 0;
  (p.groups || []).forEach(g => g.items.forEach(i => {
    total++;
    if (i.nio && !i.beh) open++;
    else if (i.beh) fixed++;
    else if (i.io) ok++;
  }));
  return { open, fixed, ok, total };
}

async function closeProtocol() {
  if (!S.me) { await pickMe(); if (!S.me) return; }
  const fId = $('fId').value.trim();
  if (!fId) { showToast('Bitte zuerst „ID / Fahrzeug“ eintragen'); $('fId').focus(); return; }
  const p = buildProtocol();
  const st = protoStats(p);
  const hint = st.open ? ` ${st.open} Punkt(e) sind n.i.O. und noch nicht behoben.` : '';
  const ok = await confirmModal(`Protokoll für „${fId}“ (${S.cat}) abschließen und ins Archiv übernehmen?${hint} Danach ist die Liste wieder leer für das nächste Fahrzeug.`, 'Abschließen', false);
  if (!ok) return;
  try {
    await S.store.addProtocol(p);
  } catch (e) {
    showToast('Speichern fehlgeschlagen – Protokoll bleibt erhalten');
    return;
  }
  // Beim Fahrzeug im Fuhrpark „letzter Service“ eintragen (nur wenn neuer als der bisherige)
  const veh = p.header.vehId && S.vehicles.find(x => x.id === p.header.vehId);
  const day = (p.header.fDate && /^\d{4}-\d{2}-\d{2}$/.test(p.header.fDate)) ? p.header.fDate : todayIso();
  if (veh && (!veh.letzterService || day > veh.letzterService)) S.store.setLastService(veh.id, day, S.me).catch(() => {});
  draft = emptyDraft();
  saveDraft();
  const oid = p.header.orderId;
  if (oid && S.orders.some(x => x.id === oid)) {          // Serviceliste gehört zu einem Auftrag → dorthin zurück
    openOrder(oid); showToast(`Serviceliste ${p.category} abgeschlossen und im Auftrag abgelegt`); return;
  }
  render();
  window.scrollTo(0, 0);
  showToast('Protokoll gespeichert – zu finden im Archiv');
}

function fmtDate(p) {
  const v = p.header && p.header.fDate;
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y, m, d] = v.split('-'); return `${d}.${m}.${y}`; }
  const d = new Date(p.ts || 0);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function renderArchive() {
  const q = $('arch-search').value.trim().toLowerCase();
  const cat = $('arch-cat').value;
  const list = S.protocols
    .filter(p => !cat || p.category === cat)
    .filter(p => {
      if (!q) return true;
      const hay = [
        p.header && p.header.fId, p.header && p.header.kz, p.header && p.header.werk, p.category, p.closedBy, monteurLabel(p.closedBy),
        ...(p.monteure || []).map(monteurLabel),
        ...(p.groups || []).flatMap(g => [g.title, ...g.items.flatMap(i => [i.text, i.note])])
      ].join(' ').toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));

  const box = $('arch-list');
  if (!list.length) {
    box.innerHTML = `<div class="empty-note">${S.protocols.length ? 'Keine Protokolle zu dieser Suche.' : 'Noch keine abgeschlossenen Protokolle.<br>Über „Protokoll abschließen“ landet eine Serviceliste hier.'}</div>`;
    return;
  }
  box.innerHTML = list.map(p => {
    const st = protoStats(p);
    const badges = [`<span class="badge cat">${esc(p.category)}</span>`];
    if (st.open) badges.push(`<span class="badge bad">${st.open} offen</span>`);
    if (st.fixed) badges.push(`<span class="badge pend">${st.fixed} behoben</span>`);
    if (!st.open && !st.fixed && st.ok) badges.push('<span class="badge ok">i.O.</span>');
    if (p.editedBy) badges.push(`<span class="badge cat" title="bearbeitet von ${esc(p.editedBy)}">✎ bearbeitet</span>`);
    if (p._pending) badges.push('<span class="badge pend" title="Wird übertragen, sobald Netz da ist">⟳</span>');
    const mont = (p.monteure || []).join(', ');
    return `
      <button class="arch-row" data-pid="${esc(p.id)}" type="button">
        <span class="arch-date">${esc(fmtDate(p))}</span>
        <span class="arch-main">
          <span class="veh">${esc((p.header && p.header.fId) || '—')}</span>
          <span class="meta" style="display:block">${mont ? 'Monteure: ' + esc(mont) + ' · ' : ''}abgeschlossen von ${esc(p.closedBy || '?')}</span>
        </span>
        <span class="badges">${badges.join('')}</span>
      </button>`;
  }).join('');
}

function renderProtocol() {
  const p = S.protocols.find(x => x.id === S.openId);
  if (!p) { S.view = 'archive'; S.protoEdit = false; render(); return; }
  const editing = S.protoEdit && amAdmin();
  if (!editing) S.protoEdit = false;
  applyHeader(p.header || {});
  const fmt = (ts) => new Date(ts || 0).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  $('proto-info').innerHTML = `<b>${esc((p.header && p.header.fId) || '—')}</b> · ${esc(p.category)} · abgeschlossen von ${esc(monteurLabel(p.closedBy || '?'))} am ${esc(fmt(p.ts))}`
    + (p.editedBy ? `<br><small>zuletzt bearbeitet von ${esc(monteurLabel(p.editedBy))} am ${esc(fmt(p.editedAt))}</small>` : '')
    + (editing ? '<br><b style="color:var(--orange-dk)">Bearbeiten – Kopfdaten, Haken, Bemerkungen und Monteure sind änderbar.</b>' : '');
  $('btn-del-proto').classList.toggle('hidden', !amAdmin() || editing);
  $('btn-edit-proto').classList.toggle('hidden', !amAdmin() || editing);
  $('btn-proto-order').classList.toggle('hidden', editing || !protoStats(p).open);
  $('btn-back-proto').classList.toggle('hidden', editing);
  $('btn-save-proto').classList.toggle('hidden', !editing);
  $('btn-cancel-proto').classList.toggle('hidden', !editing);

  const chk = (v) => `<input type="checkbox" class="chk-view" ${v ? 'checked' : ''} tabindex="-1" aria-readonly="true">`;
  const chkEdit = (v, k) => `<input type="checkbox" class="chk-status" data-k="${k}" ${v ? 'checked' : ''} aria-label="${k}">`;
  $('proto-groups').innerHTML = (p.groups || []).map((g, gi) => `
    <div class="box">
      <div class="sec-title"><div class="title-left"><span class="readonly-title">${esc(g.title)}</span></div></div>
      <table class="service-table st-proto">
        <thead><tr>
          <th class="col-desc">Prüfpunkt / Arbeitsschritt</th><th class="col-note">Bemerkung / Zusatz</th>
          <th class="col-status">i.O.</th><th class="col-status">n.i.O.</th><th class="col-status">behoben</th>
        </tr></thead>
        <tbody>${g.items.map((i, ii) => editing ? `
          <tr data-g="${gi}" data-i="${ii}"><td class="item-text">${esc(i.text)}</td>
          <td contenteditable="true" class="editable-cell proto-note">${esc(i.note)}</td>
          <td class="center">${chkEdit(i.io, 'io')}</td><td class="center">${chkEdit(i.nio, 'nio')}</td><td class="center">${chkEdit(i.beh, 'beh')}</td></tr>` : `
          <tr><td class="item-text">${esc(i.text)}</td><td class="note-view">${esc(i.note)}</td>
          <td class="center">${chk(i.io)}</td><td class="center">${chk(i.nio)}</td><td class="center">${chk(i.beh)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>`).join('');
  if (editing) {
    $('proto-monteure').innerHTML = MONTEURE.map(m => `
      <label class="ms-opt"><input type="checkbox" class="chk-proto-monteur" value="${esc(m.code)}" ${(p.monteure || []).includes(m.code) ? 'checked' : ''}>
      <code>${esc(m.code)}</code><span>${esc(m.name)}</span></label>`).join('');
  } else {
    $('proto-monteure').textContent = (p.monteure || []).map(monteurLabel).join(', ') || '—';
  }
  $('proto-meta').textContent = '';
}

/* Bearbeitetes Protokoll aus der Ansicht auslesen und speichern (nur Admin) */
async function saveProtocolEdit() {
  const p = S.protocols.find(x => x.id === S.openId);
  if (!p || !amAdmin()) return;
  const groups = (p.groups || []).map(g => ({ ...g, items: g.items.map(i => ({ ...i })) }));
  document.querySelectorAll('#proto-groups tr[data-g]').forEach(tr => {
    const it = groups[+tr.dataset.g].items[+tr.dataset.i];
    it.note = tr.querySelector('.proto-note').innerText.trim();
    ['io', 'nio', 'beh'].forEach(k => { it[k] = tr.querySelector(`.chk-status[data-k="${k}"]`).checked; });
  });
  const header = {};
  HEADER_FIELDS.forEach(id => { header[id] = $(id).value.trim(); });
  if (!header.fId) { showToast('„ID / Fahrzeug“ darf nicht leer sein'); $('fId').focus(); return; }
  const monteure = Array.from(document.querySelectorAll('.chk-proto-monteur:checked')).map(c => c.value);
  const now = Date.now();
  const patch = {
    header, monteure, groups,
    editedBy: S.me, editedAt: now,
    edits: [...(Array.isArray(p.edits) ? p.edits : []), { by: S.me, ts: now }].slice(-50)
  };
  const btn = $('btn-save-proto'); btn.disabled = true;
  try {
    await S.store.updateProtocol(p.id, patch);
    Object.assign(p, patch);
    S.protoEdit = false;
    render();
    showToast('Protokoll gespeichert');
  } catch (e) {
    if (e && e.code === 'permission-denied') adminRejected(); else showToast('Speichern fehlgeschlagen');
  } finally { btn.disabled = false; }
}

/* Vor dem Verlassen einer laufenden Bearbeitung nachfragen */
async function leaveProtoEdit() {
  if (!S.protoEdit) return true;
  if (!(await confirmModal('Änderungen am Protokoll verwerfen?', 'Verwerfen'))) return false;
  S.protoEdit = false;
  return true;
}

/* =====================================================================
   „Ich bin“ & Einrichtung
   ===================================================================== */
function mePickerHtml(sel) {
  return `<div class="pick-grid">${MONTEURE.map(m => { const blk = S.gesperrt.includes(m.code); return `
    <button type="button" class="pick ${m.code === sel ? 'sel' : ''} ${blk ? 'blocked' : ''}" data-code="${esc(m.code)}" ${blk ? 'disabled title="gesperrt"' : ''}>
      <code>${esc(m.code)}${isAdmin(m.code) ? ' <small title="mit PIN">🔒</small>' : ''}</code><span>${esc(m.name)}${blk ? ' · gesperrt' : ''}</span>
    </button>`; }).join('')}</div>`;
}

/* „Ich bin“ für Nicht-Admins (Admins nur über PIN, siehe pickMe) */
function setMe(code) {
  S.me = code;
  S.claim = null;
  lsSet('kds_me', code);
  if (S.store) S.store.setMe(code).catch(() => {});
  if (S.edit) { flushTemplateSave(); S.edit = false; }
  render();
}

function setAdminMe(code, claim) {
  S.me = code;
  S.claim = claim;
  lsSet('kds_me', code);
  render();
  applyTextFixes();
}

/* Einmalige Rechtschreib-Korrektur der Werkstatt-Vorlagen (siehe data.js, TEXT_FIXES).
   Läuft nur auf einem Gerät mit gültigem Admin-Nachweis, je Kategorie einmal. */
let fixingTexts = false;
async function applyTextFixes() {
  if (fixingTexts || !amAdmin() || S.edit) return;
  const todo = CATEGORIES.filter(c => S.templates[c] && Array.isArray(S.templates[c].groups)
    && (S.templates[c].textFix || 0) < TEXT_FIX_VERSION);
  if (!todo.length) return;
  fixingTexts = true;
  const fixed = [];
  try {
    for (const c of todo) {
      const { groups, changed } = fixTemplateTexts(S.templates[c]);
      await S.store.saveTemplate(c, { groups }, S.me);
      S.templates[c] = { ...S.templates[c], groups, textFix: TEXT_FIX_VERSION };
      if (changed) fixed.push(c);
    }
    if (fixed.length) {
      if (S.view === 'list' && !S.edit) renderFill();
      showToast('Rechtschreibung in den Vorlagen korrigiert: ' + fixed.join(', '));
    }
  } catch (e) {
    if (e && e.code === 'permission-denied') adminRejected();
  } finally { fixingTexts = false; }
}

/* Werkstatt-Code + Einladen (nur mit gemeinsamer Ablage) */
function inviteHtml() {
  const ws = S.store && S.store.mode === 'cloud' && S.store.workshop;
  if (!ws || !ws.id) return '';
  return `
    <div class="invite-box">
      <h3>Kollegen einladen</h3>
      <p>Link teilen – wer ihn öffnet, wählt sein Kürzel und tippt auf „Beitreten“.</p>
      <div class="invite-row">
        <span class="invite-code">${esc(ws.id.replace(/(.{4})/g, '$1 ').trim())}</span>
        <button class="btn-sec" data-x="invite" type="button">🔗 Einladen</button>
      </div>
    </div>`;
}

const PIN_RE = /^\d{4,12}$/;
const cardHead = '<div class="wm"><span class="bar"></span><span class="txt">Krandienst <em>Schulz</em></span></div>';

/* PIN-Formular. mode: enter = anmelden · first = allererste PIN festlegen ·
   admin = Admin legt PIN fest/ändert sie · missing = für dieses Kürzel gibt es noch keine PIN */
function pinFormHtml(code, mode) {
  const name = monteurLabel(code);
  if (mode === 'missing') {
    return `<h3>${esc(name)} 🔒</h3>
      <p>Für ${esc(code)} ist noch keine PIN festgelegt. Ein Admin kann sie unter ⚙ Einstellungen → „PIN“ festlegen. Bis dahin bitte ein anderes Kürzel wählen.</p>
      <div class="setup-back"><button class="link-btn" data-x="back" type="button">← Zurück</button></div>`;
  }
  const two = mode !== 'enter';
  const title = mode === 'enter' ? `PIN für ${code}` : (mode === 'admin' && S.pinFlags[code]) ? `Neue PIN für ${code}` : `PIN für ${code} festlegen`;
  const hint = mode === 'enter' ? `${name} ist Admin. Bitte PIN eingeben.`
    : mode === 'first' ? 'Mindestens 4 Ziffern. Die PIN wird nirgends im Klartext gespeichert – gut merken.'
    : S.pinFlags[code] ? 'Mindestens 4 Ziffern. Geräte, die mit der alten PIN angemeldet sind, verlieren dabei ihre Admin-Rechte.'
    : 'Mindestens 4 Ziffern. Danach kann sich ' + name + ' mit dieser PIN anmelden.';
  return `<h3>${esc(title)}</h3><p>${esc(hint)}</p>
    <form id="pin-form" autocomplete="off" novalidate>
      <div class="field"><label for="pin1">PIN</label>
        <input id="pin1" class="pin" type="password" inputmode="numeric" maxlength="12" autocomplete="${two ? 'new-password' : 'current-password'}"></div>
      ${two ? `<div class="field"><label for="pin2">PIN wiederholen</label>
        <input id="pin2" class="pin" type="password" inputmode="numeric" maxlength="12" autocomplete="new-password"></div>` : ''}
      <button class="btn-big" type="submit">${mode === 'enter' ? 'Anmelden' : 'PIN speichern'}</button>
      <div class="setup-err" id="pin-err"></div>
    </form>
    <div class="setup-back"><button class="link-btn" data-x="back" type="button">← Zurück</button></div>`;
}

const fmtCode = (c) => String(c || '').replace(/(.{4})(?=.)/g, '$1 ');

/* ---------- Wiederherstellungs-Code einmalig anzeigen ---------- */
function showRecovery(code, rc, ov) {
  return new Promise(resolve => {
    ov = ov || $('setup');
    ov.innerHTML = `<div class="setup-card">${cardHead}
      <h3>Wiederherstellungs-Code für ${esc(code)}</h3>
      <p>Damit lässt sich die PIN zurücksetzen, falls sie vergessen wird (⚙ Einstellungen → „PIN vergessen?“).
      <b>Jetzt aufschreiben und sicher aufbewahren</b> – der Code wird nur dieses eine Mal angezeigt.</p>
      <div class="rec-code" id="rec-code">${rc.split('-').map(g => `<span>${esc(g)}</span>`).join('<i>-</i>')}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <button class="btn-sec" type="button" data-r="copy">📋 Kopieren</button>
      </div>
      <button class="btn-big" type="button" data-r="ok">Ich habe den Code notiert</button>
    </div>`;
    ov.classList.remove('hidden');
    const prevClick = ov.onclick, prevSubmit = ov.onsubmit;
    ov.onsubmit = null;
    ov.onclick = async (e) => {
      const r = e.target.closest('[data-r]');
      if (!r) return;
      if (r.dataset.r === 'copy') {
        try { await navigator.clipboard.writeText(rc); showToast('Code kopiert'); } catch (err) { showToast('Bitte abschreiben'); }
        return;
      }
      ov.onclick = prevClick; ov.onsubmit = prevSubmit;
      resolve();
    };
  });
}

/* ---------- Dunkelmodus ---------- */
const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function themePref() { return lsGet('kds_theme', 'auto'); }
function applyTheme() {
  const pref = themePref();
  const dark = pref === 'dark' || (pref === 'auto' && darkQuery && darkQuery.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', applyTheme);

/* ---------- Einstellungen (Zahnrad oben rechts) ---------- */
function openSettings() {
  const ov = $('setup');
  let screen = 'main', ctx = {};
  const others = () => ADMINS.filter(c => c !== S.me);
  const pinField = (id, label, auto) => `<div class="field"><label for="${id}">${label}</label>
      <input id="${id}" class="pin" type="password" inputmode="numeric" maxlength="12" autocomplete="${auto || 'off'}"></div>`;
  const back = '<div class="setup-back"><button class="link-btn" data-s="main" type="button">← Zurück</button></div>';

  const html = () => {
    if (screen === 'change') return `<h3>Meine PIN ändern (${esc(S.me)})</h3>
      <p>Geräte, die mit der alten PIN angemeldet sind, verlieren dabei ihre Admin-Rechte.</p>
      <form id="set-form" novalidate>${pinField('old-pin', 'Aktuelle PIN', 'current-password')}${pinField('new-pin1', 'Neue PIN', 'new-password')}${pinField('new-pin2', 'Neue PIN wiederholen', 'new-password')}
      <button class="btn-big" type="submit">PIN ändern</button><div class="setup-err" id="set-err"></div></form>${back}`;
    if (screen === 'other') return `<h3>PIN für ${esc(ctx.code)} ${S.pinFlags[ctx.code] ? 'zurücksetzen' : 'festlegen'}</h3>
      <p>Neue PIN für ${esc(monteurLabel(ctx.code))}. Danach wird ein Wiederherstellungs-Code für ${esc(ctx.code)} angezeigt – bitte an ${esc(ctx.code)} weitergeben.</p>
      <form id="set-form" novalidate>${pinField('new-pin1', 'Neue PIN', 'new-password')}${pinField('new-pin2', 'Neue PIN wiederholen', 'new-password')}
      <button class="btn-big" type="submit">PIN speichern</button><div class="setup-err" id="set-err"></div></form>${back}`;
    if (screen === 'switch') {
      const ws = S.store.workshop;
      return `<h3>Andere Werkstatt beitreten</h3>
        <p>Dieses Gerät ist gerade in der Werkstatt <b class="ws-inline">${esc(ws ? fmtCode(ws.id) : '–')}</b>.
        Den Code der richtigen Werkstatt findet ein Kollege dort unter „Nutzer“ → „Kollegen einladen“.</p>
        <form id="set-form" novalidate>
          <div class="field"><label for="sw-code">Werkstatt-Code</label>
            <input id="sw-code" class="code" maxlength="24" autocomplete="off" placeholder="XXXX XXXX XXXX XXXX"></div>
          <p style="font-size:13px">Danach Kürzel wählen (SE/KÖ mit der PIN <b>dieser</b> Werkstatt) und „Beitreten“ tippen.
          Die bisherige Werkstatt wird auf diesem Gerät verlassen – ihre Daten bleiben erhalten.</p>
          <button class="btn-big" type="submit">Wechseln</button>
          <div class="setup-err" id="set-err"></div>
        </form>${back}`;
    }
    if (screen === 'import') {
      const m = ctx.mig;
      const cats = m ? CATEGORIES.filter(c => m.templates[c]) : [];
      const count = (t) => ({ g: t.groups.length, i: t.groups.reduce((n, g) => n + g.items.length, 0) });
      return `<h3>Daten aus alter Version übernehmen</h3>
        <p>So geht's: <b>1.</b> Auf dem PC, auf dem die alte Serviceliste benutzt wurde, die
        <a href="tools/KDS-Datenexport.html" download="KDS-Datenexport.html">Export-Datei herunterladen</a>,
        im <b>selben Browser</b> öffnen und „Als Datei speichern“ wählen. <b>2.</b> Die entstandene
        Datei <code>KDS-Altdaten.json</code> hier auswählen.</p>
        <form id="set-form" novalidate>
          <div class="field"><label for="imp-file">${ctx.fileName ? 'Andere Datei wählen' : 'Datei'}</label>
            <input id="imp-file" type="file" accept=".json,application/json"></div>
          ${ctx.fileName && m ? `<p style="margin:0 0 8px;font-size:13px">Eingelesen: <b>${esc(ctx.fileName)}</b></p>` : ''}
          ${ctx.err ? `<div class="setup-err">${esc(ctx.err)}</div>` : ''}
          ${m ? `
            ${cats.length ? `
            <p style="margin:6px 0"><b>Vorlagen</b> – Haken setzen, welche <b>für alle Geräte ersetzt</b> werden
            (vorausgewählt nur, wo die Werkstatt noch die eingebaute Standardliste nutzt):</p>
            <div class="set-list" style="margin-bottom:10px">
              ${cats.map(c => { const a = count(m.templates[c]), b = count(tplFor(c)); return `
                <label class="set-btn" style="cursor:pointer"><span><input type="checkbox" class="imp-cat" value="${esc(c)}" ${S.templates[c] ? '' : 'checked'} style="margin-right:8px">${esc(c)}</span>
                <small>alt: ${a.g} Gruppen / ${a.i} Punkte · jetzt: ${b.g} / ${b.i}</small></label>`; }).join('')}
            </div>
            <label style="display:flex;gap:8px;align-items:flex-start;font-size:14px;margin-bottom:12px">
              <input type="checkbox" id="imp-drafts" style="margin-top:3px">
              <span>Auch die damals <b>laufenden Eingaben</b> (Fahrzeug, Haken, Bemerkungen, Monteure) auf <b>dieses Gerät</b> übernehmen – ersetzt die aktuelle, noch nicht abgeschlossene Liste der gewählten Kategorien.</span>
            </label>` : ''}
            ${m.fleet && m.fleet.length ? `
            <p style="margin:6px 0"><b>Fuhrpark</b> – vorhandene Fahrzeuge bleiben unverändert, nur neue werden angelegt:</p>
            <div class="set-list" style="margin-bottom:12px">
              <label class="set-btn" style="cursor:pointer"><span><input type="checkbox" id="imp-fleet" ${newVehicles(m.fleet).length ? 'checked' : ''} style="margin-right:8px">Fahrzeuge übernehmen</span>
              <small>${m.fleet.length} in der Datei · ${newVehicles(m.fleet).length} neu</small></label>
            </div>` : ''}
            ${cats.length || (m.fleet && m.fleet.length) ? '<button class="btn-big" type="submit">Übernehmen</button>'
              : '<div class="setup-err">In der Datei sind weder Listen noch Fahrzeuge der alten Version enthalten.</div>'}` : ''}
          <div class="setup-err" id="set-err"></div>
        </form>${back}`;
    }
    if (screen === 'fleetxls') {
      const L = ctx.fleet, by = {};
      (L || []).forEach(v => { by[v.gruppe || 'Ohne Gruppe'] = (by[v.gruppe || 'Ohne Gruppe'] || 0) + 1; });
      const same = L ? L.filter(v => S.vehicles.some(o => o.code && o.code === v.code)).length : 0;
      return `<h3>Fuhrpark aus Excel ersetzen</h3>
        <p>Die Fahrzeugliste (wie „Fz.-Ident-Nr.“) auswählen. Gelesen wird das Blatt mit den Gruppen
        (KRANE, Ladekrane, Zugmaschinen …) und den Spalten Id-Nr., Hersteller, Fahrzeug, Kennzeichen, Fahrer,
        Fahrgestellnummer, Werk-Nr. und B-Jahr. Das Blatt „Verkauf“ wird nicht übernommen.</p>
        <form id="set-form" novalidate>
          <div class="field"><label for="fx-file">${ctx.fileName ? 'Andere Datei wählen' : 'Excel-Datei'}</label>
            <input id="fx-file" type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></div>
          ${ctx.loading ? '<p>Datei wird gelesen …</p>' : ''}
          ${ctx.err ? `<div class="setup-err">${esc(ctx.err)}</div>` : ''}
          ${L ? `
            <p style="margin:6px 0 4px">Eingelesen: <b>${esc(ctx.fileName)}</b> – Blatt „${esc(ctx.sheet)}“</p>
            <div class="set-list" style="margin-bottom:10px">
              ${Object.entries(by).map(([g, n]) => `<div class="set-btn" style="cursor:default">${esc(g)} <small>${n} Fahrzeuge</small></div>`).join('')}
            </div>
            <label style="display:flex;gap:8px;align-items:flex-start;font-size:14px;margin-bottom:12px">
              <input type="checkbox" id="fx-keep" checked style="margin-top:3px">
              <span>Termine (UVV, HU, SP, letzter Service) von Fahrzeugen mit <b>gleicher ID</b> behalten – betrifft ${same} von ${L.length}.
              Die Excel-Liste enthält keine Termine.</span>
            </label>
            <p class="setup-err" style="margin-bottom:10px">Achtung: Alle ${S.vehicles.length} Fahrzeuge im Fuhrpark werden gelöscht und durch die ${L.length} aus der Datei ersetzt.</p>
            <button class="btn-big btn-danger-big" type="submit">Fuhrpark ersetzen (${L.length} Fahrzeuge)</button>` : ''}
          <div class="setup-err" id="set-err"></div>
        </form>${back}`;
    }
    if (screen === 'block') {
      const c = ctx.code, blk = S.gesperrt.includes(c);
      const n = S.memberList.filter(m => m.monteur === c).length;
      return `<h3>${esc(monteurLabel(c))} ${blk ? 'entsperren' : 'sperren'}</h3>
        ${blk ? `<p><b>${esc(c)}</b> ist gesperrt. Beim Entsperren kann das Kürzel wieder gewählt werden, und gesperrte Geräte
          können der Werkstatt mit dem Code oder Einladungslink wieder beitreten.</p>`
        : `<p>Nach dem Sperren kann niemand mehr <b>${esc(c)}</b> als Nutzer wählen. ${n ? `<b>${n} ${n === 1 ? 'Gerät ist' : 'Geräte sind'}</b> gerade als ${esc(c)} angemeldet – ${n === 1 ? 'es verliert' : 'sie verlieren'} sofort den Zugriff und ${n === 1 ? 'kann' : 'können'} nicht erneut beitreten.` : 'Gerade ist kein Gerät als ' + esc(c) + ' angemeldet.'}</p>
          <p style="font-size:13px">Bereits erfasste Protokolle, Aufträge und Buchungen von ${esc(c)} bleiben erhalten.</p>`}
        <form id="set-form" novalidate>
          <button class="btn-big ${blk ? '' : 'btn-danger-big'}" type="submit">${blk ? 'Entsperren' : esc(c) + ' sperren'}</button>
          <div class="setup-err" id="set-err"></div>
        </form>${back}`;
    }
    if (screen === 'forgot') return `<h3>PIN vergessen?</h3>
      <p>Mit dem Wiederherstellungs-Code, der beim Festlegen der PIN angezeigt wurde, eine neue PIN setzen.
      Ohne Code: Der andere Admin kann die PIN unter ⚙ Einstellungen zurücksetzen.</p>
      <form id="set-form" novalidate>
        <div class="field"><label for="fg-code">Kürzel</label>
          <select id="fg-code">${ADMINS.map(c => `<option value="${esc(c)}">${esc(monteurLabel(c))}</option>`).join('')}</select></div>
        <div class="field"><label for="fg-rec">Wiederherstellungs-Code</label>
          <input id="fg-rec" class="code" maxlength="24" autocomplete="off" placeholder="XXXX-XXXX-XXXX-XXXX"></div>
        ${pinField('new-pin1', 'Neue PIN', 'new-password')}${pinField('new-pin2', 'Neue PIN wiederholen', 'new-password')}
        <button class="btn-big" type="submit">PIN zurücksetzen</button><div class="setup-err" id="set-err"></div></form>${back}`;
    // Hauptseite
    const t = themePref();
    const admin = amAdmin();
    const cloud = S.store && S.store.mode === 'cloud';
    const myFlag = S.pinFlags[S.me] || {};
    return `<h3>⚙ Einstellungen</h3>
      <div class="set-section" style="border-top:0;margin-top:6px;padding-top:0">
        <h4>Darstellung</h4>
        <div class="seg" role="group" aria-label="Darstellung">
          <button type="button" data-theme-set="light" class="${t === 'light' ? 'on' : ''}">☀︎ Hell</button>
          <button type="button" data-theme-set="dark" class="${t === 'dark' ? 'on' : ''}">☾ Dunkel</button>
          <button type="button" data-theme-set="auto" class="${t === 'auto' ? 'on' : ''}">Automatisch</button>
        </div>
        <p style="margin:6px 0 0;font-size:12px">„Automatisch“ folgt der Einstellung des Geräts. Gilt nur für dieses Gerät. Gedruckt wird immer hell.</p>
      </div>
      <div class="set-section">
        <h4>PIN (Admins ${esc(ADMINS.join(', '))})</h4>
        <div class="set-list">
          ${admin ? `
          <button class="set-btn" type="button" data-s="change">Meine PIN ändern <small>${esc(S.me)}</small></button>
          <button class="set-btn" type="button" data-s="newrec">Neuen Wiederherstellungs-Code erstellen <small>${myFlag.rec ? 'ersetzt den alten' : 'noch keiner vorhanden'}</small></button>
          ${others().map(c => `<button class="set-btn" type="button" data-s="other" data-code="${esc(c)}">PIN für ${esc(c)} ${S.pinFlags[c] ? 'zurücksetzen' : 'festlegen'} <small>${esc(monteurLabel(c))}</small></button>`).join('')}
          ` : `<p style="margin:0 0 4px;font-size:13px">PIN ändern und für andere zurücksetzen können angemeldete Admins.</p>`}
          <button class="set-btn" type="button" data-s="forgot">PIN vergessen? <small>mit Wiederherstellungs-Code</small></button>
        </div>
      </div>
      ${cloud && S.store.workshop ? `
      <div class="set-section">
        <h4>Werkstatt</h4>
        <div class="set-list">
          <button class="set-btn" type="button" data-s="switch">Andere Werkstatt beitreten <small>jetzt: ${esc(fmtCode(S.store.workshop.id))}</small></button>
        </div>
      </div>` : ''}
      ${admin && cloud ? `
      <div class="set-section">
        <h4>Nutzer sperren</h4>
        <div class="set-list">
          ${MONTEURE.filter(m => !isAdmin(m.code)).map(m => { const blk = S.gesperrt.includes(m.code), n = S.memberList.filter(x => x.monteur === m.code).length; return `
          <button class="set-btn ${blk ? 'set-blocked' : ''}" type="button" data-s="block" data-code="${esc(m.code)}">${esc(m.code)} · ${esc(m.name)}
            <small>${blk ? '⛔ gesperrt – antippen zum Entsperren' : (n ? n + (n === 1 ? ' Gerät' : ' Geräte') + ' · aktiv' : 'aktiv')}</small></button>`; }).join('')}
        </div>
      </div>` : ''}
      ${admin ? `
      <div class="set-section">
        <h4>Daten</h4>
        <div class="set-list">
          <button class="set-btn" type="button" data-s="fleetxls">Fuhrpark aus Excel ersetzen <small>Fahrzeugliste .xls / .xlsx</small></button>
          <button class="set-btn" type="button" data-s="import">Daten aus alter Version übernehmen <small>KDS-Altdaten.json</small></button>
        </div>
      </div>` : ''}
      ${cloud ? '' : '<p style="font-size:12px;margin-top:14px">Probemodus: Einstellungen gelten nur auf diesem Gerät.</p>'}
      <div class="setup-back"><button class="link-btn" data-s="close" type="button">Schließen</button></div>`;
  };
  const draw = () => {
    ov.innerHTML = `<div class="setup-card">${cardHead}${html()}</div>`;
    ov.classList.remove('hidden');
    const f = ov.querySelector('input'); if (f && screen !== 'main') f.focus();
  };
  const close = () => { ov.classList.add('hidden'); ov.onclick = null; ov.onsubmit = null; ov.onchange = null; };
  draw();

  ov.onchange = async (e) => {
    if (e.target.id === 'fx-file' && e.target.files.length) {
      const file = e.target.files[0];
      ctx = { fileName: file.name, loading: true }; draw();
      try {
        if (file.size > 10 * 1024 * 1024) throw new Error('Die Datei ist zu groß.');
        const XLSX = await loadXLSX();
        const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
        const name = wb.SheetNames.find(n => /id/i.test(n) && !/verkauf/i.test(n)) || wb.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' });
        const list = parseFleetRows(rows);
        if (!list.length) throw new Error('In der Datei wurden keine Fahrzeuge gefunden (erste Spalte = Id-Nr.).');
        ctx = { fileName: file.name, sheet: name, fleet: list };
      } catch (ex) { ctx = { fileName: file.name, err: ex.message || 'Die Datei konnte nicht gelesen werden.' }; }
      draw(); return;
    }
    if (e.target.id !== 'imp-file' || !e.target.files.length) return;
    const file = e.target.files[0];
    ctx = { err: '', mig: null, fileName: file.name };
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Die Datei ist zu groß für eine Export-Datei.');
      const data = JSON.parse(await file.text());
      if (!data || data.format !== 'kds-legacy-export' || typeof data.keys !== 'object' || !data.keys) throw new Error('Das ist keine KDS-Export-Datei.');
      const map = {};
      Object.entries(data.keys).forEach(([k, v]) => { if (typeof v === 'string') map[k] = v; });
      ctx.mig = migrateOldData(storeFromMap(map));
      ctx.mig.fleet = legacyFleet(storeFromMap(map));
    } catch (ex) {
      ctx.err = ex instanceof SyntaxError ? 'Die Datei konnte nicht gelesen werden (kein gültiges JSON).' : (ex.message || 'Die Datei konnte nicht gelesen werden.');
    }
    draw();
  };

  ov.onclick = async (e) => {
    const th = e.target.closest('[data-theme-set]');
    if (th) { lsSet('kds_theme', th.dataset.themeSet); applyTheme(); draw(); return; }
    const b = e.target.closest('[data-s]');
    if (!b) return;
    const go = b.dataset.s;
    if (go === 'close') { close(); return; }
    if (go === 'newrec') {
      if (!amAdmin()) return;
      if (!(await confirmModal(`Neuen Wiederherstellungs-Code für ${S.me} erstellen? Ein alter Code wird damit ungültig.`, 'Erstellen', false))) return;
      try {
        const rc = await S.store.createRecovery(S.me);
        S.pinFlags = { ...S.pinFlags, [S.me]: { set: true, rec: true } };
        await showRecovery(S.me, rc, ov);
        screen = 'main'; draw();
      } catch (err) { showToast(err.message || 'Das hat nicht geklappt'); }
      return;
    }
    screen = go; ctx = { code: b.dataset.code };
    draw();
  };

  async function doImport() {
    const err = $('set-err'), btn = ov.querySelector('#set-form button[type="submit"]');
    const cats = Array.from(ov.querySelectorAll('.imp-cat:checked')).map(c => c.value);
    const withDrafts = $('imp-drafts') && $('imp-drafts').checked;
    const fleetNew = ($('imp-fleet') && $('imp-fleet').checked) ? newVehicles(ctx.mig.fleet || []) : [];
    if (!cats.length && !fleetNew.length) { err.textContent = 'Bitte etwas zum Übernehmen anhaken (oder es gibt keine neuen Fahrzeuge).'; return; }
    if (!amAdmin()) { err.textContent = 'Bitte zuerst als Admin anmelden.'; return; }
    if (S.store.mode === 'cloud' && !navigator.onLine) { err.textContent = 'Zum Übernehmen wird Internet gebraucht.'; return; }
    const what = [cats.length ? `Vorlagen ${cats.join(', ')} für alle Geräte ersetzen` : '', fleetNew.length ? `${fleetNew.length} Fahrzeuge in den Fuhrpark übernehmen` : ''].filter(Boolean).join(' und ');
    if (!(await confirmModal(what.charAt(0).toUpperCase() + what.slice(1) + '?', 'Übernehmen', !!cats.length))) return;
    btn.disabled = true; err.textContent = 'Wird übernommen …';
    try {
      flushTemplateSave();
      for (const c of cats) {
        const tpl = cleanTemplate(fixTemplateTexts(ctx.mig.templates[c]));   // bekannte Tippfehler gleich mit korrigieren
        await S.store.saveTemplate(c, tpl, S.me);
        S.templates[c] = { ...tpl, updatedBy: S.me };
        if (withDrafts && ctx.mig.drafts[c]) lsSet(draftKey(c), JSON.stringify(ctx.mig.drafts[c]));
      }
      for (const v of fleetNew) await S.store.saveVehicleNow(null, v, S.me);
      draft = loadDraft(S.cat);
      if (S.edit) { S.edit = false; S.editTpl = null; }
      render();
      showToast('Übernommen: ' + [...cats, fleetNew.length ? fleetNew.length + ' Fahrzeuge' : ''].filter(Boolean).join(', '));
      screen = 'main'; ctx = {}; draw();
    } catch (ex) {
      console.error(ex);
      if (ex && ex.code === 'permission-denied') { close(); adminRejected(); return; }
      err.textContent = 'Übernehmen fehlgeschlagen – bitte erneut versuchen.';
      btn.disabled = false;
    }
  }

  ov.onsubmit = async (e) => {
    e.preventDefault();
    if (screen === 'import') { await doImport(); return; }
    if (screen === 'fleetxls') {
      const err = $('set-err'), btn = ov.querySelector('#set-form button[type="submit"]');
      if (!amAdmin()) { err.textContent = 'Bitte zuerst als Admin anmelden.'; return; }
      if (!ctx.fleet) return;
      if (!(await confirmModal(`Alle ${S.vehicles.length} Fahrzeuge löschen und ${ctx.fleet.length} aus der Excel-Liste übernehmen?`, 'Ersetzen'))) return;
      const keep = $('fx-keep') && $('fx-keep').checked;
      const list = ctx.fleet.map(v => {
        const d = {}; VEHICLE_FIELDS.forEach(f => { d[f] = v[f] || ''; });
        const o = keep && S.vehicles.find(x => x.code && x.code === v.code);
        if (o) { ['uvv', 'hu', 'sp', 'letzterService', 'letzterServiceVon'].forEach(f => { if (o[f]) d[f] = o[f]; }); }
        return d;
      });
      btn.disabled = true; err.textContent = 'Wird ersetzt …';
      try {
        flushFleetEdit();
        const r = await S.store.replaceFleet(list, S.me);
        S.selVeh = null;
        showToast(`Fuhrpark ersetzt: ${r.added} Fahrzeuge übernommen, ${r.deleted} alte entfernt`);
        close(); if (S.view !== 'fleet') { S.view = 'fleet'; render(); }
      } catch (ex) { btn.disabled = false; err.textContent = ex.message || 'Das hat nicht geklappt'; }
      return;
    }
    if (screen === 'block') {
      const err = $('set-err'), btn = ov.querySelector('#set-form button[type="submit"]');
      if (!amAdmin()) { err.textContent = 'Bitte zuerst als Admin anmelden.'; return; }
      const c = ctx.code, blk = !S.gesperrt.includes(c);
      btn.disabled = true; err.textContent = blk ? 'Wird gesperrt …' : 'Wird entsperrt …';
      try {
        const n = await S.store.setBlocked(c, blk);
        S.gesperrt = blk ? [...new Set([...S.gesperrt, c])] : S.gesperrt.filter(x => x !== c);
        showToast(blk ? `${c} gesperrt${n ? ' – ' + n + (n === 1 ? ' Gerät' : ' Geräte') + ' ausgesperrt' : ''}` : `${c} entsperrt`);
        screen = 'main'; draw();
      } catch (ex) { btn.disabled = false; err.textContent = ex.message || 'Das hat nicht geklappt'; }
      return;
    }
    if (screen === 'switch') {
      const err = $('set-err');
      const code = $('sw-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 16) { err.textContent = 'Der Werkstatt-Code hat 16 Zeichen.'; return; }
      if (S.store.workshop && code === S.store.workshop.id) { err.textContent = 'In dieser Werkstatt ist das Gerät bereits.'; return; }
      if (!navigator.onLine) { err.textContent = 'Zum Wechseln wird Internet gebraucht.'; return; }
      if (!(await confirmModal('Die bisherige Werkstatt auf diesem Gerät verlassen und der neuen beitreten?', 'Wechseln', false))) return;
      if (S.edit) flushTemplateSave();
      S.store.leave();
      lsSet('kds_me', '');                 // Kürzel wird beim Beitreten neu gewählt (Admins mit PIN der neuen Werkstatt)
      location.href = location.pathname + '?code=' + code;
      return;
    }
    const err = $('set-err'), btn = ov.querySelector('#set-form button[type="submit"]');
    const p1 = $('new-pin1').value.trim(), p2 = $('new-pin2').value.trim();
    if (!PIN_RE.test(p1)) { err.textContent = 'Die neue PIN besteht aus 4 bis 12 Ziffern.'; return; }
    if (p1 !== p2) { err.textContent = 'Die beiden Eingaben der neuen PIN stimmen nicht überein.'; return; }
    btn.disabled = true; err.textContent = 'Wird geprüft …';
    try {
      if (screen === 'change') {
        if (!amAdmin()) throw new Error('Bitte zuerst als Admin anmelden.');
        const old = $('old-pin').value.trim();
        await S.store.claimAdmin(S.me, old).catch(() => { throw new Error('Aktuelle PIN falsch.'); });
        await S.store.setPin(S.me, p1);
        const claim = await S.store.claimAdmin(S.me, p1);
        setAdminMe(S.me, claim);
        showToast('PIN geändert');
      } else if (screen === 'other') {
        if (!amAdmin()) throw new Error('Bitte zuerst als Admin anmelden.');
        const rc = await S.store.setPin(ctx.code, p1, { recovery: true });
        S.pinFlags = { ...S.pinFlags, [ctx.code]: { set: true, rec: true } };
        await showRecovery(ctx.code, rc, ov);
        showToast(`PIN für ${ctx.code} gespeichert`);
      } else if (screen === 'forgot') {
        const code = $('fg-code').value, rec = $('fg-rec').value;
        if (rec.replace(/[^A-Za-z0-9]/g, '').length !== 16) throw new Error('Der Wiederherstellungs-Code hat 16 Zeichen.');
        const res = await S.store.resetPinWithRecovery(code, rec, p1);
        S.pinFlags = { ...S.pinFlags, [code]: { set: true, rec: true } };
        if (S.edit) { flushTemplateSave(); S.edit = false; }
        setAdminMe(code, res.claim);
        await showRecovery(code, res.recovery, ov);
        showToast(`Neue PIN für ${code} gesetzt – angemeldet als ${code}`);
      }
      screen = 'main'; draw();
    } catch (ex) {
      console.error(ex);
      err.textContent = (ex && ex.message) || 'Das hat nicht geklappt.';
      btn.disabled = false;
    }
  };
}

/* Auswahl „Ich bin“ als Dialog – Admins (SE, KÖ) nur mit PIN */
function pickMe(allowCancel = true, notice = '') {
  return new Promise(resolve => {
    const ov = $('setup');
    let pinCtx = null;
    const shell = (inner) => { ov.innerHTML = `<div class="setup-card">${cardHead}${inner}</div>`; ov.classList.remove('hidden'); };
    const close = (v) => { ov.classList.add('hidden'); ov.onclick = null; ov.onsubmit = null; resolve(v); };
    const showPicker = () => {
      pinCtx = null;
      shell(`
        ${notice ? `<p class="setup-err">${esc(notice)}</p>` : ''}
        <h3>Wer bist du?</h3>
        <p>Gilt für dieses Gerät. Im Archiv steht dann, wer ein Protokoll abgeschlossen hat. 🔒 = nur mit PIN.</p>
        ${mePickerHtml(S.me)}
        ${inviteHtml()}
        ${allowCancel ? '<div class="setup-back"><button class="link-btn" data-x="cancel" type="button">Schließen</button></div>' : ''}`);
    };
    const showPin = (code, mode) => {
      pinCtx = { code, mode };
      shell(pinFormHtml(code, mode));
      const i = $('pin1'); if (i) i.focus();
    };
    showPicker();

    ov.onclick = async (e) => {
      if (e.target.closest('[data-x="invite"]')) { invite(); return; }
      if (e.target.closest('[data-x="back"]')) { showPicker(); return; }
      if (e.target.closest('[data-x="cancel"]')) { close(null); return; }
      const b = e.target.closest('.pick');
      if (!b) return;
      const code = b.dataset.code;
      if (!isAdmin(code)) { setMe(code); close(code); return; }
      if (amAdmin() && S.me === code) { close(code); return; }
      let flags = S.pinFlags;
      try { flags = await S.store.getPinFlags(); S.pinFlags = flags; } catch (err) { /* offline: bekannter Stand */ }
      if (flags[code]) showPin(code, 'enter');
      else if (!Object.keys(flags).length) showPin(code, 'first');
      else showPin(code, 'missing');
    };

    ov.onsubmit = async (e) => {
      e.preventDefault();
      if (!pinCtx) return;
      const { code, mode } = pinCtx;
      const p1 = $('pin1').value.trim(), p2 = $('pin2') ? $('pin2').value.trim() : p1;
      const err = $('pin-err'), btn = ov.querySelector('#pin-form button[type="submit"]');
      if (!PIN_RE.test(p1)) { err.textContent = 'Die PIN besteht aus 4 bis 12 Ziffern.'; return; }
      if (p1 !== p2) { err.textContent = 'Die beiden Eingaben stimmen nicht überein.'; return; }
      btn.disabled = true; err.textContent = 'Wird geprüft …';
      try {
        let rc = null;
        if (mode === 'first' || mode === 'admin') {
          rc = await S.store.setPin(code, p1, { recovery: mode === 'first' });
          S.pinFlags = { ...S.pinFlags, [code]: { set: true, rec: !!rc || !!(S.pinFlags[code] && S.pinFlags[code].rec) } };
        }
        if (mode === 'enter' || mode === 'first' || (mode === 'admin' && code === S.me)) {
          const claim = await S.store.claimAdmin(code, p1);
          setAdminMe(code, claim);
          if (rc) await showRecovery(code, rc, ov);
          showToast(mode === 'enter' ? `Angemeldet als ${code}` : `PIN für ${code} gespeichert`);
          close(code);
          return;
        }
        showToast(`PIN für ${code} gespeichert`);
        showPicker();
      } catch (ex) {
        console.error(ex);
        err.textContent = (ex && ex.message) || 'Das hat nicht geklappt.';
        btn.disabled = false;
        $('pin1').value = ''; if ($('pin2')) $('pin2').value = '';
        $('pin1').focus();
      }
    };
  });
}

/* Erster Start mit Firebase: Werkstatt anlegen oder beitreten */
function runSetup(message) {
  return new Promise(resolve => {
    const ov = $('setup');
    const urlCode = new URLSearchParams(location.search).get('code') || '';
    let me = S.me;
    const draw = (err) => {
      ov.innerHTML = `
        <div class="setup-card">
          <div class="wm"><span class="bar"></span><span class="txt">Krandienst <em>Schulz</em></span></div>
          ${message ? `<p class="setup-err">${esc(message)}</p>` : ''}
          <h3>1. Wer bist du?</h3>
          <p>Gilt für dieses Gerät. Admins (${esc('SE, KÖ')}) dürfen Vorlagen ändern.</p>
          ${mePickerHtml(me)}
          ${isAdmin(me) ? `
          <div class="field" style="margin-top:12px">
            <label for="setup-pin1">PIN für ${esc(me)} 🔒</label>
            <input id="setup-pin1" type="password" inputmode="numeric" maxlength="12" autocomplete="off">
          </div>
          <div class="field">
            <label for="setup-pin2">PIN wiederholen – nur bei „Neue Werkstatt anlegen“</label>
            <input id="setup-pin2" type="password" inputmode="numeric" maxlength="12" autocomplete="off">
          </div>` : ''}
          <h3 style="margin-top:22px">2. Werkstatt beitreten</h3>
          <p>Den 16-stelligen Code bekommst du von einem Kollegen (Seitenleiste → „Einladen“).</p>
          <div class="field">
            <label for="join-code">Werkstatt-Code</label>
            <input id="join-code" class="code" maxlength="24" autocomplete="off" value="${esc(urlCode)}" placeholder="XXXX XXXX XXXX XXXX">
          </div>
          <button class="btn-big" data-x="join" type="button">Beitreten</button>
          <div class="or">— oder, nur beim allerersten Gerät —</div>
          <button class="btn-big alt" data-x="create" type="button">Neue Werkstatt anlegen</button>
          <div class="setup-err" id="setup-err">${esc(err || '')}</div>
        </div>`;
    };
    draw();
    ov.classList.remove('hidden');
    const busy = (on) => ov.querySelectorAll('.btn-big').forEach(b => { b.disabled = on; });
    ov.onclick = async (e) => {
      const pick = e.target.closest('.pick');
      if (pick) {
        const code = $('join-code') ? $('join-code').value : urlCode;
        me = pick.dataset.code; draw(); $('join-code').value = code; return;
      }
      const x = e.target.closest('[data-x]');
      if (!x) return;
      if (!me) {
        $('setup-err').textContent = 'Bitte zuerst oben unter „1. Wer bist du?“ dein Kürzel antippen.';
        const grid = ov.querySelector('.pick-grid');
        grid.classList.remove('attention'); void grid.offsetWidth; grid.classList.add('attention');
        grid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      let pin = '';
      if (isAdmin(me)) {
        pin = $('setup-pin1').value.trim();
        const pin2 = $('setup-pin2').value.trim();
        if (!PIN_RE.test(pin)) { $('setup-err').textContent = `Bitte die PIN für ${me} eingeben (4 bis 12 Ziffern).`; $('setup-pin1').focus(); return; }
        if (x.dataset.x === 'create' && pin !== pin2) { $('setup-err').textContent = 'Die beiden PIN-Eingaben stimmen nicht überein.'; $('setup-pin2').focus(); return; }
      }
      busy(true);
      $('setup-err').textContent = '';
      try {
        if (x.dataset.x === 'join') {
          await S.store.joinWorkshop($('join-code').value, me, pin);
        } else {
          let seed = null;
          if (isAdmin(me)) {
            seed = {};
            const mig = lsJson('kds_migrated_templates', {}) || {};
            CATEGORIES.forEach(c => { seed[c] = mig[c] || defaultTemplate(c); });
          }
          const res = await S.store.createWorkshop('Krandienst Schulz', me, seed, pin);
          if (res && res.recovery) await showRecovery(me, res.recovery, ov);
        }
        S.me = me; lsSet('kds_me', me);
        if (isAdmin(me)) { S.claim = await S.store.getClaim(); S.pinFlags = await S.store.getPinFlags(); }
        if (urlCode) history.replaceState(null, '', location.pathname);
        ov.classList.add('hidden'); ov.onclick = null;
        resolve();
      } catch (err) {
        console.error(err);
        $('setup-err').textContent = err && err.message ? err.message : 'Das hat nicht geklappt.';
        busy(false);
      }
    };
  });
}

async function invite() {
  const ws = S.store.workshop;
  if (!ws) return;
  const url = location.origin + location.pathname + '?code=' + ws.id;
  if (navigator.share) {
    try { await navigator.share({ title: 'KDS Serviceliste', text: 'Werkstatt beitreten – Code: ' + ws.id, url }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); showToast('Einladungslink kopiert'); }
  catch (e) { showToast('Code: ' + ws.id); }
}

/* =====================================================================
   Verschieben (Maus + Touch) – nur im Bearbeitungsmodus
   ===================================================================== */
let dragBox = null, dragRow = null, allowBox = false, allowRow = false;
document.addEventListener('mousedown', (e) => {
  allowRow = !!e.target.closest('.row-drag-handle');
  allowBox = !allowRow && !!e.target.closest('.drag-handle');
});
function initDrag() {
  const container = $('groups-container');
  container.querySelectorAll(':scope > .box').forEach(box => {
    box.setAttribute('draggable', 'true');
    box.addEventListener('dragstart', (e) => {
      if (!allowBox) { e.preventDefault(); return; }
      dragBox = box; setTimeout(() => box.classList.add('dragging'), 0);
      e.dataTransfer.effectAllowed = 'move';
    });
    box.addEventListener('dragend', () => {
      if (dragBox) { dragBox.classList.remove('dragging'); dragBox = null; templateChanged(); }
      allowBox = false;
    });
    box.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragBox || dragBox === box) return;
      const r = box.getBoundingClientRect();
      container.insertBefore(dragBox, e.clientY < r.top + r.height / 2 ? box : box.nextSibling);
    });
  });
  container.querySelectorAll('tbody tr').forEach(initRowDrag);
}
function initRowDrag(tr) {
  tr.setAttribute('draggable', 'true');
  tr.addEventListener('dragstart', (e) => {
    e.stopPropagation();
    if (!allowRow) { e.preventDefault(); return; }
    dragRow = tr; setTimeout(() => tr.classList.add('row-dragging'), 0);
    e.dataTransfer.effectAllowed = 'move';
  });
  tr.addEventListener('dragend', (e) => {
    e.stopPropagation();
    if (dragRow) { dragRow.classList.remove('row-dragging'); dragRow = null; templateChanged(); }
    allowRow = false;
  });
  tr.addEventListener('dragover', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!dragRow || dragRow === tr) return;
    const r = tr.getBoundingClientRect();
    tr.parentNode.insertBefore(dragRow, e.clientY < r.top + r.height / 2 ? tr : tr.nextSibling);
  });
}

let touchDrag = null;
document.addEventListener('touchstart', (e) => {
  const h = e.target.closest && e.target.closest('#groups-container .drag-handle');
  if (!h) return;
  const isRow = h.classList.contains('row-drag-handle');
  const el = isRow ? h.closest('tr') : h.closest('.box');
  if (!el) return;
  e.preventDefault();
  touchDrag = { el, isRow };
  el.classList.add(isRow ? 'row-dragging' : 'dragging');
  document.body.classList.add('touch-dragging');
}, { passive: false });
document.addEventListener('touchmove', (e) => {
  if (!touchDrag) return;
  e.preventDefault();
  const t = e.touches[0], { el, isRow } = touchDrag;
  if (t.clientY < 70) window.scrollBy(0, -12);
  else if (t.clientY > window.innerHeight - 70) window.scrollBy(0, 12);
  const under = document.elementFromPoint(t.clientX, t.clientY);
  if (!under) return;
  const target = isRow ? under.closest('#groups-container tbody tr') : under.closest('#groups-container > .box');
  if (!target || target === el || target.contains(el)) return;
  const r = target.getBoundingClientRect();
  target.parentNode.insertBefore(el, t.clientY < r.top + r.height / 2 ? target : target.nextSibling);
}, { passive: false });
function endTouch() {
  if (!touchDrag) return;
  touchDrag.el.classList.remove('row-dragging', 'dragging');
  document.body.classList.remove('touch-dragging');
  touchDrag = null;
  templateChanged();
}
document.addEventListener('touchend', endTouch);
document.addEventListener('touchcancel', endTouch);

/* ---------- Gruppe kopieren / einfügen (kategorieübergreifend) ---------- */
const CLIP = 'kds_group_clipboard';
function updatePasteButton() {
  const c = lsJson(CLIP, null);
  const b = $('btn-paste-group');
  b.disabled = !c;
  b.title = c ? `Kopierte Gruppe „${c.title}“ hier einfügen` : 'Zuerst über „Kopieren“ eine Hauptgruppe kopieren';
}

/* =====================================================================
   Ereignisse
   ===================================================================== */
const actions = {
  'open-menu': () => { document.querySelector('.app').classList.remove('sidebar-collapsed'); },
  'print': () => {
    markEmptyDate();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    try { window.print(); } catch (e) { showToast('Drucken wird von diesem Browser nicht unterstützt'); }
  },
  'new-protocol': async () => {
    if (!(await confirmModal('Alle Eingaben dieser Serviceliste verwerfen und neu beginnen?', 'Neu beginnen'))) return;
    draft = emptyDraft(); saveDraft(); render(); showToast('Neue Serviceliste ' + S.cat);
  },
  'close-protocol': () => (draft.header && draft.header.orderId ? saveDraftToOrder() : closeProtocol()),
  'edit-template': () => {
    if (!amAdmin()) return;
    S.edit = true; S.editTpl = structuredClone(tplFor(S.cat)); render();
  },
  'done-template': () => {
    flushTemplateSave(); S.edit = false; S.editTpl = null; render(); showToast('Vorlage gespeichert');
  },
  'reset-template': async () => {
    if (!(await confirmModal(`Vorlage „${S.cat}“ für alle Geräte auf den Standard zurücksetzen?`, 'Zurücksetzen'))) return;
    S.editTpl = defaultTemplate(S.cat); renderEdit(); templateChanged(true);
  },
  'add-group': () => {
    const g = { id: newId(), title: 'Neue Hauptgruppe', items: [{ id: newId(), text: 'Erster Prüfpunkt' }] };
    $('groups-container').insertAdjacentHTML('beforeend', groupEditHtml(g));
    initDrag(); templateChanged();
    $('groups-container').lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },
  'paste-group': () => {
    const c = lsJson(CLIP, null);
    if (!c) return;
    const g = { id: newId(), title: c.title, items: c.items.map(text => ({ id: newId(), text })) };
    $('groups-container').insertAdjacentHTML('beforeend', groupEditHtml(g));
    initDrag(); templateChanged();
    $('groups-container').lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast(`„${c.title}“ eingefügt`);
  },
  'add-row': (btn) => {
    const tbody = btn.closest('.box').querySelector('tbody');
    tbody.insertAdjacentHTML('beforeend', rowEditHtml({ id: newId(), text: 'Neuer Prüfpunkt' }));
    initRowDrag(tbody.lastElementChild); templateChanged();
  },
  'delete-row': (btn) => { btn.closest('tr').remove(); templateChanged(); },
  'delete-group': async (btn) => {
    const box = btn.closest('.box');
    const name = box.querySelector('.sec-title-text').innerText.trim();
    if (!(await confirmModal(`Möchten Sie „${name}“ wirklich löschen?`, 'Löschen'))) return;
    box.remove(); templateChanged(); showToast(`„${name}“ gelöscht`);
  },
  'copy-group': (btn) => {
    const box = btn.closest('.box');
    const title = box.querySelector('.sec-title-text').innerText.trim();
    const items = Array.from(box.querySelectorAll('.item-edit')).map(td => td.innerText.trim()).filter(Boolean);
    lsSet(CLIP, JSON.stringify({ title, items }));
    updatePasteButton();
    showToast(`„${title}“ kopiert – in einer anderen Kategorie einfügbar`);
  },
  'add-vehicle': () => { if (amAdmin()) openVehicle(null); },
  'fleet-edit': () => toggleFleetEdit(),
  'back-fleet': () => { closeAkte(); S.view = 'fleet'; render(); window.scrollTo(0, 0); },
  'akte-stamm': () => { if (amAdmin()) openVehicle(S.openVehId); },
  'akte-tab': (btn) => { flushAkteSave(); S.akteTab = btn.dataset.tab; renderAkte(); },
  'akte-open': (btn) => { if (btn.dataset.kind === 'auftrag') openOrder(btn.dataset.id); else { S.openId = btn.dataset.id; S.view = 'protocol'; render(); window.scrollTo(0, 0); } },
  'akte-new-order': () => { const v = S.vehicles.find(x => x.id === S.openVehId); if (v) openNewOrder({ vehId: v.id }); },
  'akte-add-row': () => { if (!amAdmin()) return; const t = S.akteTab; S.akte[t] = [...(S.akte[t] || []), {}]; S.akteDirty = true; saveAkteNow(); renderAkte();
    const ins = $('view-vehicle').querySelectorAll('.ak-in'); if (ins.length) ins[ins.length - (t === 'teile' ? TEILE_COLS : OELE_COLS).length].focus(); },
  'akte-del-row': async (btn) => { if (!amAdmin()) return; if (!(await confirmModal('Diese Zeile entfernen?', 'Entfernen'))) return;
    const t = S.akteTab; S.akte[t] = (S.akte[t] || []).filter((_, i) => i !== +btn.dataset.idx); S.akteDirty = true; saveAkteNow(); renderAkte(); },
  'akte-add-note': async () => { const tx = $('ak-note').value.trim(); if (!tx) { $('ak-note').focus(); return; }
    try { await S.store.addAkteNote(S.openVehId, tx, S.me); $('ak-note').value = ''; showToast('Notiz gespeichert'); } catch (e) { showToast('Notiz konnte nicht gespeichert werden'); } },
  'akte-del-note': async (btn) => { if (!(await confirmModal('Notiz löschen?', 'Löschen'))) return; S.store.deleteAkteNote(S.openVehId, btn.dataset.id).catch(() => showToast('Löschen fehlgeschlagen')); },
  'akte-upload': () => { const i = $('akte-file'); i.value = '';
    i.accept = S.akteTab === 'bild' ? 'image/*' : '.pdf,image/*,.doc,.docx,.xls,.xlsx,.txt,.csv';
    i.click(); },
  'akte-view': (btn) => viewAkteFile(btn.dataset.id),
  'akte-del-file': async (btn) => { const f = S.akteFiles.find(x => x.id === btn.dataset.id); if (!f) return;
    if (!(await confirmModal(`„${f.name}“ aus der Fahrzeugakte löschen?`, 'Löschen'))) return;
    try { await S.store.deleteAkteFile(S.openVehId, f.id); showToast('Gelöscht'); } catch (e) { showToast(e.message || 'Löschen fehlgeschlagen'); } },
  'new-order': () => openNewOrder(),
  'new-article': () => newArticle(),
  'labels': () => { const ids = S.expandedArt ? [S.expandedArt] : []; openLabelDialog(ids); },
  'label-one': () => { if (S.artEdit) openLabelDialog([S.artEdit.id]); },
  'scan-art-barcode': async () => {
    if (!amAdmin() || !S.artEdit) return;
    const code = await scanBarcode('Barcode des Artikels scannen'); if (!code) return;
    const other = S.articles.find(a => a.id !== S.artEdit.id && normCode(a.barcode) === normCode(code));
    if (other && !(await confirmModal(`Der Code ${code} gehört schon zu „${other.name}“. Trotzdem auch hier eintragen?`, 'Eintragen', false))) return;
    S.artEdit.barcode = code; const i = $('art-barcode'); if (i) i.value = code; queueArtSave(); showToast('Barcode eingetragen');
  },
  'back-stock': () => { flushArtSave(); closeArticleSubs(); S.view = 'stock'; render(); window.scrollTo(0, 0); },
  'book-in': () => doBooking('Zulauf'),
  'qbook-in': () => doBooking('Zulauf', true),
  'qbook-out': () => doBooking('Entnahme', true),
  'open-article': (btn) => { if (amAdmin()) openArticle(btn.dataset.aid); },
  'book-out': () => doBooking('Entnahme'),
  'book-fix': () => doInventur(),
  'delete-article': () => deleteArticle(),
  'add-supplier': () => { if (!amAdmin()) return; S.artEdit.suppliers.push({ name: '', bestellNr: '', gebinde: '', preis: '' }); renderArticle(); queueArtSave(); },
  'del-supplier': (btn) => { if (!amAdmin()) return; S.artEdit.suppliers.splice(+btn.dataset.idx, 1); renderArticle(); queueArtSave(); },
  'order-stock-add': () => openOrderStockPicker(),
  'order-add-service': () => addServiceToOrder(),
  'order-svc-open': (btn) => openOrderSvc(+btn.dataset.idx),
  'order-svc-del': async (btn) => { const o = S.orderEdit; const x = o && o.svc[+btn.dataset.idx]; if (!x || orderLocked(o)) return;
    if (!(await confirmModal(`Serviceliste ${x.cat} aus dem Auftrag entfernen?${x.protoId ? ' Das bereits archivierte Protokoll bleibt im Archiv.' : ''}`, 'Entfernen'))) return;
    o.svc.splice(+btn.dataset.idx, 1); queueOrderSave(); renderOrderService(); },
  'order-open-draft': (btn) => openOrderDraft(btn.dataset.cat),
  'order-open-proto': (btn) => { flushOrderSave(); S.openId = btn.dataset.pid; S.view = 'protocol'; render(); window.scrollTo(0, 0); },
  'order-link-open': () => { const oid = draft.header && draft.header.orderId; if (oid && S.orders.some(x => x.id === oid)) openOrder(oid); },
  'order-stock-row': (btn) => { const tr = btn.closest('tr[data-rid]'); if (tr) openOrderStockPicker(tr.dataset.rid); },
  'order-stock-del': (btn) => removeOrderStock(btn.dataset.mid),
  'order-done': () => {
    const o = S.orderEdit; if (!o) return;
    const locked = orderLocked(o), isNew = S.orderIsNew === o.id;
    if (!locked) { S.orderDirty = true; saveOrderNow(); }
    S.orderIsNew = null;
    if (!locked) showToast(`Auftrag ${o.nr} ${isNew ? 'angelegt' : 'gespeichert'}${navigator.onLine ? '' : ' – wird übertragen, sobald Internet da ist'}`);
    if ((history.state || {}).idx > 0) history.back();          // zurück, wo man herkam (Liste oder Fahrzeugakte)
    else { S.view = 'orders'; S.openOrderId = null; render(); window.scrollTo(0, 0); }
  },
  'back-orders': () => { flushOrderSave(); S.view = 'orders'; S.openOrderId = null; render(); window.scrollTo(0, 0); },
  'order-add-row': () => addOrderRow(),
  'order-del-row': (btn) => {
    if (orderLocked(S.orderEdit)) return;
    const rid = btn.closest('tr').dataset.rid, o = S.orderEdit;
    o.rows = o.rows.filter(r => r.id !== rid);
    if (!o.rows.length) o.rows.push(emptyOrderRow());
    renderOrder(); queueOrderSave();
  },
  'order-vehicle': () => { if (!orderLocked(S.orderEdit)) openNewOrder({ change: true }); },
  'order-crew': (btn) => {
    const c = btn.dataset.code, o = S.orderEdit;
    if (orderLocked(o)) return;
    o.crew = o.crew.includes(c) ? o.crew.filter(x => x !== c) : [...o.crew, c];
    renderOrderCrew(); reopenIfIncomplete(); queueOrderSave();
  },
  'delete-order': async () => {
    const o = S.orderEdit;
    if (!o || !amAdmin()) return;
    if (!(await confirmModal(`Auftrag ${o.nr} endgültig löschen?`, 'Löschen'))) return;
    try {
      clearTimeout(orderSaveTimer); S.orderDirty = false;
      await S.store.deleteOrder(o.id);
      S.view = 'orders'; S.openOrderId = null; S.orderEdit = null; render(); showToast('Auftrag gelöscht');
    } catch (e) { if (e && e.code === 'permission-denied') adminRejected(); else showToast('Löschen fehlgeschlagen'); }
  },
  'order-from-protocol': () => {
    const p = S.protocols.find(x => x.id === S.openId);
    if (!p) return;
    const rows = [];
    (p.groups || []).forEach(g => g.items.forEach(i => {
      if (i.nio && !i.beh) rows.push({ ...emptyOrderRow(), text: `${g.title}: ${i.text}${i.note ? ' – ' + i.note : ''}` });
    }));
    const h = p.header || {};
    openNewOrder({ rows, vehId: h.vehId, freeName: h.fId, km: h.fKm, ow: h.fOw, uw: h.fUw,
      notes: `Offene Mängel aus Serviceprotokoll ${p.category} vom ${fmtDate(p)}.`, source: p.id });
  },
  'back-archive': () => { S.view = 'archive'; S.openId = null; S.protoEdit = false; render(); },
  'edit-protocol': () => { if (!amAdmin()) return; S.protoEdit = true; render(); },
  'save-protocol': saveProtocolEdit,
  'cancel-protocol-edit': () => { S.protoEdit = false; render(); },
  'delete-protocol': async () => {
    const p = S.protocols.find(x => x.id === S.openId);
    if (!p || !amAdmin()) return;
    if (!(await confirmModal(`Protokoll „${(p.header && p.header.fId) || ''}“ vom ${fmtDate(p)} endgültig löschen?`, 'Löschen'))) return;
    try { await S.store.deleteProtocol(p.id); S.view = 'archive'; S.openId = null; render(); showToast('Protokoll gelöscht'); }
    catch (e) { if (e && e.code === 'permission-denied') adminRejected(); else showToast('Löschen fehlgeschlagen'); }
  }
};

document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]');
  if (a && actions[a.dataset.act]) { actions[a.dataset.act](a); return; }

  const gt = e.target.closest('[data-group-toggle]');
  if (gt) {
    const k = gt.dataset.groupToggle, closed = navClosed();
    const nowClosed = !gt.closest('.nav-group').classList.contains('closed');
    closed[k] = nowClosed; lsSet('kds_nav_closed', JSON.stringify(closed)); renderNavGroups();
    return;
  }
  const nav = e.target.closest('.nav-item');
  if (nav && nav.classList.contains('nav-soon')) { showToast('Das Lager kommt mit dem nächsten Ausbauschritt'); return; }
  if (nav && nav.dataset.act === 'new-order') {     // Seitenleiste: „+ Neuer Auftrag“
    if (S.protoEdit) { leaveProtoEdit().then(ok => { if (ok) nav.click(); }); return; }
    flushTemplateSave(); flushOrderSave();
    if (window.innerWidth <= 940) document.querySelector('.app').classList.add('sidebar-collapsed');
    openNewOrder(); return;
  }
  if (nav) {
    if (S.protoEdit) { leaveProtoEdit().then(ok => { if (ok) nav.click(); }); return; }
    if (nav.dataset.cat) switchCategory(nav.dataset.cat);
    else if (nav.dataset.view === 'archive') { flushTemplateSave(); S.view = 'archive'; render(); window.scrollTo(0, 0); }
    else if (nav.dataset.view === 'fleet') { flushTemplateSave(); flushOrderSave(); S.view = 'fleet'; render(); window.scrollTo(0, 0); }
    else if (nav.dataset.view === 'orders') { flushTemplateSave(); flushOrderSave(); S.ordersFilter = nav.dataset.ostatus || ''; S.view = 'orders'; render(); window.scrollTo(0, 0); }
    else if (nav.dataset.view === 'stock' || nav.dataset.view === 'reorder') {
      flushTemplateSave(); flushOrderSave(); flushArtSave(); S.expandedArt = null; closeArticleSubs();
      S.view = nav.dataset.view; render(); window.scrollTo(0, 0);
    }
    if (window.innerWidth <= 940) document.querySelector('.app').classList.add('sidebar-collapsed');
    return;
  }
  const arow = e.target.closest('.art-row');
  if (arow) {
    if (S.view === 'stock') toggleArt(arow.dataset.aid);
    else if (amAdmin()) openArticle(arow.dataset.aid);
    else { $('stock-search').value = ''; $('stock-ort').value = ''; $('stock-kat').value = ''; S.view = 'stock'; S.expandedArt = null; render(); toggleArt(arow.dataset.aid); }
    return;
  }
  const orow = e.target.closest('.order-row');
  if (orow) { openOrder(orow.dataset.oid); return; }
  const vrow = e.target.closest('.fleet-row');
  if (vrow) { if (!e.target.closest('.fe-in')) selectVehicle(vrow.dataset.vid); return; }
  const row = e.target.closest('.arch-row');
  if (row) { S.openId = row.dataset.pid; S.view = 'protocol'; render(); window.scrollTo(0, 0); return; }

  if (e.target.closest('#ms-btn')) { $('ms-monteure').classList.toggle('open'); return; }
  if (!e.target.closest('#ms-monteure')) $('ms-monteure').classList.remove('open');
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('ms-monteure').classList.remove('open'); });

/* Startseite: Klick auf „Krandienst Schulz“ oben in der Seitenleiste */
const goHome = () => { flushTemplateSave(); flushOrderSave(); flushArtSave(); if (S.edit) { S.edit = false; S.editTpl = null; } S.view = 'home'; collapseAllNav(); render(); window.scrollTo(0, 0); };
$('brand-home').addEventListener('click', goHome);
$('brand-home').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goHome(); } });
$('btn-side').addEventListener('click', () => {
  const app = document.querySelector('.app');
  app.classList.toggle('sidebar-collapsed');
  lsSet('kds_sidebar_collapsed', app.classList.contains('sidebar-collapsed'));
});
$('btn-me').addEventListener('click', () => pickMe(true));
$('btn-settings').addEventListener('click', openSettings);
$('arch-search').addEventListener('input', renderArchive);
$('arch-cat').addEventListener('change', renderArchive);
$('fleet-search').addEventListener('input', renderFleet);
$('akte-file').addEventListener('change', (e) => { const fs = Array.from(e.target.files || []); if (fs.length) uploadAkteFiles(fs); });
$('view-vehicle').addEventListener('input', (e) => { if (e.target.classList.contains('ak-in')) onAkteInput(e.target); else if (e.target.id === 'ak-note') autoSize(e.target); });
$('view-vehicle').addEventListener('focusout', (e) => { if (e.target.classList.contains('ak-in')) flushAkteSave(); });
$('fleet-list').addEventListener('input', (e) => { if (e.target.classList.contains('fe-in')) onFleetInput(e.target); });
$('fleet-list').addEventListener('change', (e) => { if (e.target.classList.contains('fe-in')) { onFleetInput(e.target); saveFleetRow(e.target.dataset.vid); } });
$('fleet-list').addEventListener('focusout', (e) => { if (e.target.classList.contains('fe-in') && S.fePending[e.target.dataset.vid]) saveFleetRow(e.target.dataset.vid); });
['fleet-grp', 'fleet-kind', 'fleet-state'].forEach(id => $(id).addEventListener('change', renderFleet));
$('orders-search').addEventListener('input', renderOrders);
$('stock-scan').addEventListener('click', scanInStock);
['stock-search', 'stock-kat'].forEach(id => $(id).addEventListener(id === 'stock-search' ? 'input' : 'change', renderStock));
$('stock-ort').addEventListener('change', async (e) => {
  if (e.target.value !== '__neu__') { renderStock(); return; }
  e.target.value = '';
  if (!amAdmin()) return;
  const v = ((await promptModal('Name des neuen Lagerorts:', 'Hinzufügen')) || '').trim();
  if (!v) { renderStock(); return; }
  if (lagerorte().some(o => o.toLowerCase() === v.toLowerCase())) { showToast(`Lagerort „${v}“ gibt es schon`); }
  else {
    const list = [...new Set([...(S.lagerCfg.lagerorte || []), v])];
    S.lagerCfg = { ...S.lagerCfg, lagerorte: list };
    try { await S.store.saveLagerCfg({ lagerorte: list }); showToast(`Lagerort „${v}“ angelegt`); }
    catch (err) { showToast('Lagerort konnte nicht gespeichert werden'); }
  }
  renderStock(); $('stock-ort').value = lagerorte().find(o => o.toLowerCase() === v.toLowerCase()) || ''; renderStock();
});

/* Status-Logik i.O. / n.i.O. / behoben
   i.O. schließt n.i.O. und behoben aus; behoben setzt n.i.O.; n.i.O. abwählen nimmt behoben weg. */
function applyStatusLogic(chk) {
  const tr = chk.closest('tr');
  const get = (k) => tr.querySelector(`.chk-status[data-k="${k}"]`);
  const io = get('io'), nio = get('nio'), beh = get('beh');
  if (chk === io && io.checked) { nio.checked = false; beh.checked = false; }
  if (chk === nio) { if (nio.checked) io.checked = false; else beh.checked = false; }
  if (chk === beh && beh.checked) { nio.checked = true; io.checked = false; }
  return { tr, io, nio, beh };
}
function handleStatus(chk) {
  const { tr, io, nio, beh } = applyStatusLogic(chk);
  const s = { io: io.checked, nio: nio.checked, beh: beh.checked };
  if (s.io || s.nio || s.beh) draft.status[tr.dataset.iid] = s; else delete draft.status[tr.dataset.iid];
}

document.addEventListener('change', (e) => {
  const t = e.target;
  if (S.view === 'order' && S.orderEdit && t.closest('#view-order')) { onOrderInput(t); return; }
  if (S.view === 'article' && S.artEdit && t.closest('#view-article')) { onArticleInput(t, e.type); return; }
  if (S.view === 'protocol' && S.protoEdit) {
    if (t.classList.contains('chk-status')) applyStatusLogic(t);
    if (t.id === 'fDate') markEmptyDate();
    return;
  }
  if (S.view !== 'list' || S.edit) return;
  if (t.classList.contains('chk-status')) { handleStatus(t); saveDraft(); }
  else if (t.classList.contains('chk-row-active')) {
    const tr = t.closest('tr');
    if (t.checked) delete draft.off[tr.dataset.iid]; else draft.off[tr.dataset.iid] = true;
    tr.classList.toggle('is-disabled', !t.checked); saveDraft();
  } else if (t.classList.contains('chk-group-active')) {
    const box = t.closest('.box');
    if (t.checked) delete draft.off[box.dataset.gid]; else draft.off[box.dataset.gid] = true;
    box.classList.toggle('is-disabled', !t.checked); saveDraft();
  } else if (t.classList.contains('chk-monteur')) {
    draft.monteure = Array.from(document.querySelectorAll('.chk-monteur:checked')).map(c => c.value);
    renderMonteure(); saveDraft();
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (S.view === 'order' && S.orderEdit && t.closest('#view-order')) { onOrderInput(t); return; }
  if (S.view === 'article' && S.artEdit && t.closest('#view-article')) { onArticleInput(t, e.type); return; }
  if (HEADER_FIELDS.includes(t.id)) {
    if (S.view !== 'list') return;
    draft.header[t.id] = t.value;
    if (t.id === 'fId') syncHeaderVehicle();
    saveDraft();
    if (t.id === 'fDate') markEmptyDate();
    return;
  }
  if (S.view === 'list' && !S.edit && t.classList.contains('note')) {
    const iid = t.closest('tr').dataset.iid;
    const v = t.innerText.trim();
    if (v) draft.notes[iid] = v; else delete draft.notes[iid];
    saveDraft();
    return;
  }
  if (S.edit && (t.classList.contains('item-edit') || t.classList.contains('sec-title-text'))) templateChanged();
});

/* Platzhaltertext beim Antippen leeren, beim Verlassen ggf. wiederherstellen */
const phCache = new WeakMap();
const norm = (s) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
document.addEventListener('focusin', (e) => {
  const el = e.target;
  if (el && el.isContentEditable && PLACEHOLDERS.includes(norm(el.innerText))) {
    phCache.set(el, el.innerText.trim()); el.innerText = '';
  }
});
document.addEventListener('focusout', (e) => {
  const el = e.target;
  if (el && el.isContentEditable && norm(el.innerText) === '' && phCache.has(el)) el.innerText = phCache.get(el);
  // Eine während der Eingabe eingetroffene Vorlagenänderung jetzt anzeigen
  if (S.renderDeferred) setTimeout(() => {
    if (!document.activeElement || !document.activeElement.isContentEditable) { S.renderDeferred = false; if (S.view === 'list' && !S.edit) renderFill(); }
  }, 0);
});

window.addEventListener('beforeprint', markEmptyDate);

/* Versionsstand (wird beim Veröffentlichen in config.js geschrieben) */
function renderBuild() {
  const b = window.KDS_BUILD;
  const el = $('build');
  if (!b || !b.time) { el.textContent = 'Stand: lokale Version'; return; }
  const d = new Date(b.time);
  const when = d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  el.textContent = 'Stand: ' + when + ' Uhr';
  el.title = 'Version ' + (b.sha || '');
}

/* =====================================================================
   Zurück-Navigation (Handy: Wischen vom Rand / Zurück-Taste, PC: Esc oder
   Maus-Seitentaste) – über den Verlauf des Browsers
   ===================================================================== */
let applyingNav = false;      // Navigation kommt gerade aus dem Verlauf → nicht erneut eintragen
let layerEntries = 0;         // Verlaufseinträge für offene Fenster/Ebenen
let ignorePops = 0;           // selbst ausgelöste „Zurück“-Schritte (Fenster per Knopf geschlossen)

const navSnapshot = () => ({ view: S.view, cat: S.cat, openId: S.openId || null, orderId: S.openOrderId || null, artId: S.openArticleId || null, edit: !!S.edit, of: S.ordersFilter, vehId: S.openVehId || null, tab: S.akteTab });
const navKey = (n) => [n.view, n.cat, n.openId, n.orderId, n.artId, n.edit, n.view === 'orders' ? n.of || '' : '', n.view === 'vehicle' ? (n.vehId || '') + ':' + (n.tab || '') : ''].join('|');

/* Nach jedem Zeichnen: hat sich die Seite geändert, einen neuen Schritt eintragen */
function syncHistory() {
  if (applyingNav) return;
  const nav = navSnapshot(), st = history.state || {};
  if (!st.kdsNav) { history.replaceState({ kdsNav: nav, idx: 0 }, ''); return; }
  if (navKey(st.kdsNav) === navKey(nav)) return;
  if (st.kdsLayer) {               // Seitenwechsel aus einem Fenster heraus: dessen Eintrag übernehmen
    history.replaceState({ kdsNav: nav, idx: st.idx || 0 }, ''); layerEntries = Math.max(0, layerEntries - 1);
  } else {
    history.pushState({ kdsNav: nav, idx: (st.idx || 0) + 1 }, '');
  }
}

/* Einen gespeicherten Schritt wiederherstellen */
function applyNav(nav) {
  applyingNav = true;
  try {
    flushTemplateSave(); flushOrderSave();
    if (S.edit && !nav.edit) { S.edit = false; S.editTpl = null; }
    if (nav.cat && nav.cat !== S.cat) { S.cat = nav.cat; lsSet('kds_cat', nav.cat); draft = loadDraft(nav.cat); }
    S.view = nav.view || 'list';
    if (nav.of !== undefined) S.ordersFilter = nav.of || '';
    if (S.view === 'vehicle') {
      if (nav.vehId && S.vehicles.some(v => v.id === nav.vehId)) { if (akteSubVid !== nav.vehId) subscribeAkte(nav.vehId); S.openVehId = nav.vehId; S.akteTab = nav.tab || 'historie'; }
      else S.view = 'fleet';
    } else closeAkte();
    S.openId = nav.openId;
    if (nav.edit && amAdmin() && S.view === 'list') { S.edit = true; S.editTpl = structuredClone(tplFor(S.cat)); }
    flushArtSave();
    if (S.view === 'article') {
      const ar = S.articles.find(x => x.id === nav.artId);
      if (ar) { S.openArticleId = ar.id; S.artEdit = normalizeArticle(ar); S.artDirty = false; subscribeBookings(ar.id); }
      else { S.view = 'stock'; S.openArticleId = null; }
    } else { S.expandedArt = null; closeArticleSubs(); }
    if (S.view === 'order') {
      const o = S.orders.find(x => x.id === nav.orderId);
      if (o) { S.openOrderId = o.id; S.orderEdit = normalizeOrder(o); S.orderDirty = false; } else { S.view = 'orders'; S.openOrderId = null; }
    } else { S.openOrderId = null; }
    if (S.view === 'protocol' && !S.protocols.find(p => p.id === S.openId)) S.view = 'archive';
    render();
    window.scrollTo(0, 0);
  } finally { applyingNav = false; }
}

/* Offene Ebenen (oberste zuerst): Rückfrage, Fenster, Monteur-Auswahl, Seitenleiste am Handy */
function openLayers() {
  let n = 0;
  if ($('confirm-modal-overlay').classList.contains('show')) n++;
  if (!$('scan-ov').classList.contains('hidden')) n++;
  if (!$('setup').classList.contains('hidden')) n++;
  if ($('ms-monteure').classList.contains('open')) n++;
  if (window.innerWidth <= 940 && !document.querySelector('.app').classList.contains('sidebar-collapsed')) n++;
  return n;
}
/* Oberste Ebene schließen; false, wenn sie nicht geschlossen werden darf */
function closeTopLayer() {
  if (!$('scan-ov').classList.contains('hidden')) { closeScanner(null); return true; }
  if ($('confirm-modal-overlay').classList.contains('show')) { $('confirm-modal-no').click(); return true; }
  const ov = $('setup');
  if (!ov.classList.contains('hidden')) {
    // erst eine Unterseite zurück, sonst das Fenster schließen
    const btn = ov.querySelector('[data-x="back"], [data-s="main"]')
      || ov.querySelector('[data-x="cancel"], [data-s="close"], [data-v="close"], [data-n="close"]');
    if (btn) { btn.click(); return true; }
    if (ov.querySelector('[data-r="ok"]')) return false;      // Wiederherstellungs-Code: bewusst bestätigen
    return false;                                            // Pflichtfenster (Einrichtung, PIN-Pflicht)
  }
  if ($('ms-monteure').classList.contains('open')) { $('ms-monteure').classList.remove('open'); return true; }
  const app = document.querySelector('.app');
  if (window.innerWidth <= 940 && !app.classList.contains('sidebar-collapsed')) { app.classList.add('sidebar-collapsed'); return true; }
  return false;
}
/* Verlaufseinträge an die Zahl offener Ebenen angleichen */
function syncLayers() {
  const want = openLayers();
  while (layerEntries < want) {
    const st = history.state || {};
    history.pushState({ kdsNav: st.kdsNav || navSnapshot(), idx: st.idx || 0, kdsLayer: true }, '');
    layerEntries++;
  }
  if (layerEntries > want && (history.state || {}).kdsLayer) {
    const diff = layerEntries - want;
    layerEntries = want; ignorePops += 1; history.go(-diff);
  }
}
const layerObserver = new MutationObserver(() => setTimeout(syncLayers, 0));
[$('setup'), $('scan-ov'), $('confirm-modal-overlay'), $('ms-monteure'), document.querySelector('.app')].forEach(el =>
  layerObserver.observe(el, { attributes: true, attributeFilter: ['class'] }));

window.addEventListener('popstate', async (e) => {
  if (ignorePops) { ignorePops--; return; }
  if (layerEntries > 0) {
    layerEntries--;
    if (!closeTopLayer()) setTimeout(syncLayers, 0);   // Pflichtfenster: Eintrag wiederherstellen
    return;
  }
  const st = e.state || {};
  if (!st.kdsNav) return;
  if (S.protoEdit && navKey(st.kdsNav) !== navKey(navSnapshot())) {
    const cur = navSnapshot();
    if (!(await leaveProtoEdit())) { history.pushState({ kdsNav: cur, idx: (st.idx || 0) + 1 }, ''); return; }
  }
  applyNav(st.kdsNav);
});

/* Esc = ein Schritt zurück (Fenster schließen bzw. vorherige Seite) – nicht beim Tippen */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  if ($('confirm-modal-overlay').classList.contains('show') || $('ms-monteure').classList.contains('open')) return;  // eigene Esc-Behandlung
  const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  if (!$('setup').classList.contains('hidden')) { if (!typing || t.type === 'password' || t.closest('#setup')) history.back(); return; }
  if (typing) { t.blur(); return; }                    // erst das Feld verlassen
  if ((history.state || {}).idx > 0 || layerEntries > 0) history.back();
});

/* =====================================================================
   Start
   ===================================================================== */
async function start() {
  // Ausgangspunkt im Verlauf sofort eintragen – vor allen Fenstern (Kürzel-Auswahl, Einrichtung)
  { const st = history.state || {};
    if (!st.kdsNav || st.kdsLayer) history.replaceState({ kdsNav: navSnapshot(), idx: st.kdsNav ? (st.idx || 0) : 0 }, ''); }
  applyTheme();
  renderBuild();
  if (S.view === 'home') collapseAllNav();   // beim Öffnen: Seitenleiste nur mit den Hauptkategorien
  // Seitenleiste: gemerkter Zustand; auf dem Handy standardmäßig eingeklappt
  const sideState = lsGet('kds_sidebar_collapsed', null);
  if (sideState === 'true' || (sideState === null && window.innerWidth <= 940)) document.querySelector('.app').classList.add('sidebar-collapsed');
  CATEGORIES.forEach(c => $('arch-cat').insertAdjacentHTML('beforeend', `<option value="${esc(c)}">${esc(c)}</option>`));
  buildMonteurPanel();

  // Daten der alten Version einmalig übernehmen
  if (!lsGet('kds_migrated', '')) {
    try {
      const mig = migrateOldData();
      if (Object.keys(mig.templates).length) {
        lsSet('kds_migrated_templates', JSON.stringify(mig.templates));
        for (const [cat, d] of Object.entries(mig.drafts)) if (!lsGet(draftKey(cat), '')) lsSet(draftKey(cat), JSON.stringify(d));
        draft = loadDraft(S.cat);
      }
    } catch (e) { console.error('Übernahme alter Daten fehlgeschlagen', e); }
    lsSet('kds_migrated', '1');
  }

  const cfg = window.KDS_FIREBASE_CONFIG;
  if (cfg && cfg.apiKey && cfg.projectId) {
    try {
      const { createCloudStore } = await import('./store-firebase.js');
      S.store = createCloudStore(cfg);
      const { ready } = await S.store.start();
      if (!ready) { const msg = lsGet('kds_blocked_msg'); if (msg) lsSet('kds_blocked_msg', ''); await runSetup(msg || undefined); }
    } catch (e) {
      console.error(e);
      document.body.insertAdjacentHTML('afterbegin', `<div style="background:#b42318;color:#fff;padding:10px 16px;font-size:14px">Verbindung zur Datenbank fehlgeschlagen: ${esc(e.message || e)} – Seite neu laden.</div>`);
      return;
    }
  } else {
    S.store = createLocalStore();
    S.store.seedTemplatesIfEmpty(lsJson('kds_migrated_templates', null));
  }

  S.store.onSync((state, detail) => {
    const label = { ok: 'OK', warn: 'Warnung', err: 'Fehler' }[state] || state;
    const btn = $('btn-me');
    btn.className = 'side-btn me-btn sync ' + state;
    $('sync-label').textContent = label;
    $('sync-detail').textContent = state === 'ok' ? '' : detail;
    $('sync-detail').className = 'sync-detail ' + state;
    btn.dataset.status = label + (detail ? ' – ' + detail : '');
    btn.title = [btn.dataset.who, btn.dataset.status].filter(Boolean).join(' · ');
  });
  let lostHandled = false;
  const onLostAccess = async (known) => {
    if (lostHandled) return; lostHandled = true;
    let banned = !!known;
    if (!banned) { try { banned = await S.store.isBanned(); } catch (e) { /* unbekannt */ } }
    S.store.leave();
    if (banned) lsSet('kds_blocked_msg', 'Dieses Gerät wurde von einem Admin gesperrt. Bitte an SE oder KÖ wenden.');
    showToast(banned ? 'Dieses Gerät wurde gesperrt' : 'Kein Zugriff mehr auf diese Werkstatt');
    setTimeout(() => location.reload(), 1500);
  };
  S.store.onLost(() => onLostAccess(false));
  // Offene Verbindungen merken eine Sperre nicht von selbst – daher das Werkstatt-Dokument beobachten
  S.store.onWorkshop((d) => {
    S.gesperrt = Array.isArray(d.gesperrt) ? d.gesperrt : [];
    if (d.members && S.store.uid && d.members[S.store.uid] === false) onLostAccess(true);
  });
  S.store.onMembers((list) => { S.memberList = list; });

  S.store.onTemplates((all) => {
    const prevCat = S.templates[S.cat];
    S.templates = all;
    setTimeout(applyTextFixes, 0);
    if (S.view !== 'list') return;
    if (S.edit) { S.templates[S.cat] = prevCat || S.templates[S.cat]; return; } // eigene Bearbeitung hat Vorrang
    const a = document.activeElement;
    if (a && a.isContentEditable && $('groups-container').contains(a)) { S.renderDeferred = true; return; }
    renderFill();
  });
  S.store.onLagerCfg((cfg) => { S.lagerCfg = cfg || {}; });
  S.store.onArticles((list) => {
    S.lagerError = false;
    S.articles = list;
    renderNav();
    if (S.view === 'stock') renderStock();
    if (S.view === 'reorder') renderReorder();
    if (S.view === 'article' && S.openArticleId) {
      const live = list.find(x => x.id === S.openArticleId);
      if (!live) { closeArticleSubs(); S.view = 'stock'; S.openArticleId = null; S.artEdit = null; render(); showToast('Der Artikel wurde gelöscht'); return; }
      const ae = document.activeElement;
      const typing = ae && $('view-article').contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName);
      if (!S.artDirty && !typing && !$('confirm-modal-overlay').classList.contains('show')) { S.artEdit = normalizeArticle(live); renderArticle(); }
      else renderArtCards();   // nur Bestand/Ampel aktualisieren, ohne die Eingabe zu stören
    }
  }, (err) => {
    S.lagerError = err && err.code === 'permission-denied' ? 'rules' : 'other';
    if (S.view === 'stock') renderStock();
  });
  S.store.onOrders((list) => {
    S.ordersError = false;
    S.orders = list;
    renderNav();
    if (S.view === 'orders') renderOrders();
    if (S.view === 'order' && S.openOrderId) {
      const remote = list.find(o => o.id === S.openOrderId);
      if (!remote) { S.view = 'orders'; S.openOrderId = null; S.orderEdit = null; render(); showToast('Der Auftrag wurde gelöscht'); return; }
      const focused = document.activeElement && $('view-order').contains(document.activeElement);
      if (!S.orderDirty && !focused && $('setup').classList.contains('hidden')
          && JSON.stringify(pickOrder(remote)) !== JSON.stringify(pickOrder(S.orderEdit))) {
        S.orderEdit = normalizeOrder(remote); renderOrder();
      }
    }
  }, (err) => {
    S.ordersError = err && err.code === 'permission-denied' ? 'rules' : 'other';
    if (S.view === 'orders') renderOrders();
  });
  S.store.onVehicles((list) => {
    S.fleetError = false;
    S.vehicles = list;
    fillVehicleList();
    $('fleet-count').textContent = list.length;
    // im Bearbeitungsmodus nicht neu zeichnen, solange getippt wird (sonst springt der Cursor)
    const typing = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('fe-in');
    if (S.view === 'fleet' && $('setup').classList.contains('hidden') && !typing) renderFleet();
    if (S.view === 'list' && !S.edit && draft.header.fId && !draft.header.vehId) { syncHeaderVehicle(); saveDraft(); }
  }, (err) => {
    S.fleetError = err && err.code === 'permission-denied' ? 'rules' : 'other';
    if (S.view === 'fleet') renderFleet();
  });
  S.store.onProtocols((list) => {
    S.protocols = list;
    if (S.view === 'archive') renderArchive();
    if (S.view === 'protocol') { if (!list.find(p => p.id === S.openId)) { S.view = 'archive'; } render(); }
    $('arch-count').textContent = list.length;
  });

  S.store.onPinFlags((flags) => { S.pinFlags = flags; });
  S.claim = await S.store.getClaim();
  // Admin-Kürzel ohne gültigen PIN-Nachweis (z. B. nach dem Update auf PIN-Schutz)
  if (isAdmin(S.me) && !amAdmin()) {
    const was = S.me;
    S.me = ''; lsSet('kds_me', '');
    render();
    await pickMe(false, `${was} ist jetzt mit PIN geschützt. Tippe auf ${was}, um dich anzumelden.`);
  }
  if (!S.me) await pickMe(false);
  if (S.store.mode === 'cloud' && S.me && !isAdmin(S.me)) S.store.setMe(S.me).catch(() => {});
  render();
  applyTextFixes();
}

start();

/* Offline-Fähigkeit + automatische Updates: Service Worker (nur über http/https)
   - prüft beim Öffnen, beim Zurückholen aus dem Hintergrund und alle 30 Minuten
     auf eine neue Version,
   - lädt die Seite dann einmal selbst neu – aber nicht mitten in einer Bearbeitung
     oder einem offenen Dialog; dann beim nächsten ruhigen Moment. */
function busyForReload() {
  const overlayOpen = !$('setup').classList.contains('hidden') || $('confirm-modal-overlay').classList.contains('show');
  const a = document.activeElement;
  const typing = a && (a.isContentEditable || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
  return S.edit || S.protoEdit || S.artDirty || S.fleetEdit || S.akteDirty || !!S.akteUpload || overlayOpen || typing || !!touchDrag;
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.KDS_NO_SW) {
  window.addEventListener('load', async () => {
    let reg;
    const hadController = !!navigator.serviceWorker.controller;
    try { reg = await navigator.serviceWorker.register('sw.js'); } catch (e) { return; }

    let updateReady = false, reloading = false;
    const reloadNow = () => {
      if (reloading) return;
      if (busyForReload()) { updateReady = true; return; }
      reloading = true;
      location.reload();
    };
    // Neue Version hat die Kontrolle übernommen (sw.js: skipWaiting + clients.claim)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return;            // allererste Installation: nichts neu zu laden
      reloadNow();
    });
    // Aufgeschobenes Update nachholen, sobald nichts mehr offen ist
    const retry = () => { if (updateReady) reloadNow(); };
    ['click', 'focusout', 'keyup'].forEach(t => document.addEventListener(t, () => setTimeout(retry, 300)));

    const check = () => { if (navigator.onLine) reg.update().catch(() => {}); };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
      else retry();                           // App geht in den Hintergrund: guter Moment
    });
    window.addEventListener('online', check);
    setInterval(check, 30 * 60 * 1000);
  });
}
