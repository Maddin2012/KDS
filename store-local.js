/* Probemodus: alles bleibt auf diesem Gerät (localStorage).
   Gleiche Schnittstelle wie store-firebase.js. */

const K_TPL = 'kds_local_templates';
const K_PROTO = 'kds_local_protocols';
const K_PINS = 'kds_local_pins';
const K_FLEET = 'kds_local_fleet';
const K_ORDERS = 'kds_local_orders';
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
  const fleetSubs = new Set(), orderSubs = new Set();
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
    async setLastService(id, date, by) {
      write(K_FLEET, read(K_FLEET, []).map(v => v.id === id ? { ...v, letzterService: date, letzterServiceVon: by || '' } : v)); emitFleet();
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
