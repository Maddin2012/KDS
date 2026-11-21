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
   Export vom 21.11.2026). „Standardvorlage laden“ setzt eine Kategorie hierauf zurück. */
const DEFAULTS = {
  BF3: [
    { title: "KAbine", items: ["Türschlösser schmieren", "Schließzylinder schmieren", "Türscharniere und Fangband schmieren", "Fensterheber prüfen", "Scheibenwischer prüfen", "Scheibenreinigungsanlage auffüllen", "Spritzdüsen prüfen ggf. einstellen", "Signalhorn prüfen", "Spiegelverstellung prüfen", "Innenraumfilter ern.", "Fehlerkeller auslesen/löschen", "Service zurück setzen"] },
    { title: "Elektrik Beleuchtung", items: ["Beleuchtung Vorne", "Beleuchtung Hinten", "Beleuchtung Seite"] },
    { title: "Wechselverkehrszeichenanlage (WVZ)", items: ["WVZ Funktionstest aller Zeichen", "Aufstellmechanismus prüfen", "Führungsschienen schmieren", "Notentriegelung auf richtigen Sitz prüfen (Sicherungssplint)"] },
    { title: "Ausrüstung BF3", items: ["5x Leitkegel", "4x Warndreieck", "4x Bltizleuchten", "2x Signalfahnen", "1x Höhenmessgerät", "1x Stahlmaßband", "Warnweste pro Insasse"] },
    { title: "Bereifung", items: ["Reifenfülldruck prüfen", "Reifenfülldruck Reserverad prüfen falls vorhanden", "Reifen auf Verschleiß prüfen"] },
    { title: "Fahrwehrk Achsen", items: ["Spurstangen prüfen", "Stoßdämpfer/Feder Sichtprüfung", "Stoßdämpfer HA Anschlagpuffer prüfen", "Stabibuchsen prüfen", "Koppelstangen prüfen", "Traggelenk prüfen", "Querlenker prüfen", "Antriebswellenmanchetten prüfen", "Radlager prüfen", "Bremse prüfen", "Bremsleitungen prüfen", "Bremsflüssigkeit ern."] },
    { title: "Motor", items: ["Motor auf Undichtigkeit prüfen", "Motoröl ern.", "Motorölfilter ern.", "Kraftstofffilter ern.", "Luftfiltereinsatz ern.", "Kühlwasserstand prüfen", "Kühlwasser ausspindeln", "Kühlsystem auf Undichtigkeit prüfen", "Riementrieb prüfen", "Abgasanlage prüfen / Aufhängung"] },
    { title: "Getriebe", items: ["Getriebe auf Dichtheit prüfen", "Getriebeöl ern."] }
  ],
  Kran: [
    { title: "Service UW", items: [] },
    { title: "KAbine", items: ["Türschlösser schmieren", "Schließzylinder schmieren", "Türscharniere und Fangband schmieren", "Fensterheber prüfen", "Scheibenwischer prüfen", "Scheibenreinigungsanlage auffüllen", "Spritzdüsen prüfen ggf. einstellen", "Signalhorn prüfen", "Spiegelverstellung prüfen", "Innenraumfilter ern."] },
    { title: "Elektrik Beleuchtung", items: ["Beleuchtung Vorne", "Beleuchtung Hinten", "Beleuchtung Seite", "Arbeitsscheinwerfer Abstützung", "Arbeitsscheinwerfer Ausleger"] },
    { title: "Standheizung", items: ["Standheizung auf Funktion prüfen", "Kühlwasserschläuche prüfen", "Kraftstofffilter ern."] },
    { title: "Zentralschmieranlage UW", items: ["Zentralschmieranlage befüllen", "Notschmierung auslösen"] },
    { title: "Bereifung", items: ["Reifenfülldruck prüfen / außer bei RDKS", "Reifen auf Verschleiß prüfen"] },
    { title: "Fahrwehrk Achsen", items: ["Zustand / Belagstärke Bremse prüfen", "Lenk / Spur / Schubstangen prüfen", "Lenkzylinder prüfen", "Achsstreben prüfen", "Hydraulikschläuche Lenkzylinder prüfen", "Federungszylinder Sichtprüfung", "Kardanwelle Verschraubung prüfen", "Achsen auf Undichtigkeit prüfen", "Radnabe Außenplaneten Ölwechsel", "Differentiale Ölwechsel", "Verteilergetriebe Ölwechsel", "Achsschenkel Schmieren"] },
    { title: "Motor", items: ["Motor auf Undichtigkeit prüfen", "Motoröl ern.", "Motorölfilter ern.", "Kraftstofffilter ern.", "Lufttrocknerpatrone ern.", "Luftfiltereinsatz ern.", "Kühlwasserstand prüfen", "Kühlwasser ausspindeln", "Kühlsystem auf Undichtigkeit prüfen", "Kurbelgehäuseentlüftung ern.", "Riementrieb prüfen"] },
    { title: "Fahrgetriebe", items: ["Fahrgetriebe Ölwechsel", "Kardanwelle Verschraubungen prüfen", "Getriebe auf Undichtigkeit prüfen", "Nasskupplung Ölwechsel", "Wandlerkupplung Ölwechsel"] },
    { title: "Hydraulik", items: ["Sichtprüfung Hydraulikschläuche", "Rücklauf-Filterelemente Hydrauliktank ern.", "Belüftung-/Entlüftungsfilter ern.", "Hochdruckfilterelement ern.", "Hydraulikölstand  prüfen"] },
    { title: "Abstützung", items: ["Schiebeholme Ausfahrverhalten prüfen ggf einstellen", "Schiebeholme auf Beschädigungen prüfen", "Schiebeholme Gleitflächen schmieren", "Hydraulikleitung Abstützzylinder auf Beschädigung prüfen", "Abstützzylinder Kolbenstange auf Beschädigung prüfen", "Gleitflächen Abtstützteller schmieren"] },
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
    { title: "KAbine", items: ["Türschlösser schmieren", "Schließzylinder schmieren", "Türscharniere und Fangband schmieren", "Fensterheber prüfen", "Scheibenwischer prüfen", "Scheibenreinigungsanlage auffüllen", "Spritzdüsen prüfen ggf. einstellen", "Signalhorn prüfen", "Spiegelverstellung prüfen", "Innenraumfilter ern.", "Service zurück stellen", "Fehlerkeller auslesen und löschen"] },
    { title: "Elektrik beleuchtung", items: ["Beleuchtung Vorne prüfen", "Beleuchtung Hinten prüfen", "Beleuchtung Seitlich prüfen"] },
    { title: "bereifung", items: ["Reifen auf Verschleiß prüfen", "Reifenfülldruck prüfen"] },
    { title: "Fahrwehrk Achsen", items: ["Lenk / Spur / Schubstangen prüfen", "Lenkzylinder prüfen", "Achsstreben prüfen", "Federungszylinder Sichtprüfung", "Kardanwelle Verschraubung prüfen", "Achsen auf Undichtigkeit prüfen", "Außenplaneten Ölwechsel", "Differentiale Ölwechsel", "Achsschenkel Schmieren", "Anschlagpuffer HA prüfen"] },
    { title: "Motor", items: ["Motor auf Undichtigkeit prüfen", "Motoröl ern.", "Motorölfilter ern.", "Kraftstofffilter ern.", "Lufttrocknerpatrone ern.", "Luftfiltereinsatz ern.", "Kühlwasserstand prüfen", "Kühlwasser ausspindeln", "Kühlsystem auf Undichtigkeit prüfen", "Kurbelgehäuseentlüftung ern.", "Riementrieb prüfen"] },
    { title: "Fahrgetriebe", items: ["Fahrgetriebe Ölwechsel", "Kardanwelle Verschraubungen prüfen", "Getriebe auf Undichtigkeit prüfen"] },
    { title: "kran", items: ["Teleskope prüfen und abschmieren", "Hydraulikleitungen prüfen", "Drehkranz schmieren", "Knicklenker schmieren", "Hydraulikölstand prüfen", "Hydraulikfilter ern.", "Abstützung prüfen", "Schiebeholme schmieren", "Teller abschmieren", "Befestigung am Fahrgestell prüfen", "Lasthaken prüfen"] },
    { title: "Anhängerzugmaul", items: ["Anhängerkupplung schmieren", "Lösehebel prüfen"] }
  ],
  LKW: [
    { title: "KAbine", items: ["Türschlösser schmieren", "Schließzylinder schmieren", "Türscharniere und Fangband schmieren", "Fensterheber prüfen", "Scheibenwischer prüfen", "Scheibenreinigungsanlage auffüllen", "Spritzdüsen prüfen ggf. einstellen", "Signalhorn prüfen", "Spiegelverstellung prüfen", "Innenraumfilter ern.", "Service zurück stellen", "Fehlerkeller auslesen und löschen", "Standheizung prüfen", "Fahrerhaus Verschluss schmieren"] },
    { title: "Elektrik Beleuchtung", items: ["Beleuchtung Vorne", "Beleuchtung Hinten", "Beleuchtung Seite", "Arbeitsscheinwerfer prüfen"] },
    { title: "bereifung", items: ["Reifen auf Verschleiß prüfen", "Reifenfülldruck prüfen"] },
    { title: "Fahrwehrk Achsen", items: ["Lenk / Spur / Schubstangen prüfen", "Lenkzylinder prüfen", "Achsstreben prüfen", "Federungszylinder Sichtprüfung", "Kardanwelle Verschraubung prüfen", "Achsen auf Undichtigkeit prüfen", "Außenplaneten Ölwechsel", "Differentiale Ölwechsel", "Achsschenkel Schmieren", "Anschlagpuffer HA prüfen"] },
    { title: "Motor", items: ["Motor auf Undichtigkeit prüfen", "Motoröl ern.", "Motorölfilter ern.", "Kraftstofffilter ern.", "Lufttrocknerpatrone ern.", "Luftfiltereinsatz ern.", "Kühlwasserstand prüfen", "Kühlwasser ausspindeln", "Kühlsystem auf Undichtigkeit prüfen", "Kurbelgehäuseentlüftung ern.", "Riementrieb prüfen", "Luftkessel Entwässerungsventile auslösen"] },
    { title: "Fahrgetriebe", items: ["Fahrgetriebe Ölwechsel", "Kardanwelle Verschraubungen prüfen", "Getriebe auf Undichtigkeit prüfen"] },
    { title: "Sattelplatte", items: ["Fangmaul schmieren", "Sattelplatte schmieren"] }
  ],
  PKW: [
    { title: "KAbine", items: ["Türschlösser schmieren", "Schließzylinder schmieren", "Türscharniere und Fangband schmieren", "Fensterheber prüfen", "Scheibenwischer prüfen", "Scheibenreinigungsanlage auffüllen", "Spritzdüsen prüfen ggf. einstellen", "Signalhorn prüfen", "Spiegelverstellung prüfen", "Innenraumfilter ern.", "Fehlerkeller auslesen/löschen", "Service zurück setzen"] },
    { title: "Elektrik Beleuchtung", items: ["Beleuchtung Vorne", "Beleuchtung Hinten", "Beleuchtung Seite"] },
    { title: "Bereifung", items: ["Reifenfülldruck prüfen", "Reifenfülldruck Reserverad prüfen falls vorhanden", "Reifen auf Verschleiß prüfen"] },
    { title: "Fahrwehrk Achsen", items: ["Spurstangen prüfen", "Stoßdämpfer/Feder Sichtprüfung", "Stoßdämpfer HA Anschlagpuffer prüfen", "Stabibuchsen prüfen", "Koppelstangen prüfen", "Traggelenk prüfen", "Querlenker prüfen", "Antriebswellenmanchetten prüfen", "Radlager prüfen", "Bremse prüfen", "Bremsleitungen prüfen", "Bremsflüssigkeit ern."] },
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
