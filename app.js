/* KDS Serviceliste – Krandienst Schulz
   Vorlagen (Hauptgruppen + Prüfpunkte) liegen zentral und werden nur von Admins geändert.
   Das laufende Protokoll (Eingaben, Haken, Bemerkungen) liegt auf dem jeweiligen Gerät,
   bis es mit „Protokoll abschließen“ ins gemeinsame Archiv wandert. */

import {
  CATEGORIES, MONTEURE, isAdmin, monteurLabel, defaultTemplate, newId, todayIso,
  emptyDraft, migrateOldData
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
  renderDeferred: false
};

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
function renderNav() {
  const nav = $('nav-cats');
  nav.querySelectorAll('.nav-item').forEach(n => n.remove());
  CATEGORIES.forEach(cat => {
    const el = document.createElement('div');
    el.className = 'nav-item' + (S.view === 'list' && S.cat === cat ? ' active' : '');
    el.textContent = cat;
    el.dataset.cat = cat;
    nav.appendChild(el);
  });
  $('nav-archive').classList.toggle('active', S.view !== 'list');
  $('arch-count').textContent = S.protocols.length;

  const meBtn = $('btn-me');
  meBtn.innerHTML = S.me ? esc(monteurLabel(S.me)) + (isAdmin(S.me) ? '<span class="admin-tag">Admin</span>' : '') : 'Auswählen …';

  const ws = S.store && S.store.workshop;
  $('ws-box').classList.toggle('hidden', !(S.store && S.store.mode === 'cloud' && ws));
  if (ws && ws.id) $('ws-code').textContent = ws.id.replace(/(.{4})/g, '$1 ').trim();
}

function renderChrome() {
  const mode = S.view === 'list' ? (S.edit ? 'edit' : 'list') : S.view;
  const admin = isAdmin(S.me);
  document.querySelectorAll('#hero-actions [data-show]').forEach(b => {
    const tokens = b.dataset.show.split(' ');
    const show = tokens.includes(mode) && (!tokens.includes('admin') || admin);
    b.classList.toggle('hidden', !show);
  });

  let title;
  if (mode === 'archive') title = 'Archiv';
  else if (mode === 'protocol') {
    const p = S.protocols.find(x => x.id === S.openId);
    title = 'Protokoll ' + (p ? p.category : '');
  } else title = (S.edit ? 'Vorlage ' : 'Serviceliste ') + S.cat;
  $('main-title').textContent = title;
  $('sidebar-sub').textContent = mode === 'archive' || mode === 'protocol' ? 'Archiv' : 'Serviceliste ' + S.cat;
  document.title = (mode === 'archive' ? 'Archiv' : title) + ' · Krandienst Schulz';

  $('view-list').classList.toggle('hidden', S.view !== 'list');
  $('view-archive').classList.toggle('hidden', S.view !== 'archive');
  $('view-protocol').classList.toggle('hidden', S.view !== 'protocol');
  $('cards').classList.toggle('hidden', mode === 'archive' || mode === 'edit');
  $('edit-banner').classList.toggle('hidden', mode !== 'edit');
  $('edit-tools').classList.toggle('hidden', mode !== 'edit');
  $('monteure-box').classList.toggle('hidden', mode === 'edit');

  const readOnly = mode === 'protocol';
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
      showToast(err && err.code === 'permission-denied' ? 'Keine Berechtigung zum Ändern der Vorlage' : 'Speichern fehlgeschlagen');
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
      items: g.items.filter(i => !draft.off[i.id]).map(i => {
        const st = draft.status[i.id] || {};
        return { text: i.text, note: draft.notes[i.id] || '', io: !!st.io, nio: !!st.nio, beh: !!st.beh };
      })
    }))
    .filter(g => g.items.length);
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
        p.header && p.header.fId, p.category, p.closedBy, monteurLabel(p.closedBy),
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
  if (!p) { S.view = 'archive'; render(); return; }
  applyHeader(p.header || {});
  const at = new Date(p.ts || 0);
  $('proto-info').innerHTML = `<b>${esc((p.header && p.header.fId) || '—')}</b> · ${esc(p.category)} · abgeschlossen von ${esc(monteurLabel(p.closedBy || '?'))} am ${esc(at.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }))}`;
  $('btn-del-proto').classList.toggle('hidden', !isAdmin(S.me));
  const chk = (v) => `<input type="checkbox" class="chk-view" ${v ? 'checked' : ''} tabindex="-1" aria-readonly="true">`;
  $('proto-groups').innerHTML = (p.groups || []).map(g => `
    <div class="box">
      <div class="sec-title"><div class="title-left"><span class="readonly-title">${esc(g.title)}</span></div></div>
      <table class="service-table">
        <thead><tr>
          <th class="col-desc">Prüfpunkt / Arbeitsschritt</th><th class="col-note">Bemerkung / Zusatz</th>
          <th class="col-status">i.O.</th><th class="col-status">n.i.O.</th><th class="col-status">behoben</th>
        </tr></thead>
        <tbody>${g.items.map(i => `
          <tr><td class="item-text">${esc(i.text)}</td><td>${esc(i.note)}</td>
          <td class="center">${chk(i.io)}</td><td class="center">${chk(i.nio)}</td><td class="center">${chk(i.beh)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>`).join('');
  $('proto-monteure').textContent = (p.monteure || []).map(monteurLabel).join(', ') || '—';
  $('proto-meta').textContent = '';
}

/* =====================================================================
   „Ich bin“ & Einrichtung
   ===================================================================== */
function mePickerHtml(sel) {
  return `<div class="pick-grid">${MONTEURE.map(m => `
    <button type="button" class="pick ${m.code === sel ? 'sel' : ''}" data-code="${esc(m.code)}">
      <code>${esc(m.code)}</code><span>${esc(m.name)}</span>
    </button>`).join('')}</div>`;
}

function setMe(code) {
  S.me = code;
  lsSet('kds_me', code);
  if (S.store) S.store.setMe(code).catch(() => {});
  if (S.edit && !isAdmin(code)) { flushTemplateSave(); S.edit = false; }
  render();
}

/* Auswahl „Ich bin“ als Dialog */
function pickMe(allowCancel = true) {
  return new Promise(resolve => {
    const ov = $('setup');
    ov.innerHTML = `
      <div class="setup-card">
        <div class="wm"><span class="bar"></span><span class="txt">Krandienst <em>Schulz</em></span></div>
        <h3>Wer bist du?</h3>
        <p>Gilt für dieses Gerät. Im Archiv steht dann, wer ein Protokoll abgeschlossen hat.</p>
        ${mePickerHtml(S.me)}
        ${allowCancel ? '<div class="setup-back"><button class="link-btn" data-x="cancel" type="button">Abbrechen</button></div>' : ''}
      </div>`;
    ov.classList.remove('hidden');
    ov.onclick = (e) => {
      const b = e.target.closest('.pick');
      if (b) { ov.classList.add('hidden'); ov.onclick = null; setMe(b.dataset.code); resolve(b.dataset.code); }
      else if (e.target.closest('[data-x="cancel"]')) { ov.classList.add('hidden'); ov.onclick = null; resolve(null); }
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
          <h3 style="margin-top:22px">2. Werkstatt beitreten</h3>
          <p>Den 16-stelligen Code bekommst du von einem Kollegen (Seitenleiste → „Einladen“).</p>
          <div class="field">
            <label for="join-code">Werkstatt-Code</label>
            <input id="join-code" class="code" maxlength="24" autocomplete="off" value="${esc(urlCode)}" placeholder="XXXX XXXX XXXX XXXX">
          </div>
          <button class="btn-big" data-x="join" type="button" ${me ? '' : 'disabled'}>Beitreten</button>
          <div class="or">— oder, nur beim allerersten Gerät —</div>
          <button class="btn-big alt" data-x="create" type="button" ${me ? '' : 'disabled'}>Neue Werkstatt anlegen</button>
          <div class="setup-err" id="setup-err">${esc(err || '')}</div>
        </div>`;
    };
    draw();
    ov.classList.remove('hidden');
    const busy = (on) => ov.querySelectorAll('.btn-big').forEach(b => { b.disabled = on || !me; });
    ov.onclick = async (e) => {
      const pick = e.target.closest('.pick');
      if (pick) {
        const code = $('join-code') ? $('join-code').value : urlCode;
        me = pick.dataset.code; draw(); $('join-code').value = code; return;
      }
      const x = e.target.closest('[data-x]');
      if (!x || !me) return;
      busy(true);
      try {
        if (x.dataset.x === 'join') {
          await S.store.joinWorkshop($('join-code').value, me);
        } else {
          let seed = null;
          if (isAdmin(me)) {
            seed = {};
            const mig = lsJson('kds_migrated_templates', {}) || {};
            CATEGORIES.forEach(c => { seed[c] = mig[c] || defaultTemplate(c); });
          }
          await S.store.createWorkshop('Krandienst Schulz', me, seed);
        }
        S.me = me; lsSet('kds_me', me);
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
    if (!isAdmin(S.me)) return;
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
  'back-archive': () => { S.view = 'archive'; S.openId = null; render(); },
  'delete-protocol': async () => {
    const p = S.protocols.find(x => x.id === S.openId);
    if (!p || !isAdmin(S.me)) return;
    if (!(await confirmModal(`Protokoll „${(p.header && p.header.fId) || ''}“ vom ${fmtDate(p)} endgültig löschen?`, 'Löschen'))) return;
    try { await S.store.deleteProtocol(p.id); S.view = 'archive'; S.openId = null; render(); showToast('Protokoll gelöscht'); }
    catch (e) { showToast('Löschen fehlgeschlagen'); }
  }
};

document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]');
  if (a && actions[a.dataset.act]) { actions[a.dataset.act](a); return; }

  const nav = e.target.closest('.nav-item');
  if (nav) {
    if (nav.dataset.cat) switchCategory(nav.dataset.cat);
    else if (nav.dataset.view === 'archive') { flushTemplateSave(); S.view = 'archive'; render(); window.scrollTo(0, 0); }
    if (window.innerWidth <= 940) document.querySelector('.app').classList.add('sidebar-collapsed');
    return;
  }
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
$('btn-invite').addEventListener('click', invite);
$('arch-search').addEventListener('input', renderArchive);
$('arch-cat').addEventListener('change', renderArchive);

/* Status-Logik i.O. / n.i.O. / behoben
   i.O. schließt n.i.O. und behoben aus; behoben setzt n.i.O.; n.i.O. abwählen nimmt behoben weg. */
function handleStatus(chk) {
  const tr = chk.closest('tr');
  const get = (k) => tr.querySelector(`.chk-status[data-k="${k}"]`);
  const io = get('io'), nio = get('nio'), beh = get('beh');
  if (chk === io && io.checked) { nio.checked = false; beh.checked = false; }
  if (chk === nio) { if (nio.checked) io.checked = false; else beh.checked = false; }
  if (chk === beh && beh.checked) { nio.checked = true; io.checked = false; }
  const s = { io: io.checked, nio: nio.checked, beh: beh.checked };
  if (s.io || s.nio || s.beh) draft.status[tr.dataset.iid] = s; else delete draft.status[tr.dataset.iid];
}

document.addEventListener('change', (e) => {
  const t = e.target;
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
  if (HEADER_FIELDS.includes(t.id)) {
    if (S.view !== 'list') return;
    draft.header[t.id] = t.value; saveDraft();
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

/* =====================================================================
   Start
   ===================================================================== */
async function start() {
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

  S.store.onSync((state, text) => {
    $('sync').className = 'sync ' + state;
    $('sync-text').textContent = text;
  });
  S.store.onLost(() => {
    S.store.leave();
    showToast('Kein Zugriff mehr auf diese Werkstatt');
    setTimeout(() => location.reload(), 1500);
  });

  S.store.onTemplates((all) => {
    const prevCat = S.templates[S.cat];
    S.templates = all;
    if (S.view !== 'list') return;
    if (S.edit) { S.templates[S.cat] = prevCat || S.templates[S.cat]; return; } // eigene Bearbeitung hat Vorrang
    const a = document.activeElement;
    if (a && a.isContentEditable && $('groups-container').contains(a)) { S.renderDeferred = true; return; }
    renderFill();
  });
  S.store.onProtocols((list) => {
    S.protocols = list;
    if (S.view === 'archive') renderArchive();
    if (S.view === 'protocol') { if (!list.find(p => p.id === S.openId)) { S.view = 'archive'; } render(); }
    $('arch-count').textContent = list.length;
  });

  if (!S.me) await pickMe(false);
  if (S.store.mode === 'cloud' && S.me) S.store.setMe(S.me).catch(() => {});
  render();
}

start();

/* Offline-Fähigkeit: Service Worker (nur über http/https) */
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.KDS_NO_SW) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
