# Installation und Betrieb

[English](deployment.md) · [README](../README.de.md) · [Nutzung](usage.de.md) · [Datensicherung](backups.de.md)

[compose.yaml](../compose.yaml) kopieren und wie im [Schnellstart](../README.de.md#schnellstart)
eine private `.env` daneben anlegen. Die Befehle funktionieren unter Linux/macOS
und PowerShell. Für ein Release-Image reicht Docker mit Compose; Git und Node.js
werden auf dem Host nicht benötigt.

## Konfiguration

Notwendige Werte in `.env`:

| Variable         | Zweck                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `ORIGIN`         | Adresse im Browser, z. B. `http://localhost:3000` oder `https://totally.example.org`        |
| `PASSWORD_HASH`  | Der vom Setup erzeugte scrypt-Hash, nicht das Login-Passwort selbst                         |
| `SESSION_SECRET` | Zufälliges Secret für Sitzungen mit mindestens 32 Zeichen; das Setup erzeugt 64 Hex-Zeichen |

Login-Passwort und Konfigurationswerte erzeugen:

```sh
docker run --rm ghcr.io/kingtiki/totally:latest node scripts/setup.mjs --stdout
```

Der Befehl gibt die Konfiguration auf stdout und das Passwort auf stderr aus; er
schreibt keine Datei. Den erzeugten Hash und das Secret in die private `.env`
eintragen und das angezeigte Passwort speichern. Eine Shell-spezifische
Dateiumleitung ist nicht nötig.

Optionale Einstellungen stehen in [`.env.example`](../.env.example):

| Variable          | Zweck                                                                     | Standard                |
| ----------------- | ------------------------------------------------------------------------- | ----------------------- |
| `BIND_ADDRESS`    | Hostadresse des veröffentlichten Ports                                    | `127.0.0.1`             |
| `APP_PORT`        | HTTP-Port auf dem Host; bei Änderungen auch `ORIGIN` anpassen             | `3000`                  |
| `BODY_SIZE_LIMIT` | Maximale HTTP-Anfragegröße einschließlich Uploads                         | `110M`                  |
| `COOKIE_SECURE`   | Optionale Cookie-Einstellung; HTTPS aktiviert sichere Cookies automatisch | Aus `ORIGIN` abgeleitet |
| `SMTP_*`          | Vorhandenes SMTP-Konto für optionale E-Mail                               | Deaktiviert             |

Compose setzt im Container fest `HOST=0.0.0.0`, `PORT=3000` und `DATA_DIR=/app/data`.
Bei einem nativen Node.js-Start lassen sich diese Variablen direkt konfigurieren.
Nach Änderungen an `.env` mit `docker compose up -d` den Container neu erstellen.

Die App läuft als Nutzer `node` (UID 1000). Daten liegen im benannten Volume
`totally-data` mit vorangestelltem Compose-Projektnamen. Installationsverzeichnis
bzw. Projektname beibehalten und Volume-Inhalt sowie `.env` sichern.
`docker compose down -v` löscht das Volume. Bei bestehenden Installationen mit
Hostordner dessen ursprüngliche Einbindung unter `volumes` beibehalten, etwa
`./totally-data:/app/data`. Ein neues benanntes Volume übernimmt keine Daten aus
dem Hostordner. Ein Hostordner muss für UID 1000 schreibbar sein.

**Nur einen Prozess bzw. Container pro Datenverzeichnis betreiben.** Ein lokales
Dateisystem mit atomischem Umbenennen verwenden. Derselbe Node-Prozess führt den
Erinnerungsdienst aus; `/healthz` zeigt nur den Betriebsstatus.

## HTTPS und Reverse Proxy

TLS übernimmt ein vorhandener Reverse Proxy auf deinem Host oder in deiner Infrastruktur. In `.env`:

```dotenv
ORIGIN=https://totally.example.org
COOKIE_SECURE=true
```

`ORIGIN` muss exakt der Adresse im Browser entsprechen: Schema, Host und gegebenenfalls Port, ohne Pfad oder abschließenden Schrägstrich. Pfadpräfixe wie `/crm` werden nicht unterstützt. Der Proxy leitet an den App-Port weiter; sein Upload-Limit sollte mindestens 110 MB betragen. Die App verwendet den fest konfigurierten Origin und muss keine frei gesetzten Forwarded-Header vertrauen.

Beispiel für einen bereits vorhandenen Caddy auf demselben Host:

```caddyfile
totally.example.org {
    reverse_proxy 127.0.0.1:3000
}
```

Ein Proxy in einem anderen Container braucht ein gemeinsames Netzwerk mit der App oder einen anderweitig erreichbaren App-Port; dessen `127.0.0.1` ist nicht der Docker-Host.

## E-Mail zusätzlich einrichten

In `.env` die Zugangsdaten deines bestehenden SMTP-Dienstes eintragen:

```dotenv
SMTP_HOST=smtp.example.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=dein-benutzername
SMTP_PASSWORD=dein-app-passwort
SMTP_FROM=totally@example.org
SMTP_TO=du@example.org
```

Port 587 verwendet verpflichtendes STARTTLS; für direktes TLS üblicherweise Port 465 und `SMTP_SECURE=true` verwenden. Zertifikate werden geprüft. SMTP_USER und SMTP_PASSWORD können für einen authentifizierungsfreien, TLS-gesicherten Relay leer bleiben. Werte mit Leerzeichen oder Sonderzeichen passend für `.env` quotieren, z. B. `SMTP_PASSWORD="mein Wert"`.

Nach Änderungen an der Containerumgebung:

```sh
docker compose up -d --force-recreate app
```

Anschließend unter **Einstellungen** die tägliche Übersicht aktivieren. Standard: 09:00 Uhr, Europe/Berlin. Zeit und IANA-Zeitzone sind änderbar. Ohne konfigurierte SMTP-Verbindung bleibt der Versand ausgeschaltet; Profile und Erinnerungen sind weiterhin nutzbar.

- Der Dienst prüft jede Minute und einmal beim Start. Dafür muss kein Browser geöffnet sein.
- Eine Übersicht enthält die heute fälligen Geburtstage und aktiven Wiedervorlagen, einschließlich überfälliger Wiedervorlagen.
- Ohne fällige Einträge wird keine E-Mail geschickt. Es wird höchstens eine erfolgreiche Übersicht pro lokalem Kalendertag erzeugt. Nachträglich angelegte Einträge erscheinen in der nächsten Übersicht; Geburtstage werden nur am jeweiligen Tag berücksichtigt.
- Erfolgt ein Neustart nach der Versandzeit, wird die heutige Übersicht nachgeholt. Bereits gespeicherte ausstehende oder fehlgeschlagene Zustellungen bleiben erhalten und werden erneut versucht. Für Tage, an denen die App vollständig ausgeschaltet war, werden keine historischen Übersichten neu erzeugt.
- Fehlgeschlagene Zustellungen werden nach 5, 10, 20 usw. Minuten bis zu einem maximalen Abstand von 6 Stunden erneut versucht. Einstellungen zeigen die letzten Ergebnisse und ermöglichen einen manuellen Versuch.
- Eine bereits erstellte fehlgeschlagene E-Mail behält ihren damaligen Inhalt. Änderungen oder erledigte Erinnerungen entfernen den Inhalt einer solchen ausstehenden Nachricht nicht rückwirkend.
- SMTP erlaubt keine zuverlässige Exactly-once-Zustellung: Ein Absturz nach Annahme der E-Mail und vor Speicherung des Erfolgs kann eine doppelte Nachricht verursachen.
- „Erledigt“ schließt eine einmalige Wiedervorlage bzw. das aktuelle Jahresvorkommen ab. Bei Kontaktintervallen startet es einen neuen Zeitraum ab heute. Ein tatsächlicher Kontakt wird nur über „Kontakt festhalten“ eingetragen; dieser setzt den nächsten Kontakttermin anhand des letzten erfassten Kontakts zurück.
- Geburtstage ohne Geburtsjahr sind möglich. Der 29. Februar wird in Nichtschaltjahren am 28. Februar angezeigt.

## Aus dem Quellcode bauen

Für Entwicklung, eigene Änderungen oder vor dem ersten Release das Repository
herunterladen und ein lokales Image bauen:

```sh
docker build -t totally:local .
```

In derselben [compose.yaml](../compose.yaml) `image: totally:local` setzen. Im
obigen Setup-Befehl für die Zugangsdaten `totally:local` verwenden oder die
bestehende `.env` beibehalten. Mit `docker compose up -d --pull never` starten.
Eine zusätzliche Compose-Datei ist nicht nötig; das Datenvolume bleibt gleich.

## Aktualisieren

Vorher eine [vollständige Sicherung](backups.de.md) anlegen. Bei Release-Images den
Tag unter `image:` in `compose.yaml` auf die gewünschte veröffentlichte Version
setzen (oder `:latest` beibehalten), anschließend:

```sh
docker compose pull
docker compose up -d
docker compose logs --tail=100 app
```

Für einen lokalen Build den Checkout aktualisieren, `totally:local` neu bauen und
`docker compose up -d --pull never` ausführen. Ältere App-Versionen können neuere
Datenfelder ablehnen; für einen Rückwechsel eine passende Sicherung aufbewahren.

## Vorgebautes Image aus GitHub Actions

Die [CI](../.github/workflows/ci.yml) baut und veröffentlicht ein **Linux-amd64-Image**
nur bei einem veröffentlichten GitHub-Release nach erfolgreicher Prüfung. Pushes,
PRs, Entwürfe und manuelle CI-Läufe bauen und veröffentlichen keine Images.

Der Image-Name ergibt sich aus dem kleingeschriebenen GitHub-Owner/Repository,
aktuell `ghcr.io/kingtiki/totally`. Ein Release mit Tag `v1.2.3` veröffentlicht
`:v1.2.3` und `:latest`. Eine Vorabversion wie `v1.3.0-rc.1` erhält nur ihren
exakten Tag. Jedes reguläre Release verschiebt `latest`, auch ein älteres. Für feste
Installationen Versions-Tags oder Digests verwenden. Siehe [Release-Regeln](../CONTRIBUTING.de.md#pull-requests-und-ci).

Private GHCR-Packages brauchen eine Anmeldung. Für anonyme Downloads muss das
Package öffentlich sein; ein öffentliches Repository allein garantiert das nicht.

## Probleme eingrenzen

- **403 / Cross-site POST:** `ORIGIN` muss exakt der Browseradresse entsprechen. `localhost`, `127.0.0.1` und ein LAN-Hostname sind verschiedene Adressen. Nach Änderungen den Container neu erstellen.
- **Anmeldung über HTTP klappt nicht:** `COOKIE_SECURE=false` nur für lokale HTTP-Tests verwenden; im HTTPS-Betrieb auf `true` setzen.
- **Datenverzeichnis nicht schreibbar:** Der Container läuft mit UID 1000. Host-Verzeichnis und Berechtigungen prüfen.
- **Import mit Fotos scheitert:** Eine vollständige ZIP-Sicherung mit `data.json` und den passenden Bilddateien verwenden; siehe [Datensicherung](backups.de.md).
- **Keine Push-Nachricht:** HTTPS, Gerätefreigabe und Testnachricht unter [Nutzung](usage.de.md#push-auf-android-iphone-und-computer) prüfen.

Logs: `docker compose logs --tail=100 app`. Bei Fehlermeldungen keine Zugangsdaten oder privaten Kontaktdaten öffentlich posten.
