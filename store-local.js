/* Probemodus: alles bleibt auf diesem Gerät (localStorage).
   Gleiche Schnittstelle wie store-firebase.js. */

const K_TPL = 'kds_local_templates';
const K_PROTO = 'kds_local_protocols';
const K_PINS = 'kds_local_pins';
const K_FLEET = 'kds_local_fleet';
const K_ORDERS = 'kds_local_orders';
const K_ART = 'kds_local_articles';
const K_BOOK = 'kds_local_bookings';
const K_LCFG = 'kds_local_lagercfg';
const K_COUNT = 'kds_local_counters';
const K_CLAIM = 'kds_local_claim';
const K_REC = 'kds_local_recoveries';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newRecoveryCode() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, b => CODE_CHARS[b % CODE_CHARS.length]).join('').replace(/(.{4})(?=.)/g, '$1-');
}

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

function read(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
  catch (e) { return fallback; }
}
function write(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch (e) { return false; }
}

export function createLocalStore() {
  const tplSubs = new Set(), protoSubs = new Set();
  const emitTpl = () => tplSubs.forEach(cb => cb(read(K_TPL, {})));
  const emitProto = () => protoSubs.forEach(cb => cb(read(K_PROTO, [])));
  const fleetSubs = new Set(), orderSubs = new Set(), artSubs = new Set(), bookSubs = new Set(), cfgSubs = new Set();
  const emitArt = () => artSubs.forEach(cb => cb(read(K_ART, [])));
  const emitOrders = () => orderSubs.forEach(cb => cb(read(K_ORDERS, []).slice().sort((a, b) => (b.created || 0) - (a.created || 0))));
  const emitFleet = () => fleetSubs.forEach(cb => cb(read(K_FLEET, [])));

  // Andere Tabs im selben Browser
  window.addEventListener('storage', (e) => {
    if (e.key === K_TPL) emitTpl();
    if (e.key === K_PROTO) emitProto();
    if (e.key === K_FLEET) emitFleet();
    if (e.key === K_ORDERS) emitOrders();
  });

  return {
    mode: 'local',
    workshop: { id: null, name: 'Probemodus' },

    async start() { return { ready: true }; },

    /* Nutzer sperren – im Probemodus nur die Kürzel-Liste auf diesem Gerät */
    uid: 'local',
    onWorkshop(cb) { cb({ gesperrt: JSON.parse(localStorage.getItem('kds_local_gesperrt') || '[]') }); this._wsCb = cb; return () => {}; },
    onMembers(cb) { cb([]); return () => {}; },
    async isBanned() { return false; },
    async setBlocked(code, blocked) {
      const cur = new Set(JSON.parse(localStorage.getItem('kds_local_gesperrt') || '[]'));
      blocked ? cur.add(code) : cur.delete(code);
      localStorage.setItem('kds_local_gesperrt', JSON.stringify([...cur]));
      if (this._wsCb) this._wsCb({ gesperrt: [...cur] });
      return 0;
    },

    seedTemplatesIfEmpty(templates) {
      if (!localStorage.getItem(K_TPL) && templates && Object.keys(templates).length) write(K_TPL, templates);
    },

    async setMe() { localStorage.removeItem(K_CLAIM); },

    /* PIN-Schutz im Probemodus (nur auf diesem Gerät, ohne echten Schutz) */
    pinHash(code, pin) { return sha256hex(`kds:local:${code}:${pin}`); },
    recHash(code, rc) { return sha256hex(`kds-rec:local:${code}:${String(rc).toUpperCase().replace(/[^A-Z0-9]/g, '')}`); },
    async getPinFlags() {
      const p = read(K_PINS, {}), r = read(K_REC, {});
      return Object.fromEntries(Object.keys(p).map(k => [k, { set: true, rec: !!r[k] }]));
    },
    onPinFlags(cb) { this.getPinFlags().then(cb); return () => {}; },
    async getClaim() { return read(K_CLAIM, null); },
    async setPin(code, pin, opts = {}) {
      const p = read(K_PINS, {}); p[code] = await this.pinHash(code, pin); write(K_PINS, p);
      return opts.recovery ? this.createRecovery(code) : null;
    },
    async createRecovery(code) {
      const rc = newRecoveryCode();
      const r = read(K_REC, {}); r[code] = await this.recHash(code, rc); write(K_REC, r);
      return rc;
    },
    async resetPinWithRecovery(code, rc, newPin) {
      const r = read(K_REC, {});
      if (!r[code] || r[code] !== await this.recHash(code, rc)) throw new Error('Wiederherstellungs-Code falsch – oder für dieses Kürzel gibt es keinen.');
      await this.setPin(code, newPin);
      const recovery = await this.createRecovery(code);
      const claim = await this.claimAdmin(code, newPin);
      return { recovery, claim };
    },
    async claimAdmin(code, pin) {
      const p = read(K_PINS, {});
      const hash = await this.pinHash(code, pin);
      if (!p[code] || p[code] !== hash) throw new Error('PIN falsch.');
      const c = { monteur: code, hash }; write(K_CLAIM, c); return c;
    },

    onTemplates(cb) { tplSubs.add(cb); cb(read(K_TPL, {})); return () => tplSubs.delete(cb); },

    async saveTemplate(cat, tpl, by) {
      const all = read(K_TPL, {});
      all[cat] = { groups: tpl.groups, updatedBy: by || '', updatedAt: Date.now(), textFix: tpl.textFix || 1 };
      if (!write(K_TPL, all)) throw new Error('Speicher voll');
      emitTpl();
    },

    /* ---------- Lager ---------- */
    onArticles(cb) { artSubs.add(cb); cb(read(K_ART, [])); return () => artSubs.delete(cb); },
    newArticleId() { return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
    async saveArticle(id, data, by, isNew) {
      const list = read(K_ART, []); const i = list.findIndex(a => a.id === id);
      const d = { ...(i >= 0 ? list[i] : {}), ...data, id, updatedBy: by || '', updatedAt: Date.now() };
      if (isNew) d.bestand = 0;
      if (i >= 0) list[i] = d; else list.push(d);
      write(K_ART, list); emitArt();
    },
    async deleteArticle(id) {
      write(K_ART, read(K_ART, []).filter(a => a.id !== id));
      const b = read(K_BOOK, {}); delete b[id]; write(K_BOOK, b); emitArt();
    },
    async book(aid, { typ, menge, grund, oid, vehId }, by) {
      const list = read(K_ART, []); const a = list.find(x => x.id === aid);
      if (!a) throw new Error('Artikel nicht gefunden.');
      const cur = Number(a.bestand) || 0; let neu;
      if (typ === 'Zulauf') neu = cur + menge;
      else if (typ === 'Entnahme') { if (menge > cur) throw Object.assign(new Error('Zu wenig Bestand.'), { code: 'zu-wenig', bestand: cur }); neu = cur - menge; }
      else neu = menge;
      a.bestand = neu; a.bestandVon = by || ''; write(K_ART, list);
      const b = read(K_BOOK, {}); (b[aid] = b[aid] || []).unshift({ id: 'b' + Date.now(), typ, menge: typ === 'Korrektur' ? neu - cur : menge,
        grund: grund || '', ts: Date.now(), bestandVorher: cur, bestandNachher: neu, von: by || '', preis: Number(a.preis) || 0,
        ...(oid ? { oid } : {}), ...(vehId ? { vehId } : {}) });
      b[aid] = b[aid].slice(0, 2000); write(K_BOOK, b);
      emitArt(); bookSubs.forEach(x => { if (x.aid === aid) x.cb(b[aid]); });
      return neu;
    },
    async getBookings(aid) { return (read(K_BOOK, {})[aid] || []).map(x => ({ ...x, aid })); },
    onBookings(aid, cb) { const x = { aid, cb }; bookSubs.add(x); cb(read(K_BOOK, {})[aid] || []); return () => bookSubs.delete(x); },
    onRunning(cb) { this._runSubs = this._runSubs || new Set(); this._runSubs.add(cb); cb(read('kds_local_running', [])); return () => this._runSubs.delete(cb); },
    async publishRunning(cat, data) { const l = read('kds_local_running', []).filter(x => x.cat !== cat); l.push({ ...data, cat, uid: 'local', id: 'local_' + cat, ts: Date.now() }); write('kds_local_running', l); (this._runSubs || []).forEach(f => f(l)); },
    async deleteRunningById(id) { return this.deleteRunning(String(id).replace(/^local_/, '')); },
    async deleteRunning(cat) { const l = read('kds_local_running', []).filter(x => x.cat !== cat); write('kds_local_running', l); (this._runSubs || []).forEach(f => f(l)); },
    myRunningPrefix: 'local_',
    onLagerCfg(cb) { cfgSubs.add(cb); cb(read(K_LCFG, {})); return () => cfgSubs.delete(cb); },
    async saveLagerCfg(data) { write(K_LCFG, { ...read(K_LCFG, {}), ...data }); cfgSubs.forEach(cb => cb(read(K_LCFG, {}))); },

    /* ---------- Werkstattaufträge ---------- */
    onOrders(cb) { orderSubs.add(cb); emitOrders(); return () => orderSubs.delete(cb); },
    async nextOrderNr(key) { const c = read(K_COUNT, {}); c[key] = (c[key] || 0) + 1; write(K_COUNT, c); return c[key]; },
    newOrderId() { return 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
    async saveOrder(id, data, by) {
      const list = read(K_ORDERS, []);
      const d = { ...data, id, updatedBy: by || '', updatedAt: Date.now() };
      const i = list.findIndex(o => o.id === id);
      if (i >= 0) list[i] = d; else list.push(d);
      if (!write(K_ORDERS, list)) throw new Error('Speicher voll');
      emitOrders();
    },
    async deleteOrder(id) { write(K_ORDERS, read(K_ORDERS, []).filter(o => o.id !== id)); emitOrders(); },

    /* ---------- Fuhrpark ---------- */
    onVehicles(cb) { fleetSubs.add(cb); cb(read(K_FLEET, [])); return () => fleetSubs.delete(cb); },
    async saveVehicle(id, data, by) {
      const list = read(K_FLEET, []);
      const vid = id || ('f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
      const i = list.findIndex(v => v.id === vid);
      const doc = { ...data, id: vid, updatedBy: by || '', updatedAt: Date.now() };
      if (i >= 0) list[i] = doc; else list.push(doc);
      write(K_FLEET, list); emitFleet(); return vid;
    },
    saveVehicleNow(id, data, by) { return this.saveVehicle(id, data, by); },
    async deleteVehicle(id) { write(K_FLEET, read(K_FLEET, []).filter(v => v.id !== id)); emitFleet(); },
    async replaceFleet(list, by) {
      const old = read(K_FLEET, []).length;
      write(K_FLEET, list.map((v, i) => ({ ...v, id: 'f' + Date.now().toString(36) + i, updatedBy: by || '', updatedAt: Date.now() })));
      emitFleet(); return { deleted: old, added: list.length };
    },
    async setLastService(id, date, by) {
      write(K_FLEET, read(K_FLEET, []).map(v => v.id === id ? { ...v, letzterService: date, letzterServiceVon: by || '' } : v)); emitFleet();
    },

    /* ---------- Fahrzeugakte (Probemodus: alles im Browser) ---------- */
    _akte(vid) { return read('kds_local_akte_' + vid, { akte: {}, notes: [], files: [], data: {} }); },
    _akteSave(vid, d) { if (!write('kds_local_akte_' + vid, d)) throw new Error('Speicher dieses Geräts voll'); (this._akteSubs || []).forEach(f => f(vid)); },
    _akteSub(vid, fn) { this._akteSubs = this._akteSubs || []; const f = (v) => { if (v === vid) fn(); }; this._akteSubs.push(f); fn(); return () => { this._akteSubs = this._akteSubs.filter(x => x !== f); }; },
    onAkte(vid, cb) { return this._akteSub(vid, () => cb(this._akte(vid).akte)); },
    async saveAkte(vid, patch, by) { const d = this._akte(vid); d.akte = { ...d.akte, ...patch }; this._akteSave(vid, d); },
    onAkteNotes(vid, cb) { return this._akteSub(vid, () => cb(this._akte(vid).notes.slice().sort((x, y) => y.ts - x.ts))); },
    async addAkteNote(vid, text, by) { const d = this._akte(vid); d.notes.push({ id: 'n' + Date.now().toString(36), text, von: by || '', uid: 'local', ts: Date.now() }); this._akteSave(vid, d); },
    async deleteAkteNote(vid, nid) { const d = this._akte(vid); d.notes = d.notes.filter(n => n.id !== nid); this._akteSave(vid, d); },
    onAkteFiles(vid, cb) { return this._akteSub(vid, () => cb(this._akte(vid).files.slice().sort((x, y) => y.ts - x.ts))); },
    async addAkteFile(vid, meta, b64, by, onProgress) {
      const d = this._akte(vid), id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      d.files.push({ ...meta, id, von: by || '', uid: 'local', ts: Date.now() }); d.data[id] = b64;
      this._akteSave(vid, d); if (onProgress) onProgress(1); return id;
    },
    async getAkteFile(vid, fid) { return this._akte(vid).data[fid] || ''; },
    async deleteAkteFile(vid, fid) { const d = this._akte(vid); d.files = d.files.filter(f => f.id !== fid); delete d.data[fid]; this._akteSave(vid, d); },

    /* Anhänge an Aufträgen (Probemodus) */
    _of(oid) { return read('kds_local_ofiles_' + oid, { files: [], data: {} }); },
    onFiles(coll, pid, cb) {
      if (coll === 'akten') return this.onAkteFiles(pid, cb);
      this._ofSubs = this._ofSubs || []; const f = (p) => { if (p === pid) cb(this._of(pid).files.slice().sort((x, y) => y.ts - x.ts)); };
      this._ofSubs.push(f); f(pid); return () => { this._ofSubs = this._ofSubs.filter(x => x !== f); };
    },
    async addFile(coll, pid, meta, b64, by, onProgress) {
      if (coll === 'akten') return this.addAkteFile(pid, meta, b64, by, onProgress);
      const d = this._of(pid), id = 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      d.files.push({ ...meta, id, von: by || '', uid: 'local', ts: Date.now() }); d.data[id] = b64;
      if (!write('kds_local_ofiles_' + pid, d)) throw new Error('Speicher dieses Geräts voll');
      (this._ofSubs || []).forEach(f => f(pid)); if (onProgress) onProgress(1); return id;
    },
    async getFile(coll, pid, fid) { return coll === 'akten' ? this.getAkteFile(pid, fid) : (this._of(pid).data[fid] || ''); },
    async deleteFile(coll, pid, fid) {
      if (coll === 'akten') return this.deleteAkteFile(pid, fid);
      const d = this._of(pid); d.files = d.files.filter(f => f.id !== fid); delete d.data[fid]; write('kds_local_ofiles_' + pid, d); (this._ofSubs || []).forEach(f => f(pid));
    },

    onProtocols(cb) { protoSubs.add(cb); cb(read(K_PROTO, [])); return () => protoSubs.delete(cb); },

    async addProtocol(p) {
      const list = read(K_PROTO, []);
      const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      list.push({ ...p, id });
      if (!write(K_PROTO, list)) throw new Error('Speicher voll');
      emitProto();
      return id;
    },

    async updateProtocol(id, patch) {
      write(K_PROTO, read(K_PROTO, []).map(p => p.id === id ? { ...p, ...patch } : p));
      emitProto();
    },

    async deleteProtocol(id) {
      write(K_PROTO, read(K_PROTO, []).filter(p => p.id !== id));
      emitProto();
    },

    onSync(cb) { cb('warn', 'Probemodus – nur dieses Gerät'); return () => {}; },
    onLost() { return () => {}; }
  };
}
