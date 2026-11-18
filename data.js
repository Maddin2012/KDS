/* Stammdaten, Standardvorlagen und Übernahme aus der alten Einzeldatei-Version. */

export const CATEGORIES = ['BF3', 'Kran', 'Ladekran', 'LKW', 'PKW'];

/* Monteure (Kürzel + Name) – Liste hier pflegen */
export const MONTEURE = [
  { code: 'KÖ', name: 'R. Köpcke' },
  { code: 'SE', name: 'M. Seidler' },
  { code: 'PE', name: 'M. Peters' },
  { code: 'BR', name: 'A. Brosinski' },
  { code: 'KE', name: 'R. Kehrhahn' },
  { code: 'SA', name: 'A. Saharius' }
];

/* Wer Vorlagen ändern und Protokolle löschen darf.
   Muss mit ADMINS in firestore.rules übereinstimmen. */
export const ADMINS = ['SE', 'KÖ'];

export const isAdmin = (code) => ADMINS.includes(code);
export const monteurLabel = (code) => {
  const m = MONTEURE.find(x => x.code === code);
  return m ? m.code + ' – ' + m.name : code;
};

const DEFAULTS = {
  PKW: [
    { title: 'Service / Inspektion PKW', items: ['Motoröl & Ölfilter wechseln', 'Innenraumfilter & Luftfilter prüfen', 'Bremsanlage, Beläge & Scheiben prüfen', 'Flüssigkeitsstände (Kühlwasser, Wischwasser, Bremsflüssigkeit)'] },
    { title: 'Elektrik & Sicherheit', items: ['Beleuchtung Vorne & Hinten prüfen', 'Scheibenwaschanlage & Wischerblätter', 'Reifenfülldruck & Profiltiefe kontrollieren'] }
  ],
  LKW: [
    { title: 'Service LKW Fahrgestell', items: ['Motoröl- & Kraftstofffilter wechseln', 'Druckluftanlage entwässern & prüfen', 'Bremsanlage & Lenkgestänge prüfen', 'Gelenkwellen & Abschmierpunkte abschmieren'] },
    { title: 'Sicherheitsprüfung & Licht', items: ['Beleuchtung & Kontrollleuchten prüfen', 'Sicherheitsprüfung (SP) Vorbereitung', 'Reifenzustand & Radmuttern-Drehmoment'] }
  ],
  Ladekran: [
    { title: 'Service Ladekran Hydraulik', items: ['Hydraulikölstand & Filter prüfen', 'Hydraulikschläuche & Leitungen auf Dichtigkeit testen', 'Abstützung & Verriegelung kontrollieren', 'Schmierstellen am Kranarm abschmieren'] },
    { title: 'Kranmechanik & Sicherheit', items: ['Hub-, Knick- & Teleskopzylinder prüfen', 'Not-Aus & Sicherheitsabschaltung testen', 'Haken & Seilaufnahme kontrollieren'] }
  ],
  BF3: [
    { title: 'BF3 Begleitfahrzeug Ausstattung', items: ['Wechselverkehrszeichenanlage (WVZ) Funktionstest', 'Funkanlage & Telematik prüfen', 'Rundumkennleuchten & Zusatzbeleuchtung testen', 'Höhenmesslatte & Ausrüstung Vollständigkeit'] },
    { title: 'Fahrzeug-Check', items: ['Licht- und Signalanlage prüfen', 'Sicherheitsausrüstung (Lübeck-Hütchen, Anhaltewinkerkelle)', 'Bremsen & Reifen kontrollieren'] }
  ],
  Kran: [
    { title: 'Service UW (Unterwagen)', items: ['Service UW zurücksetzen', 'Motoröl & Filter Unterwagen', 'Getriebe- & Achsölstände prüfen', 'Lenksystem & Achsen abschmieren'] },
    { title: 'Service OW (Oberwagen)', items: ['Service OW zurücksetzen', 'Motoröl & Filter Oberwagen', 'Drehkranz & Schmierung prüfen', 'Hydraulikanlage Oberwagen'] },
    { title: 'Elektrik / Beleuchtung', items: ['Beleuchtung Vorne & Hinten prüfen', 'Arbeitsscheinwerfer & Auslegerbeleuchtung', 'Warn- & Lichtleisten testen'] }
  ]
};

/* Standardvorlage mit festen Kennungen – so passen laufende Eingaben auch nach
   dem ersten Speichern der Vorlage noch zu den Prüfpunkten. */
export function defaultTemplate(cat) {
  const src = DEFAULTS[cat] || DEFAULTS.Kran;
  return {
    groups: src.map((g, gi) => ({
      id: `d-${cat}-g${gi}`,
      title: g.title,
      items: g.items.map((text, ii) => ({ id: `d-${cat}-g${gi}-i${ii}`, text }))
    }))
  };
}

export function newId() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return 'x' + Array.from(a, b => b.toString(36).padStart(2, '0')).join('');
}

export function todayIso() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function emptyDraft() {
  return {
    header: { fId: '', fKm: '', fOw: '', fUw: '', fDate: todayIso() },
    monteure: [],
    off: {},      // abgewählte Hauptgruppen und Prüfpunkte (Kennung → true)
    notes: {},    // Bemerkung je Prüfpunkt
    status: {}    // { io, nio, beh } je Prüfpunkt
  };
}

/* ---------- Übernahme aus der alten Version (alles in localStorage) ----------
   Liest pro Kategorie die gespeicherte Liste und macht daraus
   eine Vorlage plus das laufende Protokoll (Entwurf). */
const OLD_PREFIX = 'krandienst_serviceliste_v8_';

export function migrateOldData() {
  const result = { templates: {}, drafts: {} };
  for (const cat of CATEGORIES) {
    let html, inputs;
    try {
      html = localStorage.getItem(OLD_PREFIX + cat + '_html');
      inputs = JSON.parse(localStorage.getItem(OLD_PREFIX + cat + '_inputs') || '{}') || {};
    } catch (e) { continue; }
    if (!html) continue;

    const doc = new DOMParser().parseFromString('<div id="r">' + html + '</div>', 'text/html');
    const boxes = doc.querySelectorAll('#r > .box');
    const draft = emptyDraft();
    const groups = [];
    let rowIdx = 0;
    boxes.forEach((box, gi) => {
      const titleEl = box.querySelector('.sec-title-text');
      const g = { id: newId(), title: (titleEl ? titleEl.textContent : '').trim() || 'Hauptgruppe', items: [] };
      if (inputs.groupActiveChks && inputs.groupActiveChks[gi] === false) draft.off[g.id] = true;
      box.querySelectorAll('tbody tr').forEach(tr => {
        const cells = tr.querySelectorAll('td.editable-cell');
        const item = { id: newId(), text: (cells[0] ? cells[0].textContent : '').trim() };
        const note = (cells[1] ? cells[1].textContent : '').trim();
        if (note) draft.notes[item.id] = note;
        if (inputs.activeChks && inputs.activeChks[rowIdx] === false) draft.off[item.id] = true;
        const st = inputs.statusChks || [];
        const s = { io: !!st[rowIdx * 3], nio: !!st[rowIdx * 3 + 1], beh: !!st[rowIdx * 3 + 2] };
        if (s.io || s.nio || s.beh) draft.status[item.id] = s;
        if (item.text) g.items.push(item);
        rowIdx++;
      });
      groups.push(g);
    });
    ['fId', 'fKm', 'fOw', 'fUw', 'fDate'].forEach(k => {
      if (typeof inputs[k] === 'string' && inputs[k]) draft.header[k] = inputs[k];
    });
    if (Array.isArray(inputs.monteure)) draft.monteure = inputs.monteure.filter(c => typeof c === 'string');
    result.templates[cat] = { groups };
    result.drafts[cat] = draft;
  }
  return result;
}
