/* Probemodus: alles bleibt auf diesem Gerät (localStorage).
   Gleiche Schnittstelle wie store-firebase.js. */

const K_TPL = 'kds_local_templates';
const K_PROTO = 'kds_local_protocols';
const K_PINS = 'kds_local_pins';
const K_CLAIM = 'kds_local_claim';

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

  // Andere Tabs im selben Browser
  window.addEventListener('storage', (e) => {
    if (e.key === K_TPL) emitTpl();
    if (e.key === K_PROTO) emitProto();
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
    async getPinFlags() { const p = read(K_PINS, {}); return Object.fromEntries(Object.keys(p).map(k => [k, true])); },
    onPinFlags(cb) { this.getPinFlags().then(cb); return () => {}; },
    async getClaim() { return read(K_CLAIM, null); },
    async setPin(code, pin) { const p = read(K_PINS, {}); p[code] = await this.pinHash(code, pin); write(K_PINS, p); },
    async claimAdmin(code, pin) {
      const p = read(K_PINS, {});
      const hash = await this.pinHash(code, pin);
      if (!p[code] || p[code] !== hash) throw new Error('PIN falsch.');
      const c = { monteur: code, hash }; write(K_CLAIM, c); return c;
    },

    onTemplates(cb) { tplSubs.add(cb); cb(read(K_TPL, {})); return () => tplSubs.delete(cb); },

    async saveTemplate(cat, tpl, by) {
      const all = read(K_TPL, {});
      all[cat] = { groups: tpl.groups, updatedBy: by || '', updatedAt: Date.now() };
      if (!write(K_TPL, all)) throw new Error('Speicher voll');
      emitTpl();
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

    async deleteProtocol(id) {
      write(K_PROTO, read(K_PROTO, []).filter(p => p.id !== id));
      emitProto();
    },

    onSync(cb) { cb('local', 'Probemodus – nur dieses Gerät'); return () => {}; },
    onLost() { return () => {}; }
  };
}
