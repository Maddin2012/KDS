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

**Live mitverfolgen.** Servicelisten sind auf allen Geräten live: Hakt der Monteur draußen in einer
Serviceliste aus einem Auftrag ab, sieht man es auf jedem anderen Gerät, auf dem dieselbe Liste offen ist,
binnen Sekunden („● aktualisiert von …“). *Serviceliste* → **Laufende Listen** zeigt alle gerade bearbeiteten
Listen aller Geräte mit Fortschrittsbalken (x von y geprüft, n.i.O.), Bearbeiter und letzter Änderung;
antippen öffnet sie – fremde freie Listen als Live-Ansicht zum Mitlesen. Abgeschlossene Listen
verschwinden von selbst; Admins können verwaiste Einträge entfernen.

**Archiv.** Alle abgeschlossenen Protokolle aller Geräte, neueste zuerst.
Suche nach Fahrzeug, Monteur, Prüfpunkt oder Bemerkung, Filter nach Kategorie.
Ein Protokoll lässt sich öffnen und erneut drucken.

**Protokolle nachträglich bearbeiten – nur Admins (mit PIN).** Im geöffneten
Protokoll **„✏️ Bearbeiten“**: Kopfdaten, i.O. / n.i.O. / behoben, Bemerkungen
und Monteure ändern → **Speichern**. Kategorie, „abgeschlossen von“ und der
Abschlusszeitpunkt bleiben unverändert. Jede Bearbeitung wird vermerkt
(„zuletzt bearbeitet von … am …“, im Archiv „✎ bearbeitet“). Alle anderen
können abgeschlossene Protokolle nur ansehen und drucken.

**„Nutzer“.** Jedes Gerät wählt einmal, wer es benutzt (unten in der
Seitenleiste, jederzeit änderbar). Im Archiv steht dann, wer ein Protokoll
abgeschlossen hat.

**Admins: SE (M. Seidler) und KÖ (R. Köpcke) – mit PIN.** Nur sie sehen
**„Vorlage bearbeiten“**: Hauptgruppen und Prüfpunkte anlegen, umbenennen,
verschieben (Griff ⠿, auch per Finger), löschen, Gruppen in andere Kategorien
kopieren. Änderungen gelten sofort auf allen Geräten. Nur Admins können
Protokolle aus dem Archiv löschen.

Wer bei „Nutzer“ **SE** oder **KÖ** (🔒) antippt, muss die PIN eingeben.
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

**Werkstattaufträge.** Seitenleiste → *Werkstatt* → **Aufträge**: „+ Neuer
Auftrag“ → Fahrzeug aus dem Fuhrpark wählen (oder frei eintragen). Die Nummer wird
fortlaufend vergeben (`<Fahrzeug-ID>-<JJJJMMTT>-<lfd. Nr.>`, braucht Internet).
Im Auftrag: Status *Offen / In Arbeit / Abgeschlossen*, Km, Std. OW/UW, Datum,
Positionen (Arbeit, Material/Teile, Std., erledigt – **Enter** legt die nächste
Position an) mit Stundensumme, Bemerkungen, ausführende Mitarbeiter. Alles wird
automatisch gespeichert und ist sofort auf allen Geräten sichtbar; Drucken/PDF
über den Knopf oben. Anlegen, bearbeiten und abschließen dürfen alle, **löschen nur Admins**.
**Abgeschlossene Aufträge** sind für alle anderen schreibgeschützt und werden nur
noch von Admins geändert. Ändert ein Admin einen abgeschlossenen Auftrag und ist
danach nicht jede Position erledigt, springt der Status automatisch auf **Offen**.
Im abgeschlossenen Serviceprotokoll legt **„🔧 Auftrag aus offenen Mängeln“** einen
Auftrag mit allen n.i.O.-Punkten (nicht behoben) als Positionen an.

**Fahrzeugakte.** Im Fuhrpark ein Fahrzeug **doppelt antippen**: Kopf mit allen Stammdaten
und Terminen, darunter die Reiter
- **Historie** – alle Werkstattaufträge und abgeschlossenen Servicelisten dieses Fahrzeugs
  (neueste zuerst, antippen öffnet sie; „+ Neuer Auftrag“ legt direkt einen an),
- **Ersatzteile** und **Ölsorten** – Tabellen, die die Admins pflegen,
- **Bilder** (am Handy direkt mit der Kamera), **Dokumente** und **Liebherr-Arbeitsberichte**
  (PDF, Bilder, Word/Excel bis 15 MB) – hochladen dürfen alle, löschen Admins oder wer sie hochgeladen hat,
- **Notizen** – mit Datum und Kürzel.
Dateien liegen in Firestore (in Stücken), es braucht kein kostenpflichtiges Firebase Storage.
„✎ Stammdaten“ (Admins) öffnet das Fahrzeug zum Bearbeiten.

**Fuhrpark aus Excel.** ⚙ Einstellungen → *Daten* → **„Fuhrpark aus Excel ersetzen“**
(nur Admins): die Fahrzeugliste (.xls/.xlsx, Aufbau wie „Fz.-Ident-Nr.“) wählen – Gruppen
(Krane, Ladekrane, Zugmaschinen, BF3, Auflieger, PKW, Stapler) und Spalten werden übernommen,
der bisherige Fuhrpark wird ersetzt. Termine von Fahrzeugen mit gleicher ID bleiben auf Wunsch erhalten.

**Fuhrpark.** Seitenleiste → *Werkstatt* → **Fuhrpark**: alle Fahrzeuge mit
ID, Typ, Kennzeichen, Werk-Nr., Baujahr, FIN, **UVV/HU/SP fällig am** und
**letzter Service**. Fälligkeiten sind markiert (rot = überfällig, gelb = innerhalb
von 30 Tagen). Filter oben: **Prüfung** (SP, HU, UVV, Service – sortiert dann nach
Fälligkeit, früheste zuerst) und **Fälligkeit** (fällig, nur überfällig, nur in 30 Tagen,
ohne Datum). Service gilt 12 Monate nach dem letzten Service als fällig.
Fahrzeug antippen markiert es, doppelt antippen öffnet die Details. Admins schalten mit
dem **Stift ✎** oben das ganze Blatt in den Bearbeitungsmodus: alle Felder sind direkt
änderbar und speichern sich selbst; Stift erneut antippen beendet ihn.
Fahrzeuge anlegen/ändern/löschen nur Admins; alle können ansehen.
Die alte Fahrzeugliste lässt sich über ⚙ → „Daten aus alter Version übernehmen“
einlesen (nur neue Fahrzeuge werden angelegt).
In der Serviceliste schlägt das Feld **ID / Fahrzeug** die Fahrzeuge vor;
Kennzeichen und Werk-Nr. erscheinen darunter und im Ausdruck. Beim
**Abschließen** wird beim Fahrzeug „letzter Service“ eingetragen.

**Lager.** Seitenleiste → *Lager* → **Artikel**: alle Artikel mit Bestand und
Ampel (grün OK · orange = am/unter Mindestbestand · rot = leer), Suche sowie Filter
nach Lagerort und Kategorie. Admins sehen oben die Auswertung (Artikelzahl,
Lagerwert, leer/nachbestellen) – bei „Alle Lagerorte“ für das gesamte Lager, sonst nur
für den gewählten Lagerort (bzw. die Kategorie). Einen Artikel antippen –
darunter klappt ein kleines Buchungsfeld auf (nochmal antippen schließt es):
- **Buchen** (alle): Menge und Verwendungszweck/Auftrags-Nr. eintragen → **+ Zulauf**
  oder **− Entnahme**. Darunter die letzten drei Buchungen. Mehr entnehmen als da ist geht nicht. Jede Buchung steht mit
  Datum und Kürzel in der **Historie**. Buchen braucht Internet, damit zwei
  Geräte nicht gleichzeitig denselben Bestand verbuchen.
- Admins haben im Feld zusätzlich **„✎ Stammdaten & Inventur“**: öffnet den Artikel
  mit voller Historie. **Stammdaten, Lieferanten, Bemerkungen** ändern sowie **Inventur**
  (gezählten Bestand festlegen) und Löschen: nur Admins. Neue Kategorien und
  Lagerorte legen Admins direkt in der Auswahl an („+ Neue …“).

**Status der Aufträge.** 🔴 **Offen** (neu geschrieben) → 🟠 **Abgeschlossen 1/2**
(der Bearbeiter, z. B. PE, ist fertig; ändern geht noch) → 🟢 **Abgeschlossen 2/2** (nur SE/KÖ; danach
gesperrt). Erst bei 2/2 kommen die Servicelisten ins Archiv und in die Fahrzeug-Historie, und es wird
gefragt, ob für offene Mängel (n.i.O., nicht behoben) ein Folgeauftrag angelegt werden soll. In der
Seitenleiste gibt es je Status einen eigenen Filter.

**Serviceliste zum Auftrag.** Im Auftrag **„📋 Serviceliste hinzufügen“**: Die passende Liste
kommt automatisch nach der Fahrzeuggruppe (Krane → Kran, Ladekrane → Ladekran,
Zugmaschinen → LKW, BF3 → BF3, PKW → PKW; sonst wird sie gewählt). Fahrzeug, Km, Stunden,
Datum und Mitarbeiter werden aus dem Auftrag übernommen. Statt „Protokoll abschließen“ heißt der
Knopf dann **„✓ Zum Auftrag hinzufügen“**: Die Liste wird im Auftrag gespeichert (auf allen Geräten
sichtbar) und lässt sich dort jederzeit wieder öffnen und ergänzen. Wird der **Auftrag
abgeschlossen**, kommt die Liste automatisch ins Archiv und in die Historie des Fahrzeugs.

**Senden / Speichern.** Im Auftrag oben **„📤 Senden / Speichern“**: Der Auftrag wird als PDF erstellt
(mit Servicelisten auf eigenen Seiten), auf Wunsch zusammen mit den Anhängen. **Senden** öffnet das
Teilen-Menü des Geräts (WhatsApp, E-Mail, Teams …). **In Ordner speichern** lässt am PC (Chrome/Edge)
einen Ordner wählen und legt die Dateien dort ab; sonst landen sie im Download-Ordner.
(PDF-Erzeugung: jsPDF + jspdf-autotable, MIT, vendor/jspdf – erst bei Bedarf geladen.)

**Anhänge am Auftrag.** Im Auftrag unter *Anhänge* **„📎 Datei / Foto / Video anhängen“**: Fotos und
Videos (am Handy direkt aus der Kamera), PDF, Word, Excel. Bilder werden verkleinert, Videos bis 60 MB,
andere Dateien bis 15 MB. Antippen zeigt Bilder groß, spielt Videos ab bzw. öffnet die Datei. Anhängen
dürfen alle, solange der Auftrag nicht abgeschlossen ist; löschen Admins oder wer angehängt hat.
Speicher: Firestore (1 GB frei) – große Videos zählen voll.

**Material aus dem Werkstattauftrag abbuchen.** Im Auftrag unter *Material aus dem
Lager* → **„+ Aus Lager entnehmen“** → Artikel suchen und antippen → Menge →
**Entnehmen**. Das wird als Entnahme mit der Auftragsnummer gebucht (steht so in der
Lager-Historie) und im Auftrag mit Menge, Datum und Kürzel aufgelistet – auch im
Ausdruck. Direkt bei einer Position geht das über **„+ Lager“** unter *Material / Teile*:
die Entnahme wird dann auch dort eingetragen. Mit ✕ wird die Menge wieder ins Lager zurückgebucht. Bei abgeschlossenen
Aufträgen geht das nur noch für SE und KÖ.

**Lagerorte verwalten (Admins).** Im Feld „Alle Lagerorte“ → **„⚙ Lagerorte verwalten …“**:
umbenennen, löschen (liegen dort noch Artikel, werden sie in einen gewählten Lagerort umgelagert)
oder neu anlegen. Beim Diktieren wird nur aus den angelegten Lagerorten gewählt – auch ungenau
gehörte Namen („Kleingebindeelager“) werden dem richtigen zugeordnet.

**Diktieren.** „+ Artikel“ öffnet ein Fenster mit **🎤 Sprechen**: einen Satz sagen wie
„Bremsenreiniger 500 ml, Artikelnummer BR 500, Kategorie Spraydosen, Lagerort Werkstatt, Einheit Dose,
Mindestbestand 6, Preis 3,50, Lieferant Würth“ – die Felder werden automatisch ausgefüllt (grün) und
lassen sich vor dem Anlegen korrigieren. Erkannte Stichworte: Artikelnummer, EAN/Barcode, Kategorie,
Lagerort, Einheit, Gebinde, Mindestbestand, Preis, Lieferant, Bemerkung. In den Stammdaten haben
Bezeichnung und Bemerkungen ein eigenes 🎤. Nutzt die Spracherkennung des Browsers (Chrome, Safari);
wo es die nicht gibt, hilft die Mikrofon-Taste der Handy-Tastatur.

**Barcode scannen.** In der Artikelliste neben der Suche **📷** antippen und den Barcode vor die
Kamera halten: Beim passenden Artikel klappt sofort das Buchungsfeld auf. Unbekannte Codes können
SE/KÖ direkt einem Artikel zuordnen oder einen neuen Artikel damit anlegen; in den Stammdaten gibt es
das Feld **Barcode / EAN** (mit 📷). Auch beim Entnehmen im Auftrag lässt sich scannen. Erkannt werden
EAN/UPC, Code 128/39/93, ITF, Codabar, QR und DataMatrix – auf Android/Chromebook mit dem eingebauten
Leser, auf dem iPhone mit ZXing (vendor/zxing, Apache-2.0). Ohne Kamera kann der Code eingetippt werden.

**QR-Etiketten.** *Lager* → **„🏷 QR-Etiketten“** (oder im Artikel „🏷 QR-Etikett“): Artikel wählen,
Format (A4-Bogen 3 × 8 à 70 × 37 mm, A4-Bogen 2 × 5 à 105 × 57 mm oder Etikettendrucker 62 × 29 mm),
Anzahl je Artikel und bei angebrochenen Bögen das erste freie Etikett → **Drucken**. Der QR-Code
enthält den Barcode des Artikels bzw. – ohne Barcode – eine eigene Kennung; beim Scannen öffnet
sich der Artikel. (QR-Erzeugung: qrcode-generator, MIT, vendor/qrcode.)

**Bestellvorschläge** (nur SE und KÖ). *Lager* → **Bestellvorschläge**: alle Artikel am oder unter
dem Mindestbestand mit empfohlener Menge (auffüllen auf das Doppelte des
Mindestbestands) und erstem Lieferanten – druckbar als Bestellliste.

**Drucken / PDF.** A4, ohne Kopf-/Fußzeile des Browsers; leere Felder bleiben
leer, abgewählte Punkte erscheinen nicht.

**Startseite.** Beim Öffnen zeigt die App das Logo, bis links ein Bereich gewählt wird
(am Handy über „Menü öffnen“). Ein Klick auf „Krandienst Schulz“ oben in der Seitenleiste
führt jederzeit zurück zur Startseite.

**Zurück.** Am Handy die Zurück-Geste (Wischen vom Rand) bzw. Zurück-Taste, am PC
**Esc** oder die **Zurück-Taste an der Maus**: geht einen Schritt zurück. Ist ein
Fenster offen (Einstellungen, Nutzer, Fahrzeug, Rückfrage …) oder am Handy die
Seitenleiste, wird zuerst dieses geschlossen.

**Nutzer sperren (nur SE und KÖ).** ⚙ Einstellungen → *Nutzer sperren* → Kürzel
antippen → **sperren**. Danach kann niemand dieses Kürzel mehr wählen, und alle Geräte,
die gerade damit angemeldet sind, verlieren sofort den Zugriff und können auch mit dem
Werkstatt-Code nicht erneut beitreten. Bisherige Protokolle, Aufträge und Buchungen
bleiben erhalten. **Entsperren** hebt beides wieder auf. Admin-Kürzel lassen sich nicht
sperren.
> Grenze: Die Anmeldung läuft ohne Passwort. Wer die App-Daten auf seinem Gerät löscht
> und den Werkstatt-Code kennt, könnte als „neues Gerät“ mit einem anderen, nicht
> gesperrten Kürzel beitreten.

**Dunkelmodus.** ⚙ Einstellungen → *Darstellung*: Hell, Dunkel oder Automatisch
(folgt der Geräteeinstellung). Gilt je Gerät; gedruckt wird immer hell.

### Monteure und Admins ändern

In [`data.js`](./data.js) die Liste `MONTEURE` bzw. `ADMINS` anpassen.
Bei `ADMINS` zusätzlich in [`firestore.rules`](./firestore.rules) die Funktionen
`adminCodes()` und `noPinsYet()` anpassen und die Regeln neu veröffentlichen
(Schritt 5 unten).

### Daten der alten Version übernehmen

Die alte Einzeldatei-Version (`Serviceprotokoll….html`) hat ihre Listen im
Speicher des Browsers abgelegt, mit dem sie geöffnet wurde. So kommen sie in die
neue App:

1. Auf dem PC, auf dem die alte Datei benutzt wurde, die neue App öffnen
   → als Admin **⚙ Einstellungen → „Daten aus alter Version übernehmen“** →
   **„Export-Datei herunterladen“** (oder [`tools/KDS-Datenexport.html`](./tools/KDS-Datenexport.html)
   aus dem Repository laden).
2. Die heruntergeladene `KDS-Datenexport.html` im **selben Browser** öffnen
   (Doppelklick, ggf. „Öffnen mit“ → Chrome/Edge). Sie zeigt, was gefunden wurde
   → **„Als Datei speichern“** → `KDS-Altdaten.json`.
3. In der App im selben Fenster die Datei auswählen, Kategorien anhaken
   → **Übernehmen**. Die Vorlagen werden für alle Geräte ersetzt; auf Wunsch
   auch die damals laufenden Eingaben auf dieses Gerät.

Findet die Export-Datei nichts, wurde ein anderer Browser oder Windows-Benutzer
benutzt; die Export-Datei beschreibt einen Ausweg über die Browser-Konsole.

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

### 6b. Optional: Regeln automatisch einspielen

Statt die Regeln nach jeder Änderung von Hand einzufügen, kann GitHub sie bei
jedem Veröffentlichen mit einspielen:

1. Firebase-Konsole → Zahnrad → **Projekteinstellungen** → Reiter
   **Dienstkonten** → **Neuen privaten Schlüssel generieren** → JSON-Datei wird
   heruntergeladen.
2. GitHub → *Settings* → *Secrets and variables* → *Actions* → **New repository
   secret**: Name `FB_SERVICE_ACCOUNT`, Wert = **gesamter Inhalt** der JSON-Datei.
3. Die JSON-Datei danach vom Computer löschen – sie ist ein Generalschlüssel für
   das Firebase-Projekt.

Ohne dieses Secret läuft alles wie bisher (Regeln von Hand, Schritt 5).

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
2. Unten in der Seitenleiste auf das eigene Kürzel („Nutzer“) tippen. Im Fenster
   steht unter **Kollegen einladen** der **Werkstatt-Code**; über **Einladen**
   wird ein Link geteilt (WhatsApp, Mail …).
3. **Weitere Geräte:** Link öffnen → erst das eigene **Kürzel antippen** →
   **Beitreten** (der Code ist schon eingetragen). Ohne Link: Code von Hand
   eingeben – mit oder ohne Leerzeichen, Groß-/Kleinschreibung egal.

**Wichtig:** „Neue Werkstatt anlegen“ nur ein einziges Mal. Jede weitere
Werkstatt wäre ein getrennter Bereich mit eigenem Archiv.

**Gerät in der falschen Werkstatt?** (Werkstatt-Code unter „Nutzer“ ist ein
anderer als auf den übrigen Geräten) → **⚙ Einstellungen → „Andere Werkstatt
beitreten“** → richtigen Code eingeben → Kürzel wählen (Admins mit der PIN dieser
Werkstatt) → **Beitreten**. Die bisherige Werkstatt wird auf dem Gerät verlassen,
ihre Daten bleiben erhalten.

### 9. Auf dem Handy installieren

**Android/Chrome:** Adresse öffnen → Menü (⋮) → **Zum Startbildschirm hinzufügen**.
**iPhone/Safari:** Teilen → **Zum Home-Bildschirm**.

Updates kommen von selbst: Die App prüft beim Öffnen, beim Zurückholen aus dem
Hintergrund und alle 30 Minuten auf eine neue Version und lädt sich dann einmal
neu – nicht mitten in einer Bearbeitung oder bei offenem Dialog, sondern im
nächsten ruhigen Moment. Laufende Eingaben bleiben erhalten. Welche Version läuft, steht unten in der Seitenleiste unter **„Stand:“**
(Datum und Uhrzeit der Veröffentlichung) – damit lässt sich auf jedem Gerät
prüfen, ob ein Update angekommen ist.

### Woran sehe ich, ob alles verbunden ist?

Unten in der Seitenleiste:

| Anzeige | heißt |
|---|---|
| 🟢 **OK** | verbunden, alles übertragen |
| 🟠 **Warnung** · offline – wird später übertragen | kein Netz; alles bleibt auf dem Gerät, bis wieder Verbindung besteht |
| 🟠 **Warnung** · wird übertragen … | Änderungen sind unterwegs |
| 🟠 **Warnung** · Probemodus – nur dieses Gerät | keine Firebase-Werte in dieser Version → Schritt 6 und 7 prüfen |
| 🔴 **Fehler** · … | Speichern fehlgeschlagen/abgelehnt oder Verbindung zur Datenbank gestört |

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
| `…/members/{uid}` | „Nutzer“-Kürzel des Geräts | nur eigenes Gerät schreibt |
| `…/templates/{Kategorie}` | Hauptgruppen und Prüfpunkte | lesen alle, schreiben nur Admins |
| `…/protocols/{id}` | abgeschlossenes Protokoll | anlegen/lesen alle, ändern niemand, löschen nur Admins |

Lokal ausprobieren: `python3 -m http.server` im Ordner, dann `http://localhost:8000`.

Regeln testen (braucht Java für den Emulator):

```bash
cd tests && npm install && npm test
```
