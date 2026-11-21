# KDS – Serviceliste Krandienst Schulz

Digitale Service- und Prüfliste für die Werkstatt. Läuft als **Web-App (PWA)**:
im Browser öffnen, auf den Startbildschirm legen, danach wie eine normale App –
eigenes Icon, Vollbild, funktioniert auch ohne Netz.

Aufgebaut wie PlanPrepEat: Die Seite liegt auf **GitHub Pages**, die Daten in
einem kostenlosen **Firebase-Projekt** (Firestore, Region Europa). Alle Geräte
einer Werkstatt sehen dieselben Vorlagen und dasselbe Archiv.

## So wird gearbeitet

**Kategorien** (BF3, Kran, Ladekran, LKW, PKW) – je eine Vorlage aus Hauptgruppen
und Prüfpunkten.

**Serviceliste ausfüllen.** Kopf (ID / Fahrzeug, Km-Stand, Std. OW/UW, Datum),
je Prüfpunkt i.O. / n.i.O. / behoben und eine Bemerkung, unten die Monteure
(Mehrfachauswahl). Einzelne Prüfpunkte oder ganze Hauptgruppen lassen sich für
dieses Fahrzeug abwählen – sie erscheinen dann nicht im Ausdruck.
Die Eingaben bleiben auf dem Gerät gespeichert, bis das Protokoll abgeschlossen ist.

**Protokoll abschließen.** Legt das ausgefüllte Protokoll im gemeinsamen
**Archiv** ab. Danach ist die Liste leer für das nächste Fahrzeug.
Ohne Netz geht das genauso – übertragen wird, sobald wieder Verbindung besteht
(im Archiv mit ⟳ markiert).

**Archiv.** Alle abgeschlossenen Protokolle aller Geräte, neueste zuerst.
Suche nach Fahrzeug, Monteur, Prüfpunkt oder Bemerkung, Filter nach Kategorie.
Ein Protokoll lässt sich öffnen und erneut drucken.

**Protokolle nachträglich bearbeiten – nur Admins (mit PIN).** Im geöffneten
Protokoll **„✏️ Bearbeiten“**: Kopfdaten, i.O. / n.i.O. / behoben, Bemerkungen
und Monteure ändern → **Speichern**. Kategorie, „abgeschlossen von“ und der
Abschlusszeitpunkt bleiben unverändert. Jede Bearbeitung wird vermerkt
(„zuletzt bearbeitet von … am …“, im Archiv „✎ bearbeitet“). Alle anderen
können abgeschlossene Protokolle nur ansehen und drucken.

**„Ich bin“.** Jedes Gerät wählt einmal, wer es benutzt (unten in der
Seitenleiste, jederzeit änderbar). Im Archiv steht dann, wer ein Protokoll
abgeschlossen hat.

**Admins: SE (M. Seidler) und KÖ (R. Köpcke) – mit PIN.** Nur sie sehen
**„Vorlage bearbeiten“**: Hauptgruppen und Prüfpunkte anlegen, umbenennen,
verschieben (Griff ⠿, auch per Finger), löschen, Gruppen in andere Kategorien
kopieren. Änderungen gelten sofort auf allen Geräten. Nur Admins können
Protokolle aus dem Archiv löschen.

Wer bei „Ich bin“ **SE** oder **KÖ** (🔒) antippt, muss die PIN eingeben.
Die PIN steht nirgends im Code: In Firebase liegt nur ein Prüfwert, den kein
Gerät lesen kann, und die **Firebase-Regeln** prüfen bei jedem Admin-Vorgang,
ob das Gerät mit der richtigen PIN angemeldet ist – auch an der App vorbei.
Ein Gerät bleibt angemeldet, bis es ein anderes Kürzel wählt.

- **Erste PIN:** Gibt es in der Werkstatt noch keine PIN, legt das erste
  Gerät, das SE (oder KÖ) wählt, die PIN fest (zweimal eingeben).
- Alles Weitere unter **⚙ Einstellungen** (Zahnrad oben rechts):
  - **Meine PIN ändern** (aktuelle PIN + neue PIN) – meldet alle Geräte ab, die
    mit der alten PIN angemeldet waren.
  - **PIN für KÖ / SE festlegen bzw. zurücksetzen** – ein Admin für den anderen.
    Für ein Kürzel ohne PIN ist die Anmeldung gesperrt.
  - **Neuen Wiederherstellungs-Code erstellen** – der alte wird ungültig.
  - **PIN vergessen?** – Kürzel wählen, Wiederherstellungs-Code und neue PIN
    eingeben. Das Gerät ist danach als dieser Admin angemeldet; der Code ist
    verbraucht, ein neuer wird angezeigt.
- **Wiederherstellungs-Code:** wird beim Festlegen einer PIN **einmalig**
  angezeigt (16 Zeichen, `XXXX-XXXX-XXXX-XXXX`) – aufschreiben! Wie die PIN liegt
  er in Firebase nur als nicht lesbarer Prüfwert.
- **PIN und Code vergessen, kein anderer Admin:** in der Firebase-Konsole unter
  *Firestore Database* bei `workshops → <Code>` die Sammlungen `pins`,
  `pinFlags` und `recoveries` löschen; danach kann die PIN neu festgelegt werden.

> Eine 4-stellige PIN hält Kollegen ab, die einfach „SE“ antippen. Gegen
> jemanden, der den Werkstatt-Code hat und gezielt per Programm alle
> Kombinationen durchprobiert, schützt sie nicht vollständig – längere PINs
> (bis 12 Ziffern) sind möglich.

**Drucken / PDF.** A4, ohne Kopf-/Fußzeile des Browsers; leere Felder bleiben
leer, abgewählte Punkte erscheinen nicht.

**Dunkelmodus.** ⚙ Einstellungen → *Darstellung*: Hell, Dunkel oder Automatisch
(folgt der Geräteeinstellung). Gilt je Gerät; gedruckt wird immer hell.

### Monteure und Admins ändern

In [`data.js`](./data.js) die Liste `MONTEURE` bzw. `ADMINS` anpassen.
Bei `ADMINS` zusätzlich in [`firestore.rules`](./firestore.rules) die Funktionen
`adminCodes()` und `noPinsYet()` anpassen und die Regeln neu veröffentlichen
(Schritt 5 unten).

### Daten der alten Version

Wer die bisherige Einzeldatei-Version im selben Browser unter derselben Adresse
benutzt hat, bekommt beim ersten Start die dort gespeicherten Listen übernommen
(als laufende Eingaben; beim Anlegen der Werkstatt durch einen Admin auch als
Vorlagen). Unter einer neuen Adresse (GitHub Pages) sieht der Browser die alten
Daten nicht – dann starten die Vorlagen mit dem Standard.

---

## Einrichtung

Ohne Firebase läuft die App im **Probemodus**: voll bedienbar, aber nur auf einem
Gerät (unten in der Seitenleiste steht dann „Probemodus – nur dieses Gerät“).
Für den gemeinsamen Stand braucht es einmalig ein kostenloses Firebase-Projekt –
etwa zehn Minuten. Bei einer Werkstatt bleibt die Nutzung weit in der Gratis-Stufe.

### 1. Firebase-Projekt anlegen

1. Auf [console.firebase.google.com](https://console.firebase.google.com) mit dem
   Google-Konto anmelden, **Projekt hinzufügen**, Name z. B. `KDS`.
2. Google Analytics abwählen, das braucht die App nicht.

### 2. Web-App registrieren

1. Im Projekt auf das Zahnrad → **Projekteinstellungen**.
2. Unter *Meine Apps* auf das Web-Symbol `</>`, Name `KDS`, registrieren
   (Firebase Hosting **nicht** anhaken).
3. Es erscheint ein Block `firebaseConfig`. Diese vier Werte braucht ihr gleich:

   | Aus `firebaseConfig` | Gehört in das GitHub-Secret |
   |---|---|
   | `apiKey` | `FB_API_KEY` |
   | `authDomain` | `FB_AUTH_DOMAIN` |
   | `projectId` | `FB_PROJECT_ID` |
   | `appId` | `FB_APP_ID` |

### 3. Anonyme Anmeldung aktivieren

**Authentication** → *Jetzt starten* → Reiter **Anmeldemethode** → **Anonym**
→ aktivieren → speichern.

Die App fragt keine Passwörter ab. Die anonyme Anmeldung liefert nur eine
Kennung fürs Gerät, an der Firebase erkennt, ob es zur Werkstatt gehört.

### 4. Datenbank anlegen

**Firestore Database** → *Datenbank erstellen* → Standardausgabe → Region
`eur3 (europe-west)` → im **Produktionsmodus** starten.

### 5. Sicherheitsregeln veröffentlichen

**Firestore Database** → Reiter **Regeln** → den gesamten Inhalt von
[`firestore.rules`](./firestore.rules) hineinkopieren → **Veröffentlichen**.

> Ohne diesen Schritt lehnt Firebase jeden Zugriff ab.
>
> **Ändert sich `firestore.rules` im Repository** (z. B. mit dem PIN-Schutz),
> diesen Schritt wiederholen – GitHub veröffentlicht nur die App, nicht die Regeln.

### 6. Werte bei GitHub eintragen

Im Repository unter *Settings* → *Secrets and variables* → *Actions* →
**New repository secret** die vier Werte aus Schritt 2 anlegen.

### 7. Veröffentlichen

1. *Settings* → *Pages* → *Source*: **GitHub Actions**.
2. *Actions* → **Veröffentlichen** → **Run workflow**.

> **Secrets allein bewirken nichts.** Die Werte werden beim Veröffentlichen in
> die Seite geschrieben. Nach dem Eintragen oder Ändern der Secrets also immer
> einmal **Run workflow** – sonst läuft die Seite weiter im Probemodus.

Danach liegt die App unter **https://maddin2012.github.io/KDS/**.
Jeder Push auf `main` veröffentlicht automatisch neu.

### 8. Werkstatt anlegen und Geräte verbinden

1. **Erstes Gerät, als Admin (SE oder KÖ):** App öffnen → bei „Wer bist du?“
   das eigene Kürzel wählen → PIN zweimal eingeben → **Neue Werkstatt anlegen**. Die Standardvorlagen
   werden dabei übernommen.
2. Unten in der Seitenleiste auf das eigene Kürzel („Ich bin“) tippen. Im Fenster
   steht unter **Kollegen einladen** der **Werkstatt-Code**; über **Einladen**
   wird ein Link geteilt (WhatsApp, Mail …).
3. **Weitere Geräte:** Link öffnen → erst das eigene **Kürzel antippen** →
   **Beitreten** (der Code ist schon eingetragen). Ohne Link: Code von Hand
   eingeben – mit oder ohne Leerzeichen, Groß-/Kleinschreibung egal.

**Wichtig:** „Neue Werkstatt anlegen“ nur ein einziges Mal. Jede weitere
Werkstatt wäre ein getrennter Bereich mit eigenem Archiv.

### 9. Auf dem Handy installieren

**Android/Chrome:** Adresse öffnen → Menü (⋮) → **Zum Startbildschirm hinzufügen**.
**iPhone/Safari:** Teilen → **Zum Home-Bildschirm**.

Nach einem Update holt sich die App den neuen Stand beim nächsten Öffnen mit Netz;
notfalls die App einmal ganz schließen (aus der App-Übersicht wegwischen) und neu
öffnen. Welche Version läuft, steht unten in der Seitenleiste unter **„Stand:“**
(Datum und Uhrzeit der Veröffentlichung) – damit lässt sich auf jedem Gerät
prüfen, ob ein Update angekommen ist.

### Woran sehe ich, ob alles verbunden ist?

Unten in der Seitenleiste:

| Anzeige | heißt |
|---|---|
| ● Abgeglichen (grün) | verbunden, alles übertragen |
| ● Wird übertragen … (orange) | Änderungen sind unterwegs |
| ● Offline – wird später übertragen (rot) | kein Netz; alles bleibt auf dem Gerät, bis wieder Verbindung besteht |
| ● Probemodus – nur dieses Gerät (grau) | keine Firebase-Werte in dieser Version → Schritt 6 und 7 prüfen |

---

## Für Entwickler

Kein Build-Schritt: reine HTML/CSS/JavaScript-Dateien. Die Firebase-Bibliothek
(Version 12.18.0, Apache-2.0) liegt unter `vendor/firebase/` bei, damit die App
ohne fremde Server und offline startet.

```
index.html          Seitengerüst
styles.css          Aussehen inkl. Druck-Layout
app.js              Bedienung: Ausfüllen, Vorlage bearbeiten, Archiv, Einrichtung
data.js             Kategorien, Monteure, Admins, Standardvorlagen, Übernahme alter Daten
store-firebase.js   Ablage in Firestore (gemeinsam)
store-local.js      Ablage im Browser (Probemodus)
sw.js               Service Worker (Offline-Start)
config.js           Firebase-Werte – wird beim Veröffentlichen aus den Secrets erzeugt
firestore.rules     Sicherheitsregeln
tests/              Regeltests gegen den Firebase-Emulator
```

**Datenmodell** (alles unter `workshops/{code}`):

| Pfad | Inhalt | Rechte |
|---|---|---|
| `workshops/{code}` | Name, Mitglieder (Geräte-Kennungen) | lesen per Code, beitreten nur sich selbst |
| `…/members/{uid}` | „Ich bin“-Kürzel des Geräts | nur eigenes Gerät schreibt |
| `…/templates/{Kategorie}` | Hauptgruppen und Prüfpunkte | lesen alle, schreiben nur Admins |
| `…/protocols/{id}` | abgeschlossenes Protokoll | anlegen/lesen alle, ändern niemand, löschen nur Admins |

Lokal ausprobieren: `python3 -m http.server` im Ordner, dann `http://localhost:8000`.

Regeln testen (braucht Java für den Emulator):

```bash
cd tests && npm install && npm test
```
