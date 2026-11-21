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
  onSnapshot, query, orderBy, limit, serverTimestamp, waitForPendingWrites, writeBatch, getDocs
} from './vendor/firebase/firebase-firestore.js';
import { ADMINS } from './data.js';

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
  let syncState = ['wait', 'Verbinde …'];

  function emitSync() {
    if (!navigator.onLine) syncState = ['off', 'Offline – wird später übertragen'];
    else if (pending > 0) syncState = ['wait', 'Wird übertragen …'];
    else syncState = ['ok', 'Abgeglichen'];
    syncSubs.forEach(cb => cb(...syncState));
  }
  window.addEventListener('online', emitSync);
  window.addEventListener('offline', emitSync);

  // Schreibvorgang verfolgen: Firestore speichert sofort lokal und überträgt,
  // sobald Netz da ist. Die Anzeige zeigt, ob noch etwas aussteht.
  function track(promise) {
    pending++; emitSync();
    waitForPendingWrites(db).then(() => { pending = 0; emitSync(); }).catch(() => {});
    // Abgelehnte Schreibvorgänge (z. B. fehlende Admin-Rechte) sind KEIN Zugriffsverlust
    return promise.catch(err => { pending = Math.max(0, pending - 1); emitSync(); console.error(err); throw err; });
  }

  /* Nur für die Hauptlisten (Vorlagen, Archiv): Werden die abgelehnt, ist das Gerät
     nicht mehr Mitglied der Werkstatt. Andere Ablehnungen melden das Gerät nicht ab. */
  function handleErr(err) {
    console.error(err);
    if (err && err.code === 'permission-denied') lostSubs.forEach(cb => cb(err));
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
      return track(setDoc(doc(db, 'workshops', wid, 'templates', cat),
        { groups: tpl.groups, updatedBy: by || '', updatedAt: serverTimestamp() }));
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
