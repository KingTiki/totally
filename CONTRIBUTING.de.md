# Zu totally! beitragen

[English](CONTRIBUTING.md) · [Zurück zur README](README.de.md)

Fehlerberichte, Verbesserungsvorschläge und Pull Requests sind willkommen. Beschreibe bei einem Fehler die erwartete und die tatsächliche Wirkung, die Schritte zum Nachstellen sowie Browser und Installationsart. Sicherheitslücken bitte nach den [Sicherheitshinweisen](SECURITY.de.md) privat melden. Verwende ausschließlich erfundene Daten; private Konfiguration, Datenverzeichnisse, Exporte und Zugangsdaten gehören nicht in Issues oder Commits.

## Lokal entwickeln

Voraussetzungen: Node.js 24 oder neuer und npm. Unter Windows/PowerShell bei Bedarf `npm.cmd` statt `npm` verwenden.

```sh
npm ci
npm run setup
npm run dev
```

Das Setup fragt nach der Adresse der Anwendung, legt eine private Konfiguration an und zeigt das erzeugte Passwort einmalig im Terminal. Eine vorhandene Konfiguration wird nicht überschrieben. Die Anwendung ist standardmäßig unter [http://localhost:3000](http://localhost:3000) erreichbar. Ohne Docker liegen Daten standardmäßig unter `data/`; zum Entwickeln einen getrennten Datenbestand verwenden.

Ein lokaler Produktivlauf startet mit:

```sh
npm run build
npm start
```

Der Produktivstartpunkt ist [server.mjs](server.mjs), der unter anderem die konfigurierte `ORIGIN` anwendet.

## Änderungen prüfen

Für Änderungen an der Anwendung:

```sh
npm run check
npm test
npm run build
npm exec -- playwright install chromium
npm run test:e2e
```

Die Browserprüfungen setzen den Produktivbuild voraus und laufen auf Desktop- und Mobilansichten. Sie starten einen eigenen Server auf `127.0.0.1:4173` mit separaten Daten unter `.test-data/`. Push-Berechtigungen und externer Transport werden simuliert; der SMTP-Fehlertest nutzt einen geschlossenen lokalen Port. Echte E-Mails und Push-Nachrichten werden nicht versandt. Die tatsächliche Push-Anzeige auf einem physischen Gerät muss zusätzlich über die Testnachricht geprüft werden. Screenshots und Fehlertraces landen unter `test-results/`.

Bei Änderungen am Container oder an der Persistenz zusätzlich:

```sh
docker build -t totally:mvp .
npm run test:container
```

Der Container-Smoke-Test verwendet einen eigenen Container und ein eigenes Testvolume und entfernt diese Ressourcen anschließend. Er prüft unter anderem Anmeldung, Origin-Schutz, Schreibrechte und Persistenz nach einem Neustart.

Den README-Screenshot mit erfundenen englischen Beispieldaten nach Build und Chromium-Installation über `npm run docs:screenshot` neu erzeugen. Das Skript verwendet den isolierten Browser-Testserver, keine private `.env` und keine Produktivdaten. Port 4173 muss frei sein.

Mit `npm run format` werden Quellcode, Konfiguration und Dokumentation formatiert. Für reine Dokumentationsänderungen genügen Formatierung und Prüfung der Links sowie der beschriebenen Befehle.

## Orientierung im Code

| Bereich                                    | Inhalt                                                               |
| ------------------------------------------ | -------------------------------------------------------------------- |
| [src/routes/](src/routes/)                 | Seiten, serverseitige Ladevorgänge und Formularaktionen              |
| [src/lib/components/](src/lib/components/) | Wiederverwendbare Oberflächenelemente                                |
| [src/lib/styles.css](src/lib/styles.css)   | Layout, Farben und Darstellung                                       |
| [src/lib/model.ts](src/lib/model.ts)       | Datenmodell und leerer Ausgangsbestand                               |
| [src/lib/server/](src/lib/server/)         | Speicherung, Validierung, Anmeldung, Aktionen und Benachrichtigungen |
| [src/service-worker/](src/service-worker/) | Web-Push-Service-Worker                                              |
| [tests/](tests/)                           | Logik-, Integrations- und Browserprüfungen                           |
| [scripts/](scripts/)                       | Einrichtung und isolierte Testumgebungen                             |

Die Anwendung verwendet SvelteKit, Svelte, TypeScript und Node.js. Formulare speichern über serverseitige Aktionen; das primäre Datenformat ist JSON, Profilfotos liegen als eigene Dateien daneben. Aufbau und Kompatibilität sind unter [Datensicherung](docs/backups.de.md) beschrieben.

Schreibzugriffe laufen serialisiert über den gemeinsamen Dateispeicher: temporäre Datei schreiben, synchronisieren und atomar umbenennen. Genau ein Prozess darf ein Datenverzeichnis verwenden. Nach einem Fehler beim Synchronisieren nach dem Umbenennen sperrt der Store bis zum Neustart, um bereits gespeicherte Änderungen zu schützen. Eine beschädigte Datei darf niemals stillschweigend durch einen leeren Bestand ersetzt werden.

CRM-Bestand und private Push-Daten verwenden getrennte Speicherdateien. Login-Geheimnisse und SMTP-Zugangsdaten gehören ausschließlich in die Umgebung. Der Service Worker hält keine privaten Seiten oder API-Antworten in einem Offline-Cache. Änderungen am Datenmodell müssen bestehende Exporte berücksichtigen; nach Modelländerungen den Entwicklungsserver neu starten, da die Laufzeitinstanz Modulneuladungen überlebt.

## Übersetzungen

Die Sprachkataloge liegen unter [src/lib/i18n/](src/lib/i18n/). Die deutschen Ausgangstexte sind die gemeinsamen, typsicheren Schlüssel; der englische Katalog muss dieselben Schlüssel enthalten. Platzhalter wie `{p0}` werden als benannte Parameter übergeben und ebenfalls typgeprüft. Änderungen an einem Ausgangstext erfordern eine Anpassung beider Kataloge und ihrer Aufrufstellen.

Svelte-Komponenten verwenden `useTranslations()` aus dem Sprachkontext des Layouts. Serverseitige Texte verwenden die anfragebezogene Übersetzungsfunktion; Hintergrunddienste öffnen einen eigenen Sprachkontext mit der gespeicherten Auswahl. Es gibt keine gemeinsam veränderliche globale Sprache. Gemeinsam genutzte Formatierungsfunktionen erhalten die Sprache ausdrücklich. Datumsformatierung und Monats-/Wochentagsnamen bleiben fest im bisherigen deutschen Format; Sprache und Zeitzone sind unabhängig.

Die Sprachwahl liegt in einer eigenen atomar gespeicherten Datei im Datenverzeichnis. Das CRM-Datenmodell und sein Validator bleiben unverändert. Die bestehenden Browserprüfungen setzen ihre isolierte Installation ausdrücklich auf Deutsch; zusätzliche Sprachtests decken Englisch, mehrere Browser und Formulare ohne JavaScript ab.

## Pull Requests und CI

Beschreibe das behobene Problem, das neue Verhalten und die ausgeführten Prüfungen. Bei sichtbaren Änderungen helfen Screenshots mit erfundenen Daten. Halte zusammengehörige Änderungen in einem überschaubaren Pull Request.

Der [GitHub-Actions-Workflow](.github/workflows/ci.yml) führt bei Pushes auf `main`, Pull Requests,
manuellen Läufen und veröffentlichten Releases Typprüfung, Tests, Build und Playwright
aus. Browserberichte werden sieben Tage aufbewahrt. Private Konfiguration ist nicht nötig.

**Docker-Images werden ausschließlich bei veröffentlichten GitHub-Releases nach
erfolgreicher Prüfung gebaut und veröffentlicht.** Branch-Pushes, Tag-Pushes, PRs,
Entwürfe und manuelle Läufe bauen und veröffentlichen keine Images. Prüfung und
Image-Build verwenden jeweils den Release-Tag.

Tags wie `v1.2.3` oder `v1.2.3-rc.1` verwenden: drei numerische Komponenten,
optionales `v`, optionaler Docker-kompatibler Suffix, maximal 128 Zeichen. Tags mit
Suffix müssen als Vorabversion markiert sein. Das Image erhält den exakten Tag unter
`ghcr.io/owner/repository:TAG`. Reguläre Releases aktualisieren zusätzlich `latest`,
Vorabversionen nicht. Auch die Veröffentlichung eines älteren regulären Releases
verschiebt `latest`; für feste Installationen Versions-Tags verwenden.

Images unterstützen derzeit Linux amd64. Veröffentlichte Tags nicht verschieben.
Ein Server-Deployment erfolgt separat. Bei automatisierten Releases beachten:
Ereignisse, die mit `GITHUB_TOKEN` erzeugt werden, lösen keinen weiteren Workflow aus.
Dafür bei Bedarf ein passend berechtigtes GitHub-App-Token oder PAT verwenden.

Englische Dokumentation und ihre `.de.md`-Gegenstücke mit gegenseitigen Sprachlinks
synchron halten. README-Dateien bleiben kurz; Betriebsdetails gehören nach `docs/`.
Beiträge sind auf Deutsch oder Englisch willkommen.

Vor dem ersten öffentlichen Release private Sicherheitsmeldungen in GitHub aktivieren
und das GHCR-Package für anonyme Downloads öffentlich schalten. Details stehen unter
[Installation und Betrieb](docs/deployment.de.md#vorgebautes-image-aus-github-actions).
