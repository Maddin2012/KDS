import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs, addDoc, writeBatch } from 'firebase/firestore';
import { createHash } from 'crypto';

// Gleiche Berechnung wie in der App: SHA-256 aus Werkstatt-Code, Kürzel und PIN
const pinHash = (wid, code, pin) => createHash('sha256').update(`kds:${wid}:${code}:${pin}`).digest('hex');

const env = await initializeTestEnvironment({ projectId: 'demo-rules', firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 } });
const W = 'TESTWERKSTATT001';
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'workshops', W), { name: 'T', members: { se: true, pe: true } });
  await setDoc(doc(db, 'workshops', W, 'members', 'se'), { monteur: 'SE' });
  await setDoc(doc(db, 'workshops', W, 'members', 'pe'), { monteur: 'PE' });
  await setDoc(doc(db, 'workshops', W, 'pins', 'SE'), { hash: pinHash(W, 'SE', '1111') });
  await setDoc(doc(db, 'workshops', W, 'adminClaims', 'se'), { monteur: 'SE', hash: pinHash(W, 'SE', '1111') });
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
await t('Admin SE darf Abschlusszeit NICHT ändern', assertFails(updateDoc(doc(se, 'workshops', W, 'protocols', 'p1'), { ts: 9 })));
await t('Admin SE darf „abgeschlossen von“ NICHT ändern', assertFails(updateDoc(doc(se, 'workshops', W, 'protocols', 'p1'), { closedBy: 'XX' })));
await t('Admin SE darf Kategorie NICHT ändern', assertFails(updateDoc(doc(se, 'workshops', W, 'protocols', 'p1'), { category: 'PKW' })));
await t('Admin SE darf Protokoll bearbeiten (Kopf, Haken, Bemerkungen, Monteure)', assertSucceeds(updateDoc(doc(se, 'workshops', W, 'protocols', 'p1'),
  { header: { fId: 'MK 88' }, monteure: ['SE'], groups: [], editedBy: 'SE', editedAt: 5, edits: [{ by: 'SE', ts: 5 }] })));
await t('PE darf Protokoll NICHT bearbeiten', assertFails(updateDoc(doc(pe, 'workshops', W, 'protocols', 'p1'), { header: { fId: 'X' } })));
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
// ---------- PIN-Schutz ----------
const claimRef = (db, uid) => doc(db, 'workshops', W, 'adminClaims', uid);
const memberRef = (db, uid) => doc(db, 'workshops', W, 'members', uid);
async function claim(db, uid, code, pin) {
  const b = writeBatch(db);
  b.set(claimRef(db, uid), { monteur: code, hash: pinHash(W, code, pin) });
  b.set(memberRef(db, uid), { monteur: code });
  return b.commit();
}
await t('PIN-Prüfwerte sind für niemanden lesbar (auch nicht für Admin)', assertFails(getDoc(doc(se, 'workshops', W, 'pins', 'SE'))));
await t('PE kann sich ohne PIN nicht als SE eintragen', assertFails(setDoc(memberRef(pe, 'pe'), { monteur: 'SE' })));
await t('PE mit falscher PIN → kein Admin-Nachweis', assertFails(claim(pe, 'pe', 'SE', '9999')));
await t('PE darf sich nicht selbst eine neue SE-PIN setzen', assertFails(setDoc(doc(pe, 'workshops', W, 'pins', 'SE'), { hash: pinHash(W, 'SE', '0000') })));
await t('PE darf keine KÖ-PIN setzen (es gibt schon eine PIN)', assertFails(setDoc(doc(pe, 'workshops', W, 'pins', 'KÖ'), { hash: pinHash(W, 'KÖ', '0000') })));
await t('PE darf fremden Admin-Nachweis nicht lesen', assertFails(getDoc(claimRef(pe, 'se'))));
await t('Admin-Nachweis mit erfundenem Prüfwert scheitert', assertFails(setDoc(claimRef(pe, 'pe'), { monteur: 'SE', hash: 'a'.repeat(64) })));
const pe2 = env.authenticatedContext('pe').firestore();
await t('PE mit richtiger PIN wird Admin (Nachweis + Ich bin)', assertSucceeds(claim(pe2, 'pe', 'SE', '1111')));
await t('… und darf danach Vorlagen schreiben', assertSucceeds(setDoc(doc(pe2, 'workshops', W, 'templates', 'LKW'), { groups: [] })));
await t('Admin SE setzt PIN für KÖ', assertSucceeds((async () => { const b = writeBatch(se); b.set(doc(se, 'workshops', W, 'pins', 'KÖ'), { hash: pinHash(W, 'KÖ', '4242') }); b.set(doc(se, 'workshops', W, 'pinFlags', 'KÖ'), { set: true }); await b.commit(); })()));
await t('pinFlag ohne zugehörige PIN nicht möglich', assertFails(setDoc(doc(pe, 'workshops', W, 'pinFlags', 'XX'), { set: true })));
await t('Mitglieder sehen, für welche Kürzel es eine PIN gibt', assertSucceeds(getDoc(doc(pe, 'workshops', W, 'pinFlags', 'KÖ'))));
await t('SE ändert eigene PIN', assertSucceeds(setDoc(doc(se, 'workshops', W, 'pins', 'SE'), { hash: pinHash(W, 'SE', '2222') })));
await t('Alter Nachweis von PE gilt nach PIN-Änderung nicht mehr', assertFails(setDoc(doc(pe2, 'workshops', W, 'templates', 'LKW'), { groups: [1] })));
await t('Auch SE muss sich nach eigener PIN-Änderung neu nachweisen', assertFails(setDoc(doc(se, 'workshops', W, 'templates', 'LKW'), { groups: [2] })));
await t('SE mit neuer PIN wieder Admin', assertSucceeds(claim(se, 'se', 'SE', '2222')));
await t('Ich bin auf PE zurück + Nachweis löschen erlaubt', assertSucceeds((async () => { await setDoc(memberRef(pe2, 'pe'), { monteur: 'PE' }); await deleteDoc(claimRef(pe2, 'pe')); })()));

// Einrichtung: neue Werkstatt ohne PINs – erste PIN darf gesetzt werden, zweite „erste“ nicht mehr
const W2 = 'NEUEWERKSTATT002';
const a = env.authenticatedContext('a').firestore(), bb = env.authenticatedContext('b').firestore();
await t('Neue Werkstatt anlegen', assertSucceeds(setDoc(doc(a, 'workshops', W2), { name: 'N', members: { a: true } })));
await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'workshops', W2), { name: 'N', members: { a: true, b: true } }));
await t('Erste PIN (SE) bei Einrichtung', assertSucceeds((async () => { const b = writeBatch(a); b.set(doc(a, 'workshops', W2, 'pins', 'SE'), { hash: pinHash(W2, 'SE', '2721') }); b.set(doc(a, 'workshops', W2, 'pinFlags', 'SE'), { set: true }); await b.commit(); })()));
await t('Danach kann ein anderes Mitglied keine „erste“ PIN mehr setzen (KÖ)', assertFails(setDoc(doc(bb, 'workshops', W2, 'pins', 'KÖ'), { hash: pinHash(W2, 'KÖ', '0000') })));
await t('… und die SE-PIN nicht überschreiben', assertFails(setDoc(doc(bb, 'workshops', W2, 'pins', 'SE'), { hash: pinHash(W2, 'SE', '0000') })));
await t('KÖ kann sich ohne festgelegte KÖ-PIN nicht als Admin nachweisen', assertFails((async () => { const b = writeBatch(bb); b.set(doc(bb, 'workshops', W2, 'adminClaims', 'b'), { monteur: 'KÖ', hash: pinHash(W2, 'KÖ', '') }); b.set(doc(bb, 'workshops', W2, 'members', 'b'), { monteur: 'KÖ' }); await b.commit(); })()));

// ---------- Wiederherstellungs-Code ----------
const recHash = (wid, code, rc) => createHash('sha256').update(`kds-rec:${wid}:${code}:${rc}`).digest('hex');
const W3 = 'RECOVERYWERKST03';
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'workshops', W3), { name: 'R', members: { se: true, pe: true, ko: true } });
  await setDoc(doc(db, 'workshops', W3, 'pins', 'SE'), { hash: pinHash(W3, 'SE', '1111') });
  await setDoc(doc(db, 'workshops', W3, 'recoveries', 'SE'), { hash: recHash(W3, 'SE', 'ALTCODE') });
  await setDoc(doc(db, 'workshops', W3, 'pins', 'KÖ'), { hash: pinHash(W3, 'KÖ', '3333') });
  await setDoc(doc(db, 'workshops', W3, 'adminClaims', 'ko'), { monteur: 'KÖ', hash: pinHash(W3, 'KÖ', '3333') });
});
const reset = (db, rc, newPin, newRc) => { const b = writeBatch(db);
  b.set(doc(db, 'workshops', W3, 'pins', 'SE'), { hash: pinHash(W3, 'SE', newPin), rec: recHash(W3, 'SE', rc) });
  b.set(doc(db, 'workshops', W3, 'recoveries', 'SE'), { hash: recHash(W3, 'SE', newRc), prev: recHash(W3, 'SE', rc) });
  return b.commit(); };
const seR = env.authenticatedContext('se').firestore(), peR = env.authenticatedContext('pe').firestore(), koR = env.authenticatedContext('ko').firestore();
await t('Wiederherstellungs-Codes sind nicht lesbar', assertFails(getDoc(doc(seR, 'workshops', W3, 'recoveries', 'SE'))));
await t('PIN zurücksetzen mit falschem Code scheitert', assertFails(reset(peR, 'FALSCH', '9999', 'NEU1')));
await t('Code erneuern ohne alten Code scheitert (Nicht-Admin)', assertFails(setDoc(doc(peR, 'workshops', W3, 'recoveries', 'SE'), { hash: recHash(W3, 'SE', 'X') })));
await t('PIN zurücksetzen mit richtigem Code klappt', assertSucceeds(reset(seR, 'ALTCODE', '2721', 'NEUCODE')));
await t('… danach Anmeldung mit neuer PIN', assertSucceeds((async () => { const b = writeBatch(seR); b.set(doc(seR, 'workshops', W3, 'adminClaims', 'se'), { monteur: 'SE', hash: pinHash(W3, 'SE', '2721') }); b.set(doc(seR, 'workshops', W3, 'members', 'se'), { monteur: 'SE' }); await b.commit(); })()));
await t('Alter Code ist danach verbraucht', assertFails(reset(peR, 'ALTCODE', '0000', 'NEU2')));
await t('Admin KÖ setzt PIN von SE zurück (anderer Admin)', assertSucceeds(setDoc(doc(koR, 'workshops', W3, 'pins', 'SE'), { hash: pinHash(W3, 'SE', '4444') })));
await t('Admin KÖ erstellt neuen Code für SE', assertSucceeds(setDoc(doc(koR, 'workshops', W3, 'recoveries', 'SE'), { hash: recHash(W3, 'SE', 'KOCODE') })));
await t('Nicht-Admin kann keine PIN ohne Code setzen', assertFails(setDoc(doc(peR, 'workshops', W3, 'pins', 'SE'), { hash: pinHash(W3, 'SE', '5555') })));

// ---------- Fuhrpark ----------
const W4 = 'FUHRPARKWERKST04';
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'workshops', W4), { name: 'F', members: { se: true, pe: true } });
  await setDoc(doc(db, 'workshops', W4, 'pins', 'SE'), { hash: pinHash(W4, 'SE', '1111') });
  await setDoc(doc(db, 'workshops', W4, 'adminClaims', 'se'), { monteur: 'SE', hash: pinHash(W4, 'SE', '1111') });
  await setDoc(doc(db, 'workshops', W4, 'fahrzeuge', 'v1'), { code: '088', typ: 'MK 88 Plus', kz: 'OD-KS 088', letzterService: '' });
});
const seF = env.authenticatedContext('se').firestore(), peF = env.authenticatedContext('pe').firestore(), frF = env.authenticatedContext('fremd').firestore();
const vRef = (db, id) => doc(db, 'workshops', W4, 'fahrzeuge', id);
await t('Mitglied liest Fuhrpark', assertSucceeds(getDocs(collection(peF, 'workshops', W4, 'fahrzeuge'))));
await t('Fremder liest Fuhrpark NICHT', assertFails(getDocs(collection(frF, 'workshops', W4, 'fahrzeuge'))));
await t('Admin legt Fahrzeug an', assertSucceeds(setDoc(vRef(seF, 'v2'), { code: '100', typ: 'MK 100' })));
await t('Admin ändert Fahrzeug', assertSucceeds(updateDoc(vRef(seF, 'v2'), { kz: 'HH-KS 100', hu: '2027-05-01' })));
await t('Mitarbeiter legt KEIN Fahrzeug an', assertFails(setDoc(vRef(peF, 'v3'), { code: '1', typ: 'X' })));
await t('Mitarbeiter ändert KEIN Kennzeichen', assertFails(updateDoc(vRef(peF, 'v1'), { kz: 'XX' })));
await t('Mitarbeiter setzt „letzter Service“', assertSucceeds(updateDoc(vRef(peF, 'v1'), { letzterService: '2026-11-22', letzterServiceVon: 'PE' })));
await t('… aber nicht zusammen mit anderen Feldern', assertFails(updateDoc(vRef(peF, 'v1'), { letzterService: '2026-11-23', hu: '2030-01-01' })));
await t('Mitarbeiter löscht KEIN Fahrzeug', assertFails(deleteDoc(vRef(peF, 'v1'))));
await t('Admin löscht Fahrzeug', assertSucceeds(deleteDoc(vRef(seF, 'v2'))));

console.log(`\n${ok}/${n} Regeltests bestanden`);
await env.cleanup();
process.exit(ok === n ? 0 : 1);
