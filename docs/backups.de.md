# Datensicherung und Wiederherstellung

[English](backups.md) · [Zurück zur README](../README.de.md) · [Installation und Betrieb](deployment.de.md)

Die Anwendung speichert persönliche Informationen als lesbare Dateien. Externe Sicherungen und den Zugriff auf das Datenverzeichnis entsprechend schützen. Ein ZIP-Export ist eine CRM-Sicherung; ein vollständiges Server-Backup umfasst zusätzlich Push-Daten und die private Konfiguration.

## Daten, Export und Wiederherstellung

Mit [compose.yaml](../compose.yaml) liegt das Datenverzeichnis im benannten Volume
`totally-data`, auch beim Einsatz eines lokal gebauten Images.
Für eine vollständige Server-Wiederherstellung den Volume-Inhalt und die private
`.env` sichern. Eine Kopie des Installationsverzeichnisses allein enthält das
benannte Volume nicht.

`DATA_DIR` enthält:

```text
data.json          # Personen mit Bild-IDs, Historie, Beziehungen, Erinnerungen, Einstellungen, Versandstatus
preferences.json   # installationsweite Sprache; getrennt vom CRM-Export
preferences-backups/ # vorherige Speicherstände der Sprachwahl
photos/            # private JPEGs; gemeinsam vom aktuellen Bestand und Sicherungen verwendet
backups/           # die letzten zehn gültigen vorherigen Speicherstände
push/data.json     # private Push-Schlüssel, Geräteabonnements und Push-Zustellungen
push/backups/      # die letzten zehn vorherigen privaten Push-Speicherstände
```

Die Datei hat `schemaVersion: 1`; stabile IDs verbinden ihre Einträge. Zugangsdaten, Session-Geheimnis und SMTP-Konfiguration stehen ausschließlich in der Umgebung. E-Mail-Inhalte und private Notizen sind Bestandteil des Datenbestands und der Sicherungen.

Die Sprachwahl wird separat gespeichert und erweitert das CRM-JSON nicht. Sie bleibt bei einem CRM-Import erhalten. Ein vollständiges Datenverzeichnis-Backup sichert sie mit; bei fehlender Einstellungsdatei und vorhandenen Einstellungssicherungen verlangt die App eine ausdrückliche Wiederherstellung.

Laufende Themen stehen in der Liste `topics`, Einträge verweisen optional über `topicId` darauf. Korrigierte Historieneinträge haben zusätzlich `updatedAt`. Themen, Zuordnungen und Bearbeitungszeiten sind im Export und in Sicherungen enthalten. Ältere Dateien ohne `topics` werden als Bestand ohne Themen gelesen; beim nächsten Speichern wird die leere Liste ergänzt. Ein Datenexport aus einer neuen Version setzt beim Wiederherstellen eine Version voraus, die diese Felder kennt. Für einen Rückwechsel vorherige Sicherungen aufbewahren. Nach Modelländerungen auch den lokalen Entwicklungsserver neu starten.

Die ebenfalls versionierte Datei `push/data.json` bleibt privat im Datenvolume. Für eine vollständige Server-Wiederherstellung das ganze Volume einschließlich `photos/` und `push/` sichern. Die ZIP-Sicherung aus der Anwendung enthält den CRM-Bestand, alle aktuell verwendeten Profilfotos und die E-Mail-Historie. Bei Wiederherstellung dieses Exports bleiben bestehende Push-Geräte und deren Zustellstatus unverändert. Gehen die privaten Push-Daten verloren, müssen Geräte neu verbunden werden. Beschädigte Push-Schlüssel werden nicht stillschweigend ersetzt.

Änderungen werden serialisiert, in eine temporäre Datei geschrieben, synchronisiert und anschließend per Rename übernommen. Unter Linux wird auch das betreffende Verzeichnis synchronisiert. Schlägt diese Synchronisierung nach dem Rename fehl, sperrt der Store den Zugriff bis zum Neustart, damit ein alter Speicherstand nicht die bereits ersetzte Datei überschreibt. Datenträger und Logs dann vor dem Neustart prüfen. Eine beschädigte Hauptdatei wird niemals automatisch durch leere Daten ersetzt.

**Export:** Unter Einstellungen **„ZIP-Sicherung herunterladen“**. Die ZIP-Datei enthält `data.json` und `photos/<sha256>.jpg` für alle aktuell referenzierten Bilder. Sie kann auf einer leeren Installation wiederhergestellt werden. `/export?format=json` liefert auf Wunsch nur die Metadaten mit Bild-IDs und ist ohne die passenden Bilddateien keine vollständige Fotosicherung.

**Import:** Unter **„Daten wiederherstellen“** eine ZIP-Sicherung oder einen älteren JSON-Export bis 100 MiB auswählen und das Ersetzen bestätigen. ZIP-Sicherungen dürfen bis zu 10.000 Bilder, 32 MiB JSON und insgesamt 128 MiB entpackte Daten enthalten. Größere Bestände über das vollständige Datenvolume sichern. Die Anwendung akzeptiert nur die erwarteten Dateipfade und prüft ZIP-Prüfsummen, Bildformat, Bild-Hash, Vollständigkeit, Datenversion und Personenverweise. Ungültige Sicherungen ersetzen den bisherigen Bestand nicht. Vor jedem gültigen Import wird der alte Bestand gesichert. Ein Import ersetzt auch App-Einstellungen und Versandhistorie; entsprechend kann sich das Versandverhalten ändern.

Die zehn lokalen Speicherstände helfen gegen jüngere Fehländerungen. Sie ersetzen keine externe Sicherung und sind durch weitere Änderungen einschließlich Versandstatus schnell rotiert. Regelmäßig eine ZIP-Sicherung oder ein externes Volume-Backup sichern. JSON-Speicherstände mit `photoId` benötigen zum Wiederherstellen auch den zugehörigen `photos/`-Ordner. Für ein vollständiges Server-Recovery zusätzlich die `.env` sicher verwahren.

Manuelle Dateiänderungen und Volume-Wiederherstellung ausschließlich bei gestoppter Anwendung vornehmen. Beispiel für die Wiederherstellung einer ausgewählten Sicherung:

```sh
docker compose stop app
docker compose run --rm --no-deps app node -e "require('node:fs').copyFileSync('/app/data/backups/DEINE-SICHERUNG.json','/app/data/data.json')"
docker compose start app
```

Vorher den bisherigen Bestand separat sichern und `photos/` beibehalten. Alternativ die ZIP-/JSON-Wiederherstellung in einer noch funktionsfähigen Anwendung verwenden. Ein fehlendes `data.json` bei vorhandenen Sicherungen führt bewusst zu einem Startfehler; eine Sicherung explizit als `data.json` wiederherstellen.

Ein Passwortwechsel erfolgt durch neues scrypt-Passworthash und neues SESSION_SECRET. Zum Erzeugen neuer Login-Werte kann das Einrichtungsskript in einem separaten leeren Verzeichnis ausgeführt werden: `node /absoluter/pfad/zu/totally/scripts/setup.mjs`. Anschließend nur PASSWORD_HASH und SESSION_SECRET in die bestehende `.env` übernehmen und den Container neu erstellen. Vorhandene Sessions verlieren ihre Gültigkeit.

## Kompatibilität des Datenformats

Das Format bleibt derzeit bei `schemaVersion: 1`. Optionale Felder wie `photoId` und `deletedAt` sowie die Themenliste erweitern es, ohne alte Exporte unlesbar zu machen. Die Rückwärtsrichtung ist nicht garantiert: Ältere App-Versionen können neuere Felder ablehnen.

Fotos sind eigene Dateien, keine eingebetteten Bilddaten in aktuellen JSON-Exporten. Kontakte im Papierkorb bleiben einschließlich ihrer referenzierten Fotos im Export enthalten; die Löschmarkierung steht als optionaler ISO-Zeitstempel `deletedAt` am Kontakt. Wiederherstellen entfernt die Markierung. Details zur Aufbewahrung von Fotos stehen in der [Nutzungsanleitung](usage.de.md#profilfotos-und-darstellung).
