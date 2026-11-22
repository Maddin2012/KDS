/* Firestore-Sicherheitsregeln direkt über die Firebase-Rules-Schnittstelle einspielen.
   Aufruf: node deploy-rules.mjs <dienstkonto.json> <firestore.rules>
   Ohne Fremdpakete: Anmeldung per signiertem JWT (Dienstkonto), dann
   1) Regelsatz anlegen (prüft zugleich die Syntax), 2) Freigabe „cloud.firestore“ darauf umstellen. */
import { readFileSync } from 'fs';
import crypto from 'crypto';

const fail = (msg) => { console.log('::error::' + String(msg).slice(0, 500)); process.exit(1); };
const [, , saPath, rulesPath] = process.argv;
let sa;
try { sa = JSON.parse(readFileSync(saPath, 'utf8')); } catch (e) { fail('Dienstkonto-Schlüssel (FB_SERVICE_ACCOUNT) ist kein gültiges JSON.'); }
if (!sa.client_email || !sa.private_key || !sa.project_id) fail('Im Schlüssel fehlen client_email, private_key oder project_id.');
const rules = readFileSync(rulesPath, 'utf8');
const pid = sa.project_id;

// --- Zugriffstoken holen ---
const b64u = (b) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const now = Math.floor(Date.now() / 1000);
const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
const claim = b64u(JSON.stringify({
  iss: sa.client_email, aud: tokenUri, iat: now, exp: now + 3600,
  scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase'
}));
const sig = crypto.createSign('RSA-SHA256').update(head + '.' + claim).sign(sa.private_key);
const tokRes = await fetch(tokenUri, {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + b64u(sig) })
});
const tok = await tokRes.json().catch(() => ({}));
if (!tok.access_token) fail('Anmeldung mit dem Dienstkonto fehlgeschlagen: ' + (tok.error_description || tok.error || tokRes.status));

const headers = { authorization: 'Bearer ' + tok.access_token, 'content-type': 'application/json' };
const api = 'https://firebaserules.googleapis.com/v1/';
const errText = async (r) => { const j = await r.json().catch(() => ({})); return (j.error && j.error.message) || r.status; };

// --- 1) Regelsatz anlegen ---
const rs = await fetch(api + `projects/${pid}/rulesets`, {
  method: 'POST', headers, body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: rules }] } })
});
if (!rs.ok) fail('Regelsatz konnte nicht angelegt werden: ' + await errText(rs));
const ruleset = (await rs.json()).name;

// --- 2) Freigabe für Firestore auf den neuen Regelsatz umstellen ---
const relName = `projects/${pid}/releases/cloud.firestore`;
let rel = await fetch(api + relName, { method: 'PATCH', headers, body: JSON.stringify({ release: { name: relName, rulesetName: ruleset } }) });
if (rel.status === 404) {
  rel = await fetch(api + `projects/${pid}/releases`, { method: 'POST', headers, body: JSON.stringify({ name: relName, rulesetName: ruleset }) });
}
if (!rel.ok) fail('Regeln konnten nicht freigegeben werden: ' + await errText(rel));
console.log('Firestore-Regeln eingespielt: ' + ruleset.split('/').pop());
