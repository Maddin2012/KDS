/* Gemeinsame Ablage über Firebase (Firestore + anonyme Anmeldung).
   Modell wie bei PlanPrepEat: Alles hängt unter workshops/{code}.
   Der 16-stellige Code ist zugleich der Einladungscode. */

import { initializeApp } from './vendor/firebase/firebase-app.js';
import {
  getAuth, signInAnonymously, onAuthStateChanged, connectAuthEmulator
} from './vendor/firebase/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, deleteDoc, collection,
  onSnapshot, query, orderBy, limit, serverTimestamp, waitForPendingWrites, writeBatch, getDocs, runTransaction,
  arrayUnion, arrayRemove, deleteField
} from './vendor/firebase/firebase-firestore.js';
import { ADMINS, TEXT_FIX_VERSION } from './data.js';

const K_WS = 'kds_workshop';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne 0/O, 1/I

function randomCode() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, b => CODE_CHARS[b % CODE_CHARS.length]).join('');
}
async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

function withTimeout(promise, ms, msg) {
  let t;
  return Promise.race([promise, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(msg)), ms); })])
    .finally(() => clearTimeout(t));
}

/* Wiederherstellungs-Code: 16 Zeichen ohne verwechselbare Zeichen, als XXXX-XXXX-XXXX-XXXX */
export function newRecoveryCode() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, b => CODE_CHARS[b % CODE_CHARS.length]).join('').replace(/(.{4})(?=.)/g, '$1-');
}

export function normalizeCode(c) {
  return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function createCloudStore(cfg) {
  const app = initializeApp({
    apiKey: cfg.apiKey, authDomain: cfg.authDomain, projectId: cfg.projectId, appId: cfg.appId
  });
  const auth = getAuth(app);
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
  if (cfg.emulator) {
    connectAuthEmulator(auth, 'http://' + cfg.emulator.auth, { disableWarnings: true });
    const [h, p] = cfg.emulator.firestore.split(':');
    connectFirestoreEmulator(db, h, Number(p));
  }

  let uid = null;
  let wid = localStorage.getItem(K_WS) || null;
  const syncSubs = new Set(), lostSubs = new Set();
  let pending = 0;
  let syncState = ['warn', 'Verbinde …'];
  let errorMsg = '';          // letzter echter Fehler (bis zum nächsten erfolgreichen Übertragen)

  /* Status: ok (grün) · warn (orange: offline / wird übertragen) · err (rot: echter Fehler) */
  function emitSync() {
    if (!navigator.onLine) syncState = ['warn', 'offline – wird später übertragen'];
    else if (errorMsg) syncState = ['err', errorMsg];
    else if (pending > 0) syncState = ['warn', 'wird übertragen …'];
    else syncState = ['ok', ''];
    syncSubs.forEach(cb => cb(...syncState));
  }
  function setError(msg) { errorMsg = msg; emitSync(); }
  window.addEventListener('online', () => { errorMsg = ''; emitSync(); });
  window.addEventListener('offline', emitSync);

  // Schreibvorgang verfolgen: Firestore speichert sofort lokal und überträgt,
  // sobald Netz da ist. Die Anzeige zeigt, ob noch etwas aussteht.
  function track(promise) {
    pending++; emitSync();
    waitForPendingWrites(db).then(() => { pending = 0; emitSync(); }).catch(() => {});
    // Abgelehnte Schreibvorgänge (z. B. fehlende Admin-Rechte) sind KEIN Zugriffsverlust
    return promise.then((r) => { if (errorMsg) { errorMsg = ''; emitSync(); } return r; }, (err) => {
      pending = Math.max(0, pending - 1);
      console.error(err);
      setError(err && err.code === 'permission-denied' ? 'Speichern abgelehnt (keine Berechtigung)' : 'Speichern fehlgeschlagen');
      throw err;
    });
  }

  /* Nur für die Hauptlisten (Vorlagen, Archiv): Werden die abgelehnt, ist das Gerät
     nicht mehr Mitglied der Werkstatt. Andere Ablehnungen melden das Gerät nicht ab. */
  function handleErr(err) {
    console.error(err);
    if (err && err.code === 'permission-denied') lostSubs.forEach(cb => cb(err));
    else setError('Verbindung zur Datenbank gestört');
  }

  const wsRef = () => doc(db, 'workshops', wid);
  const sub = (name) => collection(db, 'workshops', wid, name);

  return {
    mode: 'cloud',
    get workshop() { return wid ? { id: wid } : null; },

    async start() {
      const user = await new Promise(res => {
        const off = onAuthStateChanged(auth, u => { off(); res(u); });
      });
      if (user) uid = user.uid;
      else {
        if (!navigator.onLine) throw new Error('Für die erste Anmeldung wird Internet gebraucht.');
        uid = (await signInAnonymously(auth)).user.uid;
      }
      emitSync();
      return { ready: !!wid };
    },

    async createWorkshop(name, me, templates, pin) {
      const code = randomCode();
      await setDoc(doc(db, 'workshops', code), {
        name: name || 'Werkstatt', members: { [uid]: true }, createdAt: serverTimestamp()
      });
      wid = code;
      let recovery = null;
      if (ADMINS.includes(me)) {
        await setDoc(doc(db, 'workshops', code, 'members', uid), { monteur: '', updatedAt: serverTimestamp() });
        recovery = await this.setPin(me, pin, { recovery: true });
        await this.claimAdmin(me, pin);
      } else {
        await setDoc(doc(db, 'workshops', code, 'members', uid), { monteur: me, updatedAt: serverTimestamp() });
      }
      if (templates) {
        for (const [cat, tpl] of Object.entries(templates)) {
          await setDoc(doc(db, 'workshops', code, 'templates', cat),
            { groups: tpl.groups, updatedBy: me, updatedAt: serverTimestamp() });
        }
      }
      localStorage.setItem(K_WS, code);
      return { code, recovery };
    },

    async joinWorkshop(rawCode, me, pin) {
      const code = normalizeCode(rawCode);
      if (code.length !== 16) throw new Error('Der Code hat 16 Zeichen.');
      let snap;
      try { snap = await getDoc(doc(db, 'workshops', code)); }
      catch (e) { throw new Error(navigator.onLine ? 'Werkstatt konnte nicht geprüft werden.' : 'Zum Beitreten wird Internet gebraucht.'); }
      if (!snap.exists()) throw new Error('Zu diesem Code gibt es keine Werkstatt.');
      if ((snap.data().members || {})[uid] === false) throw new Error('Dieses Gerät wurde von einem Admin gesperrt. Bitte an SE oder KÖ wenden.');
      if ((snap.data().gesperrt || []).includes(me)) throw new Error(`Der Nutzer ${me} ist gesperrt. Bitte an SE oder KÖ wenden.`);
      if (!(snap.data().members || {})[uid]) {
        await updateDoc(doc(db, 'workshops', code), { ['members.' + uid]: true });
      }
      wid = code;
      if (ADMINS.includes(me)) {
        await setDoc(doc(db, 'workshops', code, 'members', uid), { monteur: '', updatedAt: serverTimestamp() });
        localStorage.setItem(K_WS, code);
        const flags = await this.getPinFlags();
        if (!flags[me]) throw new Error(`Für ${me} ist noch keine PIN festgelegt. Wähle vorerst ein anderes Kürzel.`);
        await this.claimAdmin(me, pin);
      } else {
        await setDoc(doc(db, 'workshops', code, 'members', uid), { monteur: me, updatedAt: serverTimestamp() });
        localStorage.setItem(K_WS, code);
      }
      return code;
    },

    /* ---------- PIN-Schutz für Admins ---------- */
    pinHash(code, pin) { return sha256hex(`kds:${wid}:${code}:${pin}`); },

    recHash(code, rc) { return sha256hex(`kds-rec:${wid}:${code}:${normalizeCode(rc)}`); },

    /* { SE: { set: true, rec: true }, … } – ob PIN bzw. Wiederherstellungs-Code existieren */
    async getPinFlags() {
      const qs = await getDocs(sub('pinFlags'));
      const out = {};
      qs.forEach(d => { out[d.id] = { set: true, rec: !!d.data().rec }; });
      return out;
    },

    onPinFlags(cb) {
      return onSnapshot(sub('pinFlags'), (qs) => {
        const out = {};
        qs.forEach(d => { out[d.id] = { set: true, rec: !!d.data().rec }; });
        cb(out);
      }, (err) => console.error(err));   // z. B. alte Firebase-Regeln: kein Zugriffsverlust
    },

    async getClaim() {
      try { const d = await getDoc(doc(db, 'workshops', wid, 'adminClaims', uid)); return d.exists() ? d.data() : null; }
      catch (e) { return null; }
    },

    /* PIN festlegen oder ändern (Admin, oder allererste PIN der Werkstatt).
       Mit { recovery: true } wird zugleich ein neuer Wiederherstellungs-Code erzeugt
       und zurückgegeben (nur dieses eine Mal sichtbar). */
    async setPin(code, pin, opts = {}) {
      if (!navigator.onLine) throw new Error('Zum Festlegen der PIN wird Internet gebraucht.');
      const hash = await this.pinHash(code, pin);
      const b = writeBatch(db);
      b.set(doc(db, 'workshops', wid, 'pins', code), { hash });
      let rc = null;
      if (opts.recovery) {
        rc = newRecoveryCode();
        b.set(doc(db, 'workshops', wid, 'recoveries', code), { hash: await this.recHash(code, rc) });
      }
      b.set(doc(db, 'workshops', wid, 'pinFlags', code), { set: true, at: serverTimestamp(), ...(rc ? { rec: true } : {}) }, { merge: true });
      try { await withTimeout(b.commit(), 15000, 'Keine Verbindung zur Datenbank.'); }
      catch (e) {
        if (e && e.code === 'permission-denied') throw new Error('PIN konnte nicht gespeichert werden (keine Berechtigung). Sind die Firebase-Regeln aktuell?');
        throw e;
      }
      return rc;
    },

    /* Neuen Wiederherstellungs-Code erzeugen (Admin) – der alte wird ungültig */
    async createRecovery(code) {
      if (!navigator.onLine) throw new Error('Dafür wird Internet gebraucht.');
      const rc = newRecoveryCode();
      const b = writeBatch(db);
      b.set(doc(db, 'workshops', wid, 'recoveries', code), { hash: await this.recHash(code, rc) });
      b.set(doc(db, 'workshops', wid, 'pinFlags', code), { rec: true }, { merge: true });
      try { await withTimeout(b.commit(), 15000, 'Keine Verbindung zur Datenbank.'); }
      catch (e) {
        if (e && e.code === 'permission-denied') throw new Error('Keine Berechtigung. Sind die Firebase-Regeln aktuell?');
        throw e;
      }
      return rc;
    },

    /* PIN vergessen: mit Wiederherstellungs-Code neue PIN setzen. Der Code wird
       dabei verbraucht und durch einen neuen ersetzt (Rückgabewert). */
    async resetPinWithRecovery(code, rc, newPin) {
      if (!navigator.onLine) throw new Error('Dafür wird Internet gebraucht.');
      const oldRec = await this.recHash(code, rc);
      const nextRc = newRecoveryCode();
      const b = writeBatch(db);
      b.set(doc(db, 'workshops', wid, 'pins', code), { hash: await this.pinHash(code, newPin), rec: oldRec });
      b.set(doc(db, 'workshops', wid, 'recoveries', code), { hash: await this.recHash(code, nextRc), prev: oldRec });
      b.set(doc(db, 'workshops', wid, 'pinFlags', code), { set: true, rec: true, at: serverTimestamp() }, { merge: true });
      try { await withTimeout(b.commit(), 15000, 'Keine Verbindung zur Datenbank.'); }
      catch (e) {
        if (e && e.code === 'permission-denied') throw new Error('Wiederherstellungs-Code falsch – oder für dieses Kürzel gibt es keinen.');
        throw e;
      }
      const claim = await this.claimAdmin(code, newPin);
      return { recovery: nextRc, claim };
    },

    /* Mit PIN als Admin nachweisen – die Datenbank-Regeln prüfen den Wert */
    async claimAdmin(code, pin) {
      if (!navigator.onLine) throw new Error('Zur Prüfung der PIN wird Internet gebraucht.');
      const hash = await this.pinHash(code, pin);
      const b = writeBatch(db);
      b.set(doc(db, 'workshops', wid, 'adminClaims', uid), { monteur: code, hash });
      b.set(doc(db, 'workshops', wid, 'members', uid), { monteur: code, updatedAt: serverTimestamp() });
      try { await withTimeout(b.commit(), 15000, 'Keine Verbindung zur Datenbank.'); }
      catch (e) {
        if (e && e.code === 'permission-denied') throw new Error('PIN falsch.');
        throw e;
      }
      return { monteur: code, hash };
    },

    leave() { localStorage.removeItem(K_WS); wid = null; },

    /* ---------- Nutzer sperren (Admins) ---------- */
    get uid() { return uid; },
    onWorkshop(cb) {
      return onSnapshot(wsRef(), (snap) => cb(snap.exists() ? snap.data() : {}), (err) => console.error(err));
    },
    onMembers(cb) {
      return onSnapshot(sub('members'), (qs) => {
        const list = []; qs.forEach(d => list.push({ uid: d.id, monteur: d.data().monteur || '' })); cb(list);
      }, (err) => console.error(err));
    },
    /* Wurde dieses Gerät ausgesperrt? (Werkstatt-Dokument darf jeder Angemeldete lesen) */
    async isBanned() {
      if (!wid) return false;
      const snap = await getDoc(wsRef());
      return snap.exists() && (snap.data().members || {})[uid] === false;
    },
    /* Kürzel sperren: kann nicht mehr gewählt werden, alle Geräte mit diesem Kürzel verlieren
       sofort den Zugriff und können nicht erneut beitreten. Entsperren hebt beides auf. */
    async setBlocked(code, blocked) {
      if (!navigator.onLine) throw new Error('Dafür wird Internet gebraucht.');
      if (ADMINS.includes(code)) throw new Error('Admins können nicht gesperrt werden.');
      const [ws, ms] = await Promise.all([getDoc(wsRef()), getDocs(sub('members'))]);
      const members = (ws.data() || {}).members || {};
      const patch = { gesperrt: blocked ? arrayUnion(code) : arrayRemove(code) };
      ms.forEach(d => {
        if (d.id === uid || (d.data().monteur || '') !== code) return;
        if (blocked && members[d.id] === true) patch['members.' + d.id] = false;
        if (!blocked && members[d.id] === false) patch['members.' + d.id] = deleteField();
      });
      try { await withTimeout(updateDoc(wsRef(), patch), 15000, 'Keine Verbindung zur Datenbank.'); }
      catch (e) {
        if (e && e.code === 'permission-denied') throw new Error('Keine Berechtigung. Sind die Firebase-Regeln aktuell?');
        throw e;
      }
      return Object.keys(patch).length - 1;
    },

    /* „Ich bin“ für Nicht-Admins; ein vorhandener Admin-Nachweis wird dabei entfernt */
    setMe(me) {
      if (!wid) return Promise.resolve();
      const b = writeBatch(db);
      b.set(doc(db, 'workshops', wid, 'members', uid), { monteur: me, updatedAt: serverTimestamp() });
      b.delete(doc(db, 'workshops', wid, 'adminClaims', uid));
      return track(b.commit());
    },

    onTemplates(cb) {
      return onSnapshot(sub('templates'), { includeMetadataChanges: true }, (qs) => {
        const out = {};
        qs.forEach(d => { out[d.id] = d.data(); });
        cb(out, qs.metadata.hasPendingWrites);
      }, handleErr);
    },

    saveTemplate(cat, tpl, by) {
      // textFix: mit dieser Version gespeicherte Vorlagen gelten als rechtschreib-korrigiert
      return track(setDoc(doc(db, 'workshops', wid, 'templates', cat),
        { groups: tpl.groups, updatedBy: by || '', updatedAt: serverTimestamp(), textFix: TEXT_FIX_VERSION }));
    },

    onProtocols(cb) {
      const q = query(sub('protocols'), orderBy('ts', 'desc'), limit(500));
      return onSnapshot(q, { includeMetadataChanges: true }, (qs) => {
        const list = [];
        qs.forEach(d => list.push({ ...d.data(), id: d.id, _pending: d.metadata.hasPendingWrites }));
        cb(list);
      }, handleErr);
    },

    addProtocol(p) {
      const ref = doc(sub('protocols'));
      // Nicht auf den Server warten – offline wird später übertragen.
      track(setDoc(ref, { ...p, createdAt: serverTimestamp() })).catch(() => {});
      return Promise.resolve(ref.id);
    },

    /* ---------- Lager ---------- */
    onArticles(cb, onErr) {
      return onSnapshot(sub('artikel'), { includeMetadataChanges: true }, (qs) => {
        const list = [];
        qs.forEach(d => list.push({ ...d.data(), id: d.id, _pending: d.metadata.hasPendingWrites }));
        cb(list);
      }, (err) => { console.error(err); if (err && err.code !== 'permission-denied') setError('Verbindung zur Datenbank gestört'); if (onErr) onErr(err); });
    },
    newArticleId() { return doc(sub('artikel')).id; },
    /* Stammdaten (nur Admins) – der Bestand ändert sich ausschließlich über Buchungen */
    saveArticle(id, data, by, isNew) {
      const ref = doc(db, 'workshops', wid, 'artikel', id);
      const d = { ...data, updatedBy: by || '', updatedAt: serverTimestamp() };
      if (isNew) d.bestand = 0;
      return track(setDoc(ref, d, { merge: !isNew }));
    },
    async deleteArticle(id) {
      if (!navigator.onLine) throw new Error('Zum Löschen wird Internet gebraucht.');
      const qs = await getDocs(collection(db, 'workshops', wid, 'artikel', id, 'buchungen'));
      const b = writeBatch(db);
      qs.forEach(d => b.delete(d.ref));
      b.delete(doc(db, 'workshops', wid, 'artikel', id));
      return track(b.commit());
    },
    /* Buchung: Bestand + Historie in EINER Transaktion (kein Überschreiben bei gleichzeitigem Buchen) */
    async book(aid, { typ, menge, grund }, by) {
      if (!navigator.onLine) throw new Error('Zum Buchen wird Internet gebraucht.');
      const aref = doc(db, 'workshops', wid, 'artikel', aid);
      const bref = doc(collection(db, 'workshops', wid, 'artikel', aid, 'buchungen'));
      return withTimeout(runTransaction(db, async (tx) => {
        const s = await tx.get(aref);
        if (!s.exists()) throw new Error('Artikel nicht gefunden.');
        const cur = Number(s.data().bestand) || 0;
        let neu;
        if (typ === 'Zulauf') neu = cur + menge;
        else if (typ === 'Entnahme') { if (menge > cur) throw Object.assign(new Error('Zu wenig Bestand.'), { code: 'zu-wenig', bestand: cur }); neu = cur - menge; }
        else neu = menge;   // Korrektur: neuer Bestand
        tx.update(aref, { bestand: neu, bestandAt: serverTimestamp(), bestandVon: by || '', lastBooking: bref.id });
        tx.set(bref, { typ, menge: typ === 'Korrektur' ? neu - cur : menge, grund: grund || '', ts: Date.now(),
          bestandVorher: cur, bestandNachher: neu, von: by || '' });
        return neu;
      }), 15000, 'Keine Verbindung zur Datenbank.');
    },
    onBookings(aid, cb) {
      const q = query(collection(db, 'workshops', wid, 'artikel', aid, 'buchungen'), orderBy('ts', 'desc'), limit(100));
      return onSnapshot(q, (qs) => { const l = []; qs.forEach(d => l.push({ ...d.data(), id: d.id })); cb(l); }, (err) => console.error(err));
    },
    onLagerCfg(cb) {
      return onSnapshot(doc(db, 'workshops', wid, 'einstellungen', 'lager'), (d) => cb(d.exists() ? d.data() : {}), (err) => console.error(err));
    },
    saveLagerCfg(data) { return track(setDoc(doc(db, 'workshops', wid, 'einstellungen', 'lager'), data, { merge: true })); },

    /* ---------- Werkstattaufträge ---------- */
    onOrders(cb, onErr) {
      const q = query(sub('auftraege'), orderBy('created', 'desc'), limit(500));
      return onSnapshot(q, { includeMetadataChanges: true }, (qs) => {
        const list = [];
        qs.forEach(d => list.push({ ...d.data(), id: d.id, _pending: d.metadata.hasPendingWrites }));
        cb(list);
      }, (err) => { console.error(err); if (err && err.code !== 'permission-denied') setError('Verbindung zur Datenbank gestört'); if (onErr) onErr(err); });
    },
    /* Fortlaufende Nummer je Schlüssel (Fahrzeug + Tag) – Transaktion, keine Doppelvergabe */
    async nextOrderNr(key) {
      if (!navigator.onLine) throw new Error('Für die fortlaufende Auftragsnummer wird Internet gebraucht.');
      const ref = doc(db, 'workshops', wid, 'zaehler', key);
      return withTimeout(runTransaction(db, async (tx) => {
        const s = await tx.get(ref);
        const n = (s.exists() ? (s.data().n || 0) : 0) + 1;
        tx.set(ref, { n });
        return n;
      }), 15000, 'Keine Verbindung zur Datenbank.');
    },
    newOrderId() { return doc(sub('auftraege')).id; },
    saveOrder(id, data, by) {
      return track(setDoc(doc(db, 'workshops', wid, 'auftraege', id), { ...data, updatedBy: by || '', updatedAt: serverTimestamp() }));
    },
    deleteOrder(id) { return track(deleteDoc(doc(db, 'workshops', wid, 'auftraege', id))); },

    /* ---------- Fuhrpark ---------- */
    onVehicles(cb, onErr) {
      return onSnapshot(sub('fahrzeuge'), { includeMetadataChanges: true }, (qs) => {
        const list = [];
        qs.forEach(d => list.push({ ...d.data(), id: d.id, _pending: d.metadata.hasPendingWrites }));
        cb(list);
      }, (err) => { console.error(err); if (err && err.code !== 'permission-denied') setError('Verbindung zur Datenbank gestört'); if (onErr) onErr(err); });   // z. B. alte Firebase-Regeln: kein Zugriffsverlust
    },
    saveVehicle(id, data, by) {
      const ref = id ? doc(db, 'workshops', wid, 'fahrzeuge', id) : doc(sub('fahrzeuge'));
      track(setDoc(ref, { ...data, updatedBy: by || '', updatedAt: serverTimestamp() })).catch(() => {});
      return Promise.resolve(ref.id);
    },
    saveVehicleNow(id, data, by) {   // wartet auf den Server (für Fehlermeldungen beim Admin)
      const ref = id ? doc(db, 'workshops', wid, 'fahrzeuge', id) : doc(sub('fahrzeuge'));
      return track(setDoc(ref, { ...data, updatedBy: by || '', updatedAt: serverTimestamp() })).then(() => ref.id);
    },
    deleteVehicle(id) { return track(deleteDoc(doc(db, 'workshops', wid, 'fahrzeuge', id))); },
    /* ---------- Fahrzeugakte: akten/{vid} (Ersatzteile, Ölsorten), Notizen, Dateien ---------- */
    onAkte(vid, cb) {
      return onSnapshot(doc(db, 'workshops', wid, 'akten', vid), (s) => cb(s.exists() ? s.data() : {}), (err) => { console.error(err); cb({}); });
    },
    saveAkte(vid, patch, by) {
      return track(setDoc(doc(db, 'workshops', wid, 'akten', vid), { ...patch, updatedBy: by || '', updatedAt: serverTimestamp() }, { merge: true }));
    },
    onAkteNotes(vid, cb) {
      const q = query(collection(db, 'workshops', wid, 'akten', vid, 'notizen'), orderBy('ts', 'desc'), limit(300));
      return onSnapshot(q, (qs) => { const l = []; qs.forEach(d => l.push({ ...d.data(), id: d.id })); cb(l); }, (err) => { console.error(err); cb([]); });
    },
    addAkteNote(vid, text, by) {
      return track(setDoc(doc(collection(db, 'workshops', wid, 'akten', vid, 'notizen')), { text, von: by || '', uid, ts: Date.now() }));
    },
    deleteAkteNote(vid, nid) { return track(deleteDoc(doc(db, 'workshops', wid, 'akten', vid, 'notizen', nid))); },
    onAkteFiles(vid, cb) {
      const q = query(collection(db, 'workshops', wid, 'akten', vid, 'dateien'), orderBy('ts', 'desc'), limit(500));
      return onSnapshot(q, { includeMetadataChanges: true }, (qs) => { const l = []; qs.forEach(d => l.push({ ...d.data(), id: d.id, _pending: d.metadata.hasPendingWrites })); cb(l); },
        (err) => { console.error(err); cb([]); });
    },
    /* Datei in Stücken ablegen (Firestore-Dokumente sind auf 1 MB begrenzt). Die Beschreibung wird
       zuletzt geschrieben – erst dann erscheint die Datei in der Akte. */
    async addAkteFile(vid, meta, b64, by, onProgress) {
      if (!navigator.onLine) throw new Error('Zum Hochladen wird Internet gebraucht.');
      const fref = doc(collection(db, 'workshops', wid, 'akten', vid, 'dateien'));
      const SIZE = 700000, n = Math.ceil(b64.length / SIZE) || 1;
      for (let i = 0; i < n; i++) {
        await withTimeout(setDoc(doc(fref, 'teile', String(i).padStart(4, '0')), { data: b64.slice(i * SIZE, (i + 1) * SIZE), n: i }), 60000, 'Hochladen abgebrochen (Verbindung).');
        if (onProgress) onProgress((i + 1) / n);
      }
      await withTimeout(setDoc(fref, { ...meta, chunks: n, von: by || '', uid, ts: Date.now() }), 30000, 'Hochladen abgebrochen (Verbindung).');
      return fref.id;
    },
    async getAkteFile(vid, fid) {
      const qs = await getDocs(query(collection(db, 'workshops', wid, 'akten', vid, 'dateien', fid, 'teile'), orderBy('n')));
      let s = ''; qs.forEach(d => { s += d.data().data; }); return s;
    },
    async deleteAkteFile(vid, fid) {
      if (!navigator.onLine) throw new Error('Zum Löschen wird Internet gebraucht.');
      const fref = doc(db, 'workshops', wid, 'akten', vid, 'dateien', fid);
      const qs = await getDocs(collection(fref, 'teile'));
      const b = writeBatch(db);
      qs.forEach(d => b.delete(d.ref)); b.delete(fref);
      await withTimeout(b.commit(), 30000, 'Keine Verbindung zur Datenbank.');
    },

    /* Ganzen Fuhrpark ersetzen (Excel-Import, nur Admins): alle Fahrzeuge löschen, neue anlegen */
    async replaceFleet(list, by) {
      if (!navigator.onLine) throw new Error('Dafür wird Internet gebraucht.');
      const old = await getDocs(sub('fahrzeuge'));
      const ops = [];
      old.forEach(d => ops.push((b) => b.delete(d.ref)));
      list.forEach(v => { const ref = doc(sub('fahrzeuge')); ops.push((b) => b.set(ref, { ...v, updatedBy: by || '', updatedAt: serverTimestamp() })); });
      for (let i = 0; i < ops.length; i += 400) {           // Firestore: höchstens 500 Schreibvorgänge je Sammelbuchung
        const b = writeBatch(db);
        ops.slice(i, i + 400).forEach(f => f(b));
        try { await withTimeout(b.commit(), 30000, 'Keine Verbindung zur Datenbank.'); }
        catch (e) { if (e && e.code === 'permission-denied') throw new Error('Keine Berechtigung – bitte als Admin anmelden.'); throw e; }
      }
      return { deleted: old.size, added: list.length };
    },
    /* „Letzter Service“ darf jedes Mitglied setzen (beim Abschluss einer Serviceliste) */
    setLastService(id, date, by) {
      return track(updateDoc(doc(db, 'workshops', wid, 'fahrzeuge', id), { letzterService: date, letzterServiceVon: by || '' }));
    },

    /* Nachträgliche Bearbeitung durch Admins (Regeln prüfen Recht und Felder) */
    updateProtocol(id, patch) {
      return track(updateDoc(doc(db, 'workshops', wid, 'protocols', id), patch));
    },

    deleteProtocol(id) {
      return track(deleteDoc(doc(db, 'workshops', wid, 'protocols', id)));
    },

    onSync(cb) { syncSubs.add(cb); cb(...syncState); return () => syncSubs.delete(cb); },
    onLost(cb) { lostSubs.add(cb); return () => lostSubs.delete(cb); }
  };
}
