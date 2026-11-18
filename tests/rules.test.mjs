import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs, addDoc } from 'firebase/firestore';

const env = await initializeTestEnvironment({ projectId: 'demo-rules', firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 } });
const W = 'TESTWERKSTATT001';
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'workshops', W), { name: 'T', members: { se: true, pe: true } });
  await setDoc(doc(db, 'workshops', W, 'members', 'se'), { monteur: 'SE' });
  await setDoc(doc(db, 'workshops', W, 'members', 'pe'), { monteur: 'PE' });
  await setDoc(doc(db, 'workshops', W, 'protocols', 'p1'), { category: 'Kran', ts: 1 });
});
const se = env.authenticatedContext('se').firestore();
const pe = env.authenticatedContext('pe').firestore();
const fremd = env.authenticatedContext('fremd').firestore();
const anon = env.unauthenticatedContext().firestore();
let n = 0, ok = 0;
async function t(name, p) { n++; try { await p; ok++; console.log('✓', name); } catch (e) { console.log('✗', name, e.message); } }

await t('Admin SE darf Vorlage schreiben', assertSucceeds(setDoc(doc(se, 'workshops', W, 'templates', 'Kran'), { groups: [] })));
await t('Monteur PE darf Vorlage NICHT schreiben', assertFails(setDoc(doc(pe, 'workshops', W, 'templates', 'Kran'), { groups: [] })));
await t('PE darf Vorlagen lesen', assertSucceeds(getDocs(collection(pe, 'workshops', W, 'templates'))));
await t('PE darf Protokoll anlegen', assertSucceeds(addDoc(collection(pe, 'workshops', W, 'protocols'), { ts: 2 })));
await t('PE darf Protokoll NICHT ändern', assertFails(updateDoc(doc(pe, 'workshops', W, 'protocols', 'p1'), { ts: 9 })));
await t('PE darf Protokoll NICHT löschen', assertFails(deleteDoc(doc(pe, 'workshops', W, 'protocols', 'p1'))));
await t('SE darf Protokoll NICHT ändern', assertFails(updateDoc(doc(se, 'workshops', W, 'protocols', 'p1'), { ts: 9 })));
await t('SE darf Protokoll löschen', assertSucceeds(deleteDoc(doc(se, 'workshops', W, 'protocols', 'p1'))));
await t('PE darf fremden „Ich bin“-Eintrag NICHT ändern', assertFails(setDoc(doc(pe, 'workshops', W, 'members', 'se'), { monteur: 'PE' })));
await t('Fremder sieht keine Protokolle', assertFails(getDocs(collection(fremd, 'workshops', W, 'protocols'))));
await t('Fremder sieht keine Vorlagen', assertFails(getDocs(collection(fremd, 'workshops', W, 'templates'))));
await t('Fremder darf nur sich selbst beitreten lassen', assertSucceeds(updateDoc(doc(fremd, 'workshops', W), { 'members.fremd': true })));
await t('Mitglied darf andere nicht hinauswerfen (Beitritt fremd2 mit Änderung an pe)', assertFails(updateDoc(doc(env.authenticatedContext('fremd2').firestore(), 'workshops', W), { 'members.pe': false, 'members.fremd2': true })));
await t('Nicht angemeldet: kein Zugriff', assertFails(getDoc(doc(anon, 'workshops', W))));
await t('Werkstätten auflisten verboten', assertFails(getDocs(collection(se, 'workshops'))));
await t('Werkstatt löschen verboten', assertFails(deleteDoc(doc(se, 'workshops', W))));
await t('Außerhalb von workshops alles zu', assertFails(setDoc(doc(se, 'irgendwas', 'x'), { a: 1 })));
console.log(`\n${ok}/${n} Regeltests bestanden`);
await env.cleanup();
process.exit(ok === n ? 0 : 1);
