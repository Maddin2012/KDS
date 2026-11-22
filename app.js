/* KDS Serviceliste – Krandienst Schulz
   Vorlagen (Hauptgruppen + Prüfpunkte) liegen zentral und werden nur von Admins geändert.
   Das laufende Protokoll (Eingaben, Haken, Bemerkungen) liegt auf dem jeweiligen Gerät,
   bis es mit „Protokoll abschließen“ ins gemeinsame Archiv wandert. */

import {
  CATEGORIES, MONTEURE, ADMINS, isAdmin, monteurLabel, defaultTemplate, newId, todayIso,
  emptyDraft, migrateOldData, storeFromMap, TEXT_FIX_VERSION, fixTemplateTexts,
  legacyFleet, VEHICLE_FIELDS, vehicleLabel
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
  view: 'list',             // list | archive | protocol
  edit: false,              // Vorlage bearbeiten (nur Admin)
  templates: {},            // zentral gespeicherte Vorlagen
  editTpl: null,            // Arbeitskopie im Bearbeitungsmodus
  protocols: [],
  openId: null,
  renderDeferred: false,
  protoEdit: false,         // abgeschlossenes Protokoll wird von Admin bearbeitet
  vehicles: [],             // Fuhrpark
  orders: [],               // Werkstattaufträge
  openOrderId: null,
  orderEdit: null,          // Arbeitskopie des geöffneten Auftrags
  orderDirty: false,
  claim: null,              // Admin-Nachweis dieses Geräts (nur mit richtiger PIN)
  pinFlags: {}              // für welche Admin-Kürzel eine PIN festgelegt ist
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

/* =====================================================================
   Darstellung
   ===================================================================== */
/* Hauptgruppen der Seitenleiste: auf-/zuklappbar, Zustand je Gerät gemerkt.
   Die Gruppe der gerade geöffneten Seite ist immer aufgeklappt. */
const viewGroup = () => (S.view === 'list' || S.view === 'archive' || S.view === 'protocol') ? 'service'
  : (S.view === 'orders' || S.view === 'order' || S.view === 'fleet') ? 'werkstatt' : '';
function navClosed() { return lsJson('kds_nav_closed', {}) || {}; }
function renderNavGroups() {
  const closed = navClosed(), active = viewGroup();
  document.querySelectorAll('.nav-group').forEach(g => {
    const k = g.dataset.group, isClosed = !!closed[k] && k !== active;
    g.classList.toggle('closed', isClosed);
    g.classList.toggle('has-active', k === active);
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
  $('nav-fleet').classList.toggle('active', S.view === 'fleet');
  $('nav-orders').classList.toggle('active', S.view === 'orders' || S.view === 'order');
  $('orders-count').textContent = S.orders.filter(o => o.status !== 'fertig').length;
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
  if (mode === 'archive') title = 'Archiv';
  else if (mode === 'fleet') title = 'Fuhrpark';
  else if (mode === 'orders') title = 'Werkstattaufträge';
  else if (mode === 'order') title = 'Auftrag ' + ((S.orderEdit && S.orderEdit.nr) || '');
  else if (mode === 'protocol' || mode === 'protoedit') {
    const p = S.protocols.find(x => x.id === S.openId);
    title = 'Protokoll ' + (p ? p.category : '');
  } else title = (S.edit ? 'Vorlage ' : 'Serviceliste ') + S.cat;
  $('main-title').textContent = title;
  $('sidebar-sub').textContent = (mode === 'orders' || mode === 'order') ? 'Werkstattaufträge' : mode === 'fleet' ? 'Fuhrpark' : (mode === 'archive' || mode === 'protocol' || mode === 'protoedit') ? 'Archiv' : 'Serviceliste ' + S.cat;
  document.title = title + ' · Krandienst Schulz';

  $('view-list').classList.toggle('hidden', S.view !== 'list');
  $('view-archive').classList.toggle('hidden', S.view !== 'archive');
  $('view-protocol').classList.toggle('hidden', S.view !== 'protocol');
  $('view-fleet').classList.toggle('hidden', S.view !== 'fleet');
  $('view-orders').classList.toggle('hidden', S.view !== 'orders');
  $('view-order').classList.toggle('hidden', S.view !== 'order');
  $('cards').classList.toggle('hidden', ['archive', 'edit', 'fleet', 'orders', 'order'].includes(mode));
  $('edit-banner').classList.toggle('hidden', mode !== 'edit');
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
        <table class="service-table">
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
   Werkstattaufträge
   ===================================================================== */
const ORDER_FIELDS = ['nr', 'created', 'status', 'vehId', 'fahrzeug', 'code', 'werk', 'kz', 'km', 'ow', 'uw', 'datum',
  'rows', 'notes', 'crew', 'erstelltVon', 'source'];
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
  const q = $('orders-search').value.trim().toLowerCase(), st = $('orders-status').value;
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
    <td><textarea class="o-ta" data-f="mat" rows="1" placeholder="Teile-Nr. / Menge">${esc(r.mat)}</textarea></td>
    <td><input class="o-h" data-f="h" inputmode="decimal" placeholder="0,0" value="${esc(r.h)}"></td>
    <td class="center"><input type="checkbox" class="chk-status" data-f="done" ${r.done ? 'checked' : ''} aria-label="erledigt"></td>
    <td class="center no-print"><button class="btn-del-row" data-act="order-del-row" title="Position löschen">✕</button></td>
  </tr>`;
}

function renderOrder() {
  const o = S.orderEdit;
  if (!o) { S.view = 'orders'; render(); return; }
  const admin = amAdmin();
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
        <select id="o-status" class="o-status" data-f="status" aria-label="Status">
          ${Object.entries(ORDER_STATUS).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        ${admin ? '<button class="btn-sec btn-danger" data-act="delete-order">🗑️ Löschen</button>' : ''}
      </div>
    </div>

    <div class="box">
      <div class="sec-title"><div class="title-left"><span>Auftrag <span class="mono" style="font-size:16px">${esc(o.nr)}</span></span></div>${statusBadge(o.status)}</div>
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
      <div class="sec-title"><div class="title-left"><span>Bemerkungen / Mängel</span></div></div>
      <textarea class="o-ta o-notes" data-f="notes" rows="3" placeholder="Auffälligkeiten, offene Punkte, Folgeauftrag …">${esc(o.notes)}</textarea>
    </div>

    <div class="box monteure">
      <div class="sec-title"><div class="title-left"><span>Ausführende Mitarbeiter</span></div></div>
      <div class="o-crew no-print" id="o-crew"></div>
      <div class="ms-print" id="o-crew-print"></div>
    </div>
    <p class="proto-meta">${esc([created ? 'angelegt ' + created + (o.erstelltVon ? ' von ' + o.erstelltVon : '') : '',
      src ? 'aus Serviceprotokoll ' + src.category + ' vom ' + fmtDate(src) : ''].filter(Boolean).join(' · '))}</p>`;
  renderOrderCrew();
  renderChrome();                       // erst sichtbar machen, dann Höhen berechnen
  sizeOrderTextareas();
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
function autoSize(ta) {
  if (!ta.offsetParent) return;          // unsichtbar: nicht messen
  ta.style.height = 'auto';
  ta.style.height = (ta.scrollHeight + 2) + 'px';
}
window.addEventListener('resize', () => { if (S.view === 'order') sizeOrderTextareas(); });

function onOrderInput(t) {
  const o = S.orderEdit, f = t.dataset.f;
  if (!f) return;
  const tr = t.closest('tr[data-rid]');
  if (tr) {
    const r = o.rows.find(x => x.id === tr.dataset.rid);
    if (!r) return;
    r[f] = t.type === 'checkbox' ? t.checked : t.value;
    if (f === 'done') tr.classList.toggle('is-done', t.checked);
    if (f === 'h') $('o-sum').textContent = fmtHours(orderHours(o));
  } else {
    o[f] = t.value;
    if (f === 'status') { renderOrder(); }
  }
  if (t.tagName === 'TEXTAREA') autoSize(t);
  queueOrderSave();
}
function addOrderRow() {
  S.orderEdit.rows.push(emptyOrderRow());
  renderOrder(); queueOrderSave();
  const all = $('view-order').querySelectorAll('textarea[data-f="text"]');
  all[all.length - 1].focus();
}
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
    .catch(() => { S.orderDirty = true; const el = $('o-saved'); if (el) el.textContent = 'nicht gespeichert – erneuter Versuch …'; setTimeout(saveOrderNow, 3000); });
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
      Object.assign(S.orderEdit, veh); close(); renderOrder(); queueOrderSave(); return;
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
      S.openOrderId = o.id; S.orderEdit = o; S.orderDirty = false; S.view = 'order'; render(); window.scrollTo(0, 0);
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

function renderFleet() {
  const q = $('fleet-search').value.trim().toLowerCase();
  const list = sortVehicles(S.vehicles).filter(v => !q ||
    [v.code, v.typ, v.kz, v.werk, v.fin, v.baujahr].join(' ').toLowerCase().includes(q));
  let over = 0, soon = 0;
  S.vehicles.forEach(v => DUE_FIELDS.forEach(([f]) => { const st = dueState(v[f]); if (st === 'over') over++; if (st === 'soon') soon++; }));
  $('fleet-summary').innerHTML = S.vehicles.length ? `<div class="fleet-summary">
      ${over ? `<span class="badge bad">${over} überfällig</span>` : ''}
      ${soon ? `<span class="badge pend">${soon} in den nächsten 30 Tagen fällig</span>` : ''}
      ${!over && !soon ? '<span class="badge ok">Keine Fälligkeiten in den nächsten 30 Tagen</span>' : ''}
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
  if (!list.length) { $('fleet-list').innerHTML = '<div class="empty-note">Kein Fahrzeug zu dieser Suche.</div>'; return; }
  const due = (v, f) => { const st = dueState(v[f]); return `<span class="due ${st}">${esc(fmtDay(v[f]) || '—')}</span>`; };
  $('fleet-list').innerHTML = `
    <table class="fleet-table">
      <thead><tr><th>ID</th><th>Fahrzeug</th><th>Kennzeichen</th><th>Werk-Nr.</th><th>UVV</th><th>HU</th><th>SP</th><th>Letzter Service</th></tr></thead>
      <tbody>${list.map(v => `
        <tr class="fleet-row" data-vid="${esc(v.id)}" tabindex="0">
          <td data-l="ID" class="mono"><b>${esc(v.code || '—')}</b></td>
          <td data-l="Fahrzeug"><b>${esc(v.typ || '—')}</b>${v._pending ? ' <span class="badge pend" title="Wird übertragen">⟳</span>' : ''}</td>
          <td data-l="Kennzeichen" class="mono">${esc(v.kz || '—')}</td>
          <td data-l="Werk-Nr." class="mono">${esc(v.werk || '—')}</td>
          <td data-l="UVV fällig">${due(v, 'uvv')}</td>
          <td data-l="HU fällig">${due(v, 'hu')}</td>
          <td data-l="SP fällig">${due(v, 'sp')}</td>
          <td data-l="Letzter Service">${esc(fmtDay(v.letzterService) || '—')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <p class="fleet-legend no-print"><span class="due over">rot</span> überfällig · <span class="due soon">gelb</span> innerhalb von 30 Tagen fällig · Fahrzeug antippen für Details${amAdmin() ? ' und zum Bearbeiten' : ''}.</p>`;
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
        ${field('code', 'ID (Kurzcode)', 'text', 'z. B. 088')}
        ${field('typ', 'Fahrzeug / Typ *', 'text', 'z. B. MK 88 Plus')}
        ${field('kz', 'Kennzeichen', 'text', 'z. B. OD-KS 088')}
        ${field('werk', 'Werk-Nr.', 'text', 'z. B. 110 128')}
        ${field('baujahr', 'Baujahr', 'text', 'z. B. 2021')}
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
  if (S.view === 'list') {
    if (S.edit) renderEdit();
    else { renderFill(); applyHeader(draft.header); renderMonteure(); }
  } else if (S.view === 'archive') renderArchive();
  else if (S.view === 'protocol') renderProtocol();
  else if (S.view === 'fleet') renderFleet();
  else if (S.view === 'orders') renderOrders();
  else if (S.view === 'order') renderOrder();
  renderChrome();
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
function buildProtocol() {
  const tpl = tplFor(S.cat);
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
    category: S.cat,
    header: { ...draft.header },
    monteure: [...draft.monteure],
    closedBy: S.me,
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
      <table class="service-table">
        <thead><tr>
          <th class="col-desc">Prüfpunkt / Arbeitsschritt</th><th class="col-note">Bemerkung / Zusatz</th>
          <th class="col-status">i.O.</th><th class="col-status">n.i.O.</th><th class="col-status">behoben</th>
        </tr></thead>
        <tbody>${g.items.map((i, ii) => editing ? `
          <tr data-g="${gi}" data-i="${ii}"><td class="item-text">${esc(i.text)}</td>
          <td contenteditable="true" class="editable-cell proto-note">${esc(i.note)}</td>
          <td class="center">${chkEdit(i.io, 'io')}</td><td class="center">${chkEdit(i.nio, 'nio')}</td><td class="center">${chkEdit(i.beh, 'beh')}</td></tr>` : `
          <tr><td class="item-text">${esc(i.text)}</td><td>${esc(i.note)}</td>
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
  return `<div class="pick-grid">${MONTEURE.map(m => `
    <button type="button" class="pick ${m.code === sel ? 'sel' : ''}" data-code="${esc(m.code)}">
      <code>${esc(m.code)}${isAdmin(m.code) ? ' <small title="mit PIN">🔒</small>' : ''}</code><span>${esc(m.name)}</span>
    </button>`).join('')}</div>`;
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
      ${admin ? `
      <div class="set-section">
        <h4>Daten</h4>
        <div class="set-list">
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
  'print': () => {
    markEmptyDate();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    try { window.print(); } catch (e) { showToast('Drucken wird von diesem Browser nicht unterstützt'); }
  },
  'new-protocol': async () => {
    if (!(await confirmModal('Alle Eingaben dieser Serviceliste verwerfen und neu beginnen?', 'Neu beginnen'))) return;
    draft = emptyDraft(); saveDraft(); render(); showToast('Neue Serviceliste ' + S.cat);
  },
  'close-protocol': closeProtocol,
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
  'new-order': () => openNewOrder(),
  'back-orders': () => { flushOrderSave(); S.view = 'orders'; S.openOrderId = null; render(); window.scrollTo(0, 0); },
  'order-add-row': () => addOrderRow(),
  'order-del-row': (btn) => {
    const rid = btn.closest('tr').dataset.rid, o = S.orderEdit;
    o.rows = o.rows.filter(r => r.id !== rid);
    if (!o.rows.length) o.rows.push(emptyOrderRow());
    renderOrder(); queueOrderSave();
  },
  'order-vehicle': () => openNewOrder({ change: true }),
  'order-crew': (btn) => {
    const c = btn.dataset.code, o = S.orderEdit;
    o.crew = o.crew.includes(c) ? o.crew.filter(x => x !== c) : [...o.crew, c];
    renderOrderCrew(); queueOrderSave();
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
    if (nowClosed && k === viewGroup()) return;     // die Gruppe der offenen Seite bleibt offen
    closed[k] = nowClosed; lsSet('kds_nav_closed', JSON.stringify(closed)); renderNavGroups();
    return;
  }
  const nav = e.target.closest('.nav-item');
  if (nav && nav.classList.contains('nav-soon')) { showToast('Das Lager kommt mit dem nächsten Ausbauschritt'); return; }
  if (nav) {
    if (S.protoEdit) { leaveProtoEdit().then(ok => { if (ok) nav.click(); }); return; }
    if (nav.dataset.cat) switchCategory(nav.dataset.cat);
    else if (nav.dataset.view === 'archive') { flushTemplateSave(); S.view = 'archive'; render(); window.scrollTo(0, 0); }
    else if (nav.dataset.view === 'fleet') { flushTemplateSave(); flushOrderSave(); S.view = 'fleet'; render(); window.scrollTo(0, 0); }
    else if (nav.dataset.view === 'orders') { flushTemplateSave(); flushOrderSave(); S.view = 'orders'; render(); window.scrollTo(0, 0); }
    if (window.innerWidth <= 940) document.querySelector('.app').classList.add('sidebar-collapsed');
    return;
  }
  const orow = e.target.closest('.order-row');
  if (orow) { openOrder(orow.dataset.oid); return; }
  const vrow = e.target.closest('.fleet-row');
  if (vrow) { openVehicle(vrow.dataset.vid); return; }
  const row = e.target.closest('.arch-row');
  if (row) { S.openId = row.dataset.pid; S.view = 'protocol'; render(); window.scrollTo(0, 0); return; }

  if (e.target.closest('#ms-btn')) { $('ms-monteure').classList.toggle('open'); return; }
  if (!e.target.closest('#ms-monteure')) $('ms-monteure').classList.remove('open');
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('ms-monteure').classList.remove('open'); });

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
$('orders-search').addEventListener('input', renderOrders);
$('orders-status').addEventListener('change', renderOrders);

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
   Start
   ===================================================================== */
async function start() {
  applyTheme();
  renderBuild();
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
      if (!ready) await runSetup();
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
  S.store.onLost(() => {
    S.store.leave();
    showToast('Kein Zugriff mehr auf diese Werkstatt');
    setTimeout(() => location.reload(), 1500);
  });

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
    if (S.view === 'fleet' && $('setup').classList.contains('hidden')) renderFleet();
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
  return S.edit || S.protoEdit || overlayOpen || typing || !!touchDrag;
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
