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
  onSnapshot, query, orderBy, limit, serverTimestamp, waitForPendingWrites
} from './vendor/firebase/firebase-firestore.js';

const K_WS = 'kds_workshop';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne 0/O, 1/I

function randomCode() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, b => CODE_CHARS[b % CODE_CHARS.length]).join('');
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
    return promise.catch(err => { pending = Math.max(0, pending - 1); emitSync(); handleErr(err); throw err; });
  }

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

    async createWorkshop(name, me, templates) {
      const code = randomCode();
      await setDoc(doc(db, 'workshops', code), {
        name: name || 'Werkstatt', members: { [uid]: true }, createdAt: serverTimestamp()
      });
      wid = code;
      await setDoc(doc(db, 'workshops', code, 'members', uid), { monteur: me, updatedAt: serverTimestamp() });
      if (templates) {
        for (const [cat, tpl] of Object.entries(templates)) {
          await setDoc(doc(db, 'workshops', code, 'templates', cat),
            { groups: tpl.groups, updatedBy: me, updatedAt: serverTimestamp() });
        }
      }
      localStorage.setItem(K_WS, code);
      return code;
    },

    async joinWorkshop(rawCode, me) {
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
      await setDoc(doc(db, 'workshops', code, 'members', uid), { monteur: me, updatedAt: serverTimestamp() });
      localStorage.setItem(K_WS, code);
      return code;
    },

    leave() { localStorage.removeItem(K_WS); wid = null; },

    setMe(me) {
      if (!wid) return Promise.resolve();
      return track(setDoc(doc(db, 'workshops', wid, 'members', uid), { monteur: me, updatedAt: serverTimestamp() }));
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

    deleteProtocol(id) {
      return track(deleteDoc(doc(db, 'workshops', wid, 'protocols', id)));
    },

    onSync(cb) { syncSubs.add(cb); cb(...syncState); return () => syncSubs.delete(cb); },
    onLost(cb) { lostSubs.add(cb); return () => lostSubs.delete(cb); }
  };
}
