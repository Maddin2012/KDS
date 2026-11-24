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

/* Standardvorlagen – übernommen aus dem Stand der Werkstatt (alte Serviceliste,
   Export vom 21.11.2026), Tippfehler korrigiert. „Standardvorlage laden“ setzt eine
   Kategorie hierauf zurück. */
const DEFAULTS = {
  BF3: [
    { title: "Kabine", items: ["Türschlösser schmieren", "Schließzylinder schmieren", "Türscharniere und Fangband schmieren", "Fensterheber prüfen", "Scheibenwischer prüfen", "Scheibenreinigungsanlage auffüllen", "Spritzdüsen prüfen ggf. einstellen", "Signalhorn prüfen", "Spiegelverstellung prüfen", "Innenraumfilter ern.", "Fehlerspeicher auslesen/löschen", "Service zurücksetzen"] },
    { title: "Elektrik Beleuchtung", items: ["Beleuchtung Vorne", "Beleuchtung Hinten", "Beleuchtung Seite"] },
    { title: "Wechselverkehrszeichenanlage (WVZ)", items: ["WVZ Funktionstest aller Zeichen", "Aufstellmechanismus prüfen", "Führungsschienen schmieren", "Notentriegelung auf richtigen Sitz prüfen (Sicherungssplint)"] },
    { title: "Ausrüstung BF3", items: ["5x Leitkegel", "4x Warndreieck", "4x Blitzleuchten", "2x Signalfahnen", "1x Höhenmessgerät", "1x Stahlmaßband", "Warnweste pro Insasse"] },
    { title: "Bereifung", items: ["Reifenfülldruck prüfen", "Reifenfülldruck Reserverad prüfen falls vorhanden", "Reifen auf Verschleiß prüfen"] },
    { title: "Fahrwerk Achsen", items: ["Spurstangen prüfen", "Stoßdämpfer/Feder Sichtprüfung", "Stoßdämpfer HA Anschlagpuffer prüfen", "Stabibuchsen prüfen", "Koppelstangen prüfen", "Traggelenk prüfen", "Querlenker prüfen", "Antriebswellenmanschetten prüfen", "Radlager prüfen", "Bremse prüfen", "Bremsleitungen prüfen", "Bremsflüssigkeit ern."] },
    { title: "Motor", items: ["Motor auf Undichtigkeit prüfen", "Motoröl ern.", "Motorölfilter ern.", "Kraftstofffilter ern.", "Luftfiltereinsatz ern.", "Kühlwasserstand prüfen", "Kühlwasser ausspindeln", "Kühlsystem auf Undichtigkeit prüfen", "Riementrieb prüfen", "Abgasanlage prüfen / Aufhängung"] },
    { title: "Getriebe", items: ["Getriebe auf Dichtheit prüfen", "Getriebeöl ern."] }
  ],
  Kran: [
    { title: "Service UW", items: [] },
    { title: "Kabine", items: ["Türschlösser schmieren", "Schließzylinder schmieren", "Türscharniere und Fangband schmieren", "Fensterheber prüfen", "Scheibenwischer prüfen", "Scheibenreinigungsanlage auffüllen", "Spritzdüsen prüfen ggf. einstellen", "Signalhorn prüfen", "Spiegelverstellung prüfen", "Innenraumfilter ern."] },
    { title: "Elektrik Beleuchtung", items: ["Beleuchtung Vorne", "Beleuchtung Hinten", "Beleuchtung Seite", "Arbeitsscheinwerfer Abstützung", "Arbeitsscheinwerfer Ausleger"] },
    { title: "Standheizung", items: ["Standheizung auf Funktion prüfen", "Kühlwasserschläuche prüfen", "Kraftstofffilter ern."] },
    { title: "Zentralschmieranlage UW", items: ["Zentralschmieranlage befüllen", "Notschmierung auslösen"] },
    { title: "Bereifung", items: ["Reifenfülldruck prüfen / außer bei RDKS", "Reifen auf Verschleiß prüfen"] },
    { title: "Fahrwerk Achsen", items: ["Zustand / Belagstärke Bremse prüfen", "Lenk / Spur / Schubstangen prüfen", "Lenkzylinder prüfen", "Achsstreben prüfen", "Hydraulikschläuche Lenkzylinder prüfen", "Federungszylinder Sichtprüfung", "Kardanwelle Verschraubung prüfen", "Achsen auf Undichtigkeit prüfen", "Radnabe Außenplaneten Ölwechsel", "Differentiale Ölwechsel", "Verteilergetriebe Ölwechsel", "Achsschenkel Schmieren"] },
    { title: "Motor", items: ["Motor auf Undichtigkeit prüfen", "Motoröl ern.", "Motorölfilter ern.", "Kraftstofffilter ern.", "Lufttrocknerpatrone ern.", "Luftfiltereinsatz ern.", "Kühlwasserstand prüfen", "Kühlwasser ausspindeln", "Kühlsystem auf Undichtigkeit prüfen", "Kurbelgehäuseentlüftung ern.", "Riementrieb prüfen"] },
    { title: "Fahrgetriebe", items: ["Fahrgetriebe Ölwechsel", "Kardanwelle Verschraubungen prüfen", "Getriebe auf Undichtigkeit prüfen", "Nasskupplung Ölwechsel", "Wandlerkupplung Ölwechsel"] },
    { title: "Hydraulik", items: ["Sichtprüfung Hydraulikschläuche", "Rücklauf-Filterelemente Hydrauliktank ern.", "Belüftung-/Entlüftungsfilter ern.", "Hochdruckfilterelement ern.", "Hydraulikölstand  prüfen"] },
    { title: "Abstützung", items: ["Schiebeholme Ausfahrverhalten prüfen ggf. einstellen", "Schiebeholme auf Beschädigungen prüfen", "Schiebeholme Gleitflächen schmieren", "Hydraulikleitung Abstützzylinder auf Beschädigung prüfen", "Abstützzylinder Kolbenstange auf Beschädigung prüfen", "Gleitflächen Abstützteller schmieren"] },
    { title: "Membranspeicher", items: ["Fahrwerk", "HA Lenkung"] },
    { title: "Service OW", items: [] },
    { title: "Membranspeicher", items: ["Ballast", "Drehwerk", "Televerbolzung", "Klappspitze", "Speisedruck"] },
    { title: "Gewerke", items: ["Drehwerk Ölwechsel                    Alle 4 Jahre / 4000h", "Hubwerk Ölwechsel                     Alle 4 Jahre / 4000h", "Winkelgetriebe                               Alle 2000h", "Pumpenverteilergetriebe         Jährlich / Alle 4000h"] },
    { title: "Zentralschmieranlage", items: ["Zentralschmieranlage auffüllen", "Schmierstellen Sichtprüfung"] },
    { title: "Rollenkopf / Teleskopausleger", items: ["Seilrollen Sichtkontrolle", "Lager auf Geräuschen prüfen", "Lager Seilrollen schmieren", "Hubendschaltergewicht auf Verschleiß prüfen", "Halterstangen auf Verschleiß prüfen", "Sicherungssplinte prüfen", "Tragrollen am Ausleger prüfen / Freigängigkeit / Befestigung / Einlaufspuren", "Führungsrollen Außenlängengeber auf Freigängigkeit prüfen ggf. Instandsetzen", "Teleskopausleger schmieren", "Winkelverschraubung Telepresse prüfen"] },
    { title: "Hakenflasche", items: ["Seilrollen Sichtkontrolle", "Lager auf Geräuschen prüfen", "Lager Seilrollen schmieren", "Sicherungssplinte prüfen", "Halterstangen auf Verschleiß prüfen", "Lager Lasthaken schmieren", "Festpunkt oben an der Hakenflasche schmieren"] },
    { title: "Kabine OW", items: ["Innenraumfilter ern.", "Filter für Schaltschrank ern.", "Trittstufe schmieren", "Schiebetür schmieren", "Scheibenwasser auffüllen", "Service Gesamtsystem zurücksetzen"] },
    { title: "Drehbühne", items: ["Drehbühnenarretierung schmieren", "Drehkranz schmieren"] }
  ],
  Ladekran: [
    { title: "Kabine", items: ["Türschlösser schmieren", "Schließzylinder schmieren", "Türscharniere und Fangband schmieren", "Fensterheber prüfen", "Scheibenwischer prüfen", "Scheibenreinigungsanlage auffüllen", "Spritzdüsen prüfen ggf. einstellen", "Signalhorn prüfen", "Spiegelverstellung prüfen", "Innenraumfilter ern.", "Service zurückstellen", "Fehlerspeicher auslesen und löschen"] },
    { title: "Elektrik Beleuchtung", items: ["Beleuchtung Vorne prüfen", "Beleuchtung Hinten prüfen", "Beleuchtung Seitlich prüfen"] },
    { title: "Bereifung", items: ["Reifen auf Verschleiß prüfen", "Reifenfülldruck prüfen"] },
    { title: "Fahrwerk Achsen", items: ["Lenk / Spur / Schubstangen prüfen", "Lenkzylinder prüfen", "Achsstreben prüfen", "Federungszylinder Sichtprüfung", "Kardanwelle Verschraubung prüfen", "Achsen auf Undichtigkeit prüfen", "Außenplaneten Ölwechsel", "Differentiale Ölwechsel", "Achsschenkel Schmieren", "Anschlagpuffer HA prüfen"] },
    { title: "Motor", items: ["Motor auf Undichtigkeit prüfen", "Motoröl ern.", "Motorölfilter ern.", "Kraftstofffilter ern.", "Lufttrocknerpatrone ern.", "Luftfiltereinsatz ern.", "Kühlwasserstand prüfen", "Kühlwasser ausspindeln", "Kühlsystem auf Undichtigkeit prüfen", "Kurbelgehäuseentlüftung ern.", "Riementrieb prüfen"] },
    { title: "Fahrgetriebe", items: ["Fahrgetriebe Ölwechsel", "Kardanwelle Verschraubungen prüfen", "Getriebe auf Undichtigkeit prüfen"] },
    { title: "Kran", items: ["Teleskope prüfen und abschmieren", "Hydraulikleitungen prüfen", "Drehkranz schmieren", "Knicklenker schmieren", "Hydraulikölstand prüfen", "Hydraulikfilter ern.", "Abstützung prüfen", "Schiebeholme schmieren", "Teller abschmieren", "Befestigung am Fahrgestell prüfen", "Lasthaken prüfen"] },
    { title: "Anhängerzugmaul", items: ["Anhängerkupplung schmieren", "Lösehebel prüfen"] }
  ],
  LKW: [
    { title: "Kabine", items: ["Türschlösser schmieren", "Schließzylinder schmieren", "Türscharniere und Fangband schmieren", "Fensterheber prüfen", "Scheibenwischer prüfen", "Scheibenreinigungsanlage auffüllen", "Spritzdüsen prüfen ggf. einstellen", "Signalhorn prüfen", "Spiegelverstellung prüfen", "Innenraumfilter ern.", "Service zurückstellen", "Fehlerspeicher auslesen und löschen", "Standheizung prüfen", "Fahrerhaus Verschluss schmieren"] },
    { title: "Elektrik Beleuchtung", items: ["Beleuchtung Vorne", "Beleuchtung Hinten", "Beleuchtung Seite", "Arbeitsscheinwerfer prüfen"] },
    { title: "Bereifung", items: ["Reifen auf Verschleiß prüfen", "Reifenfülldruck prüfen"] },
    { title: "Fahrwerk Achsen", items: ["Lenk / Spur / Schubstangen prüfen", "Lenkzylinder prüfen", "Achsstreben prüfen", "Federungszylinder Sichtprüfung", "Kardanwelle Verschraubung prüfen", "Achsen auf Undichtigkeit prüfen", "Außenplaneten Ölwechsel", "Differentiale Ölwechsel", "Achsschenkel Schmieren", "Anschlagpuffer HA prüfen"] },
    { title: "Motor", items: ["Motor auf Undichtigkeit prüfen", "Motoröl ern.", "Motorölfilter ern.", "Kraftstofffilter ern.", "Lufttrocknerpatrone ern.", "Luftfiltereinsatz ern.", "Kühlwasserstand prüfen", "Kühlwasser ausspindeln", "Kühlsystem auf Undichtigkeit prüfen", "Kurbelgehäuseentlüftung ern.", "Riementrieb prüfen", "Luftkessel Entwässerungsventile auslösen"] },
    { title: "Fahrgetriebe", items: ["Fahrgetriebe Ölwechsel", "Kardanwelle Verschraubungen prüfen", "Getriebe auf Undichtigkeit prüfen"] },
    { title: "Sattelplatte", items: ["Fangmaul schmieren", "Sattelplatte schmieren"] }
  ],
  PKW: [
    { title: "Kabine", items: ["Türschlösser schmieren", "Schließzylinder schmieren", "Türscharniere und Fangband schmieren", "Fensterheber prüfen", "Scheibenwischer prüfen", "Scheibenreinigungsanlage auffüllen", "Spritzdüsen prüfen ggf. einstellen", "Signalhorn prüfen", "Spiegelverstellung prüfen", "Innenraumfilter ern.", "Fehlerspeicher auslesen/löschen", "Service zurücksetzen"] },
    { title: "Elektrik Beleuchtung", items: ["Beleuchtung Vorne", "Beleuchtung Hinten", "Beleuchtung Seite"] },
    { title: "Bereifung", items: ["Reifenfülldruck prüfen", "Reifenfülldruck Reserverad prüfen falls vorhanden", "Reifen auf Verschleiß prüfen"] },
    { title: "Fahrwerk Achsen", items: ["Spurstangen prüfen", "Stoßdämpfer/Feder Sichtprüfung", "Stoßdämpfer HA Anschlagpuffer prüfen", "Stabibuchsen prüfen", "Koppelstangen prüfen", "Traggelenk prüfen", "Querlenker prüfen", "Antriebswellenmanschetten prüfen", "Radlager prüfen", "Bremse prüfen", "Bremsleitungen prüfen", "Bremsflüssigkeit ern."] },
    { title: "Motor", items: ["Motor auf Undichtigkeit prüfen", "Motoröl ern.", "Motorölfilter ern.", "Kraftstofffilter ern.", "Luftfiltereinsatz ern.", "Kühlwasserstand prüfen", "Kühlwasser ausspindeln", "Kühlsystem auf Undichtigkeit prüfen", "Riementrieb prüfen", "Abgasanlage prüfen / Aufhängung"] },
    { title: "Getriebe", items: ["Getriebe auf Dichtheit prüfen", "Getriebeöl ern."] }
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

/* Einmalige Rechtschreib-Korrektur bestehender Werkstatt-Vorlagen (Stand 21.11.2026).
   Ersetzt nur genau diese Schreibweisen; alles andere bleibt unverändert.
   Erhöhen, wenn die Liste erweitert wird – dann läuft die Korrektur erneut. */
export const TEXT_FIX_VERSION = 1;
const TITLE_FIXES = {
  'KAbine': 'Kabine', 'Fahrwehrk Achsen': 'Fahrwerk Achsen', 'bereifung': 'Bereifung',
  'kran': 'Kran', 'Elektrik beleuchtung': 'Elektrik Beleuchtung'
};
const TEXT_FIXES = [
  [/Fehlerkeller/g, 'Fehlerspeicher'], [/Bltizleuchten/g, 'Blitzleuchten'], [/Abtstützteller/g, 'Abstützteller'],
  [/Antriebswellenmanchetten/g, 'Antriebswellenmanschetten'], [/Service zurück setzen/g, 'Service zurücksetzen'],
  [/Service zurück stellen/g, 'Service zurückstellen'], [/\bggf einstellen/g, 'ggf. einstellen'], [/Fahrwehrk/g, 'Fahrwerk']
];
export function fixText(t, isTitle) {
  let out = String(t);
  if (isTitle && Object.prototype.hasOwnProperty.call(TITLE_FIXES, out.trim())) return TITLE_FIXES[out.trim()];
  TEXT_FIXES.forEach(([re, rep]) => { out = out.replace(re, rep); });
  return out;
}
/* Gibt { groups, changed } zurück – Kennungen bleiben gleich, damit laufende Eingaben passen */
export function fixTemplateTexts(tpl) {
  let changed = false;
  const groups = (tpl.groups || []).map(g => {
    const title = fixText(g.title, true);
    if (title !== g.title) changed = true;
    const items = g.items.map(i => { const text = fixText(i.text, false); if (text !== i.text) changed = true; return { ...i, text }; });
    return { ...g, title, items };
  });
  return { groups, changed };
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
/* Speicher-Schlüssel der alten Version: krandienst_serviceliste_v<N>_<Kategorie>_html / _inputs.
   Je Kategorie wird die höchste gefundene Versionsnummer genommen. */
const OLD_KEY = /^krandienst_serviceliste_v(\d+)_(.+)_html$/;

function findOldKeys(keys) {
  const best = {};
  keys.forEach(k => {
    const m = OLD_KEY.exec(k);
    if (!m) return;
    const v = +m[1], cat = m[2];
    if (!best[cat] || best[cat].v < v) best[cat] = { v, prefix: `krandienst_serviceliste_v${v}_` };
  });
  return best;
}

/* store: { getItem(k), keys() } – Standard ist localStorage dieses Browsers.
   Für den Import aus einer Export-Datei wird eine Tabelle Schlüssel → Wert übergeben. */
export function storeFromMap(map) {
  return { getItem: (k) => (Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null), keys: () => Object.keys(map) };
}
const browserStore = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  keys: () => { try { return Object.keys(localStorage); } catch (e) { return []; } }
};

/* Fuhrpark der alten Werkstattauftrags-Version (krandienst:werkstattauftraege:fuhrpark) */
export function legacyFleet(store = browserStore) {
  let list = [];
  try { list = JSON.parse(store.getItem('krandienst:werkstattauftraege:fuhrpark') || '[]'); } catch (e) { list = []; }
  if (!Array.isArray(list)) return [];
  const s = (v) => String(v == null ? '' : v).trim();
  return list.filter(v => v && s(v.id)).map(v => ({
    code: s(v.code), typ: s(v.id), werk: s(v.werk), kz: s(v.kz), baujahr: s(v.baujahr), fin: s(v.fin),
    uvv: s(v.uvv), hu: s(v.hu), sp: s(v.sp), letzterService: s(v.letzterService)
  }));
}

/* Felder eines Fahrzeugs (Fuhrpark) */
export const VEHICLE_FIELDS = ['gruppe', 'code', 'hersteller', 'typ', 'kz', 'fahrer', 'fin', 'werk', 'baujahr', 'uvv', 'hu', 'sp', 'letzterService'];
/* Fahrzeuggruppen in der Reihenfolge der Excel-Fahrzeugliste; weitere Gruppen folgen alphabetisch */
export const FLEET_GROUPS = ['Krane', 'Ladekrane', 'Zugmaschinen', 'BF3', 'Auflieger', 'PKW', 'Stapler'];

/* Excel-Fahrzeugliste („Fz.-Ident-Nr.“) einlesen. rows = Zeilen als Textlisten (wie angezeigt).
   Gruppen-Zeilen (nur erste Zelle gefüllt, z. B. „KRANE“) setzen die Gruppe für die folgenden
   Fahrzeuge; Kopfzeilen („Id-Nr. | Hersteller | …“) legen die Spalten fest. */
export function parseFleetRows(rows) {
  const clean = (v) => { const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); return /^x+$/i.test(s) ? '' : s; };
  const groupName = (s) => {
    const known = FLEET_GROUPS.find(g => g.toLowerCase() === s.toLowerCase());
    if (known) return known;
    return /^[A-ZÄÖÜ]{4,}$/.test(s) ? s.charAt(0) + s.slice(1).toLowerCase() : s;
  };
  const COLS = { hersteller: /hersteller/i, typ: /^fahrzeug$/i, kz: /kennzeichen/i, fahrer: /fahrer/i, fin: /fahrgestell|fin/i, werk: /werk/i, baujahr: /jahr/i };
  let map = { hersteller: 1, typ: 2, kz: 3, fahrer: 4, fin: 5, werk: 6, baujahr: 7 };
  let group = '';
  const out = [], seen = new Set();
  for (const raw of rows) {
    const r = (raw || []).map(clean);
    if (!r.some(Boolean)) continue;
    if (/^id-?\s*nr/i.test(r[0])) {                       // Kopfzeile → Spalten zuordnen
      const m = {};
      Object.entries(COLS).forEach(([k, re]) => { const i = r.findIndex((c, j) => j > 0 && re.test(c)); if (i > 0) m[k] = i; });
      if (m.typ !== undefined) map = { ...map, ...m };
      continue;
    }
    const filled = r.filter(Boolean).length;
    if (/^\d{1,5}$/.test(r[0]) && filled > 1) {              // Fahrzeug
      if (seen.has(r[0])) continue;
      seen.add(r[0]);
      const v = { gruppe: group, code: r[0] };
      Object.entries(map).forEach(([k, i]) => { v[k] = r[i] || ''; });
      v.werk = v.werk.replace(/\.0$/, ''); v.baujahr = v.baujahr.replace(/\.0$/, '');
      out.push(v);
    } else if (filled === 1 && r[0] && !/^\d/.test(r[0]) && !/liste$/i.test(r[0])) {
      group = groupName(r[0]);                              // Gruppen-Überschrift
    }
  }
  return out;
}
export const vehicleLabel = (v) => [v.code, v.typ].filter(Boolean).join(' · ');

export function migrateOldData(store = browserStore) {
  const result = { templates: {}, drafts: {} };
  const found = findOldKeys(store.keys());
  for (const cat of CATEGORIES) {
    if (!found[cat]) continue;
    const OLD_PREFIX = found[cat].prefix;
    let html, inputs;
    try {
      html = store.getItem(OLD_PREFIX + cat + '_html');
      inputs = JSON.parse(store.getItem(OLD_PREFIX + cat + '_inputs') || '{}') || {};
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

/* Diktierten Satz für einen neuen Artikel in Felder zerlegen, z. B.
   „Bremsenreiniger 500 ml Artikelnummer BR 500 Kategorie Spraydosen Lagerort Werkstatt
    Einheit Dose Mindestbestand 6 Preis 3,50 Lieferant Würth“ */
const NUM_WORDS = { null: 0, eins: 1, ein: 1, eine: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
  elf: 11, zwölf: 12, fünfzehn: 15, zwanzig: 20, dreißig: 30, vierzig: 40, fünfzig: 50, hundert: 100 };
const UNIT_WORDS = [[/^(liter|l)$/i, 'L'], [/^(stück|stk\.?|stueck)$/i, 'Stk.'], [/^(kilo|kilogramm|kg)$/i, 'kg'], [/^(meter|m)$/i, 'm'],
  [/^dosen?$/i, 'Dose'], [/^f(a|ä)ss(er)?$/i, 'Fass'], [/^sets?$/i, 'Set'], [/^kartons?$/i, 'Karton'], [/^paar(e)?$/i, 'Paar'], [/^rollen?$/i, 'Rolle']];
const SPEECH_KEYS = [
  ['sku', /\b(artikel ?nummer|artikel-?nr\.?|art\.? ?-?nr\.?|bestell ?nummer|teile ?nummer|teile-?nr\.?)\b/i],
  ['barcode', /\b(ean(-?nummer| code)?|barcode|strich ?code)\b/i],
  ['minBestand', /\b(mindest ?bestand|mindestmenge|meldebestand)\b/i],
  ['preis', /\b(einzel ?preis|preis|kostet)\b/i],
  ['einheit', /\b(einheit)\b/i],
  ['lagerort', /\b(lager ?ort|liegt im|liegt in der|liegt in)\b/i],
  ['kat', /\b(kategorie|warengruppe)\b/i],
  ['gebinde', /\b(gebinde|verpackung|packung)\b/i],
  ['lieferant', /\b(lieferant|lieferanten|bezugsquelle)\b/i],
  ['notes', /\b(bemerkung|notiz|hinweis)\b/i],
];
export function speechNumber(s) {
  const t = String(s || '').trim().toLowerCase().replace(/euro|€|stück|liter/g, '').trim();
  const m = t.match(/-?\d+(?:[.,]\d+)?/); if (m) return parseFloat(m[0].replace(',', '.'));
  const w = t.split(/\s+/)[0]; return NUM_WORDS[w] !== undefined ? NUM_WORDS[w] : null;
}
/* Gesprochenes mit einer Liste abgleichen – tolerant gegenüber Leerzeichen, Bindestrichen,
   doppelten Buchstaben und kleinen Hörfehlern („Kleingebindeelager“ → „Kleingebinde Lager“) */
const fuzzKey = (s) => String(s || '').toLowerCase().replace(/ß/g, 'ss').replace(/[^a-z0-9äöü]/g, '').replace(/(.)\1+/g, '$1');
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
export function fuzzyPick(spoken, list) {
  const k = fuzzKey(spoken); if (!k) return null;
  let best = null, bestScore = 0;
  for (const item of list) {
    const ik = fuzzKey(item); if (!ik) continue;
    let score = ik === k ? 1 : (ik.startsWith(k) || k.startsWith(ik)) ? 0.9 * Math.min(ik.length, k.length) / Math.max(ik.length, k.length) + 0.1 : 1 - lev(ik, k) / Math.max(ik.length, k.length);
    if (score > bestScore) { bestScore = score; best = item; }
  }
  if (k.length < 6 && bestScore < 1) return null;      // kurze Wörter („Lager“) nur bei genauem Treffer
  return bestScore >= 0.72 ? best : null;
}
export function parseArticleSpeech(text, { orte = [], kats = [] } = {}) {
  const src = String(text || '').replace(/\s+/g, ' ').trim();
  const hits = [];
  SPEECH_KEYS.forEach(([key, re]) => {
    const g = new RegExp(re.source, 'gi'); let m;
    while ((m = g.exec(src))) hits.push({ key, start: m.index, end: m.index + m[0].length });
  });
  hits.sort((a, b) => a.start - b.start);
  const used = []; hits.forEach(h => { if (!used.some(u => h.start < u.end && h.end > u.start)) used.push(h); });
  const out = { name: (used.length ? src.slice(0, used[0].start) : src).replace(/[\s,.;:–-]+$/, '').trim() };
  used.forEach((h, i) => {
    const val = src.slice(h.end, i + 1 < used.length ? used[i + 1].start : src.length).replace(/^[\s:,.-]+|[\s,.;]+$/g, '').trim();
    if (val && out[h.key] === undefined) out[h.key] = val;
  });
  const pick = (v, list) => { if (!v) return v; const l = v.toLowerCase();
    return list.find(x => x.toLowerCase() === l) || list.find(x => x.toLowerCase().startsWith(l) || l.startsWith(x.toLowerCase())) || v.charAt(0).toUpperCase() + v.slice(1); };
  if (out.sku) out.sku = out.sku.toUpperCase().replace(/\s*(bindestrich|minus|strich)\s*/gi, '-').replace(/^([A-ZÄÖÜ]+) (\d)/, '$1-$2');
  if (out.barcode) out.barcode = out.barcode.replace(/\D/g, '');
  if (out.minBestand !== undefined) { const n = speechNumber(out.minBestand); out.minBestand = n === null ? '' : n; }
  if (out.preis !== undefined) { const n = speechNumber(out.preis); out.preis = n === null ? '' : n; }
  if (out.einheit) { const w = out.einheit.split(' ')[0]; const u = UNIT_WORDS.find(([re]) => re.test(w)); out.einheit = u ? u[1] : out.einheit; }
  // Lagerort nur aus den angelegten; nicht erkannt → leer lassen (out.lagerortRaw zeigt das Gehörte)
  if (out.lagerort) { const m = fuzzyPick(out.lagerort, orte); if (m) out.lagerort = m; else { out.lagerortRaw = out.lagerort; delete out.lagerort; } }
  if (out.kat) out.kat = fuzzyPick(out.kat, kats) || pick(out.kat, kats);
  if (out.name) out.name = out.name.charAt(0).toUpperCase() + out.name.slice(1);
  if (out.lieferant) out.lieferant = out.lieferant.charAt(0).toUpperCase() + out.lieferant.slice(1);
  return out;
}
