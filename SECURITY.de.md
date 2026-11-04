# Sicherheit

[English](SECURITY.md) · [README](README.de.md)

Sicherheitslücken bitte privat über **Security → Report a vulnerability** im
GitHub-Repository melden, sofern verfügbar. Betroffene Version, Auswirkungen und
minimale Schritte zum Nachstellen mit erfundenen Daten angeben. Keine echten
Zugangsdaten, Kontaktexporte oder privaten Logs anhängen.

Falls private Meldungen nicht verfügbar sind, ein Issue mit der Bitte um einen
privaten Meldeweg öffnen, ohne die Schwachstelle oder Exploit-Details offenzulegen.

Korrekturen richten sich an das neueste veröffentlichte Release. Für ältere Versionen
gibt es keine separate Wartungszusage. Release-Hinweise beachten und die Installation
aktualisieren.

Hinweise zum sicheren Betrieb stehen unter [Betrieb](docs/deployment.de.md) und
[Datensicherung](docs/backups.de.md): HTTPS verwenden, Datenverzeichnis und `.env`
schützen und nur einen Prozess pro Datenverzeichnis betreiben. Dateien auf dem
Server werden von der Anwendung nicht verschlüsselt.
