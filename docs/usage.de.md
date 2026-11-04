# totally! nutzen

[English](usage.md) · [Zurück zur README](../README.de.md) · [Installation und Betrieb](deployment.de.md) · [Datensicherung](backups.de.md)

Zum Anlegen einer Person genügt ein Name. Eine Notiz wird nur dann als Kontakt gezählt, wenn du ausdrücklich **„Kontakt festhalten“** auswählst. Ein Gespräch kann mehreren Personen zugeordnet werden; eine optionale Wiedervorlage wird zusammen mit dem Eintrag gespeichert.

## Sprache

Unter **Settings → Language** bzw. **Einstellungen → Sprache** zwischen **English** und **Deutsch** wählen und speichern. Die Auswahl gilt für die gesamte Installation auf allen Geräten, einschließlich der Anmeldung und neu erzeugter E-Mails und Push-Nachrichten. Neue Installationen beginnen auf Englisch; vorhandene Datenbestände behalten beim ersten Start nach dem Update Deutsch.

Datumsanzeigen behalten in beiden Sprachen das bisherige deutsche Format, einschließlich der Monats- und Wochentagsnamen. Die Sprache verändert weder die Zeitzone noch gespeicherte Namen, Notizen, Tags oder Erinnerungstitel. Bereits erzeugte Nachrichten behalten auch bei erneuten Zustellversuchen ihren ursprünglichen Inhalt.

Die Sprachwahl liegt separat in `preferences.json` im Datenverzeichnis. CRM-Importe verändern sie nicht; der ZIP-Export enthält sie nicht. Für eine vollständige Server-Sicherung das ganze Datenverzeichnis einschließlich dieser Datei aufbewahren.

## Adressen im Profil

Beim Anlegen und unter **„Profil bearbeiten“** stehen optionale Felder für **Straße, Hausnummer, PLZ und Ort** zur Verfügung. Die Adresse erscheint im Profil als mehrzeiliger Link und öffnet Google Maps in einem neuen Tab. Auch unvollständige Adressen, etwa nur ein Ort, sind möglich. Die Personensuche findet ebenfalls Straßen und Postleitzahlen.

Bestehende Orte bleiben erhalten. Straße, Hausnummer und PLZ werden in den optionalen Personenfeldern `street`, `houseNumber` und `postalCode` gespeichert; `location` enthält weiterhin den Ort. Die Felder sind in JSON-Exporten und Sicherungen enthalten. Alte Daten ohne diese Felder bleiben lesbar, `schemaVersion` bleibt 1. Neue Exporte mit Adressen benötigen beim Import eine Anwendungsversion, die diese Felder unterstützt.

## Kontakte löschen und wiederherstellen

Im Personenprofil verschiebt **„In den Papierkorb“** den Kontakt nach Bestätigung aus dem aktiven Adressbuch. Unter **Personen → Kontakte auswählen** lassen sich mehrere angezeigte Kontakte gemeinsam verschieben. Die Auswahl zum Löschen berücksichtigt nur Kontakte, die unter dem aktuellen Such- und Tagfilter sichtbar sind.

Der **Papierkorb** ist über **Einstellungen → Papierkorb** erreichbar und hat keinen eigenen Eintrag im Hauptmenü. Dort lassen sich Kontakte wiederherstellen. Es gibt keine automatische oder endgültige Löschung: Fotos, Notizen, Themen und Verbindungen bleiben erhalten. Gemeinsame Historieneinträge bleiben bei anderen aktiven Personen sichtbar; eine Bearbeitung erhält ihre Zuordnung zu Kontakten im Papierkorb. Erinnerungen mit mindestens einem Kontakt im Papierkorb erscheinen nicht in Kalender, Agenda oder neu erzeugten Benachrichtigungen. Sie behalten ihren Zustand und werden nach Wiederherstellung aller beteiligten Kontakte wieder berücksichtigt, auch wenn ihr Termin inzwischen überfällig ist.

Die JSON-Struktur bleibt bei `schemaVersion: 1`. Nur Kontakte im Papierkorb tragen das optionale Feld `deletedAt` als ISO-Zeitstempel; Wiederherstellen entfernt dieses Feld. Alte Dateien ohne Markierung bleiben unverändert lesbar und importierbar. JSON- und ZIP-Sicherungen enthalten auch den Papierkorb und seine Bilder. Exporte mit `deletedAt` benötigen zum Einlesen diese oder eine neuere App-Version, da ältere Versionen unbekannte Personenfelder ablehnen. Nach dem Update die Anwendung neu starten.

## Profilfotos und Darstellung

Beim Anlegen und unter **„Profil bearbeiten“** kannst du ein Foto auswählen, ändern oder entfernen. Unterstützt werden JPG, PNG und WebP bis 10 MB. In der Vorschau das Bild mit Maus oder Finger verschieben, mit dem Zoom-Regler vergrößern und **„Ausschnitt übernehmen“** wählen. Alternativ das Vorschaubild fokussieren und mit den Pfeiltasten verschieben; Umschalt vergrößert die Schritte. „Zurücksetzen“ stellt die mittige Ansicht wieder her, „Abbrechen“ behält das bisherige Foto. Das Profil lässt sich speichern, sobald du den Ausschnitt übernommen oder abgebrochen hast.

**„Ausschnitt anpassen“** öffnet den Editor auch für vorhandene Fotos. Gespeichert wird nur der gewählte Ausschnitt, verkleinert auf 384 × 384 Pixel und ohne Originalmetadaten wie Standortinformationen. Für einen größeren Ausschnitt eines bereits gespeicherten Fotos das Original erneut auswählen. Fotos erscheinen im Profil, in Personenlisten, der Suche und bei verknüpften Personen.

Das kleine JPEG umfasst höchstens 96 KiB und liegt unter `DATA_DIR/photos/<sha256>.jpg`. In `data.json` steht nur das optionale Personenfeld `photoId`. Identische Bilder werden einmal gespeichert, und Änderungen an Notizen schreiben die Bilder nicht erneut. Fotos werden ausschließlich nach Anmeldung ausgeliefert. Der private Browsercache prüft die Sitzung vor jeder Wiederverwendung; unveränderte Fotos können mit ETag ohne erneute Bildübertragung bestätigt werden.

Beim ersten Serverstart mit dieser Version werden bisher eingebettete Base64-Fotos automatisch ausgelagert. Zuerst werden die Bilddateien vollständig geschrieben, anschließend wird das JSON atomar ersetzt; vorher bleibt eine unveränderte JSON-Sicherung erhalten. Auch ältere JSON-Importe mit `photo` werden so umgestellt. Neue Speicherstände bleiben bei `schemaVersion: 1`, benötigen wegen `photoId` aber diese oder eine neuere Anwendungsversion. Vor einem Versionswechsel einen vollständigen Export oder eine externe Sicherung aufbewahren und den Entwicklungsserver nach dem Update neu starten.

Entfernte oder ersetzte Fotos bleiben erhalten, solange der aktuelle Bestand oder eine der zehn lokalen JSON-Sicherungen darauf verweist. Erst nach deren Rotation werden nicht mehr benötigte Bilddateien aufgeräumt. Bei einer beschädigten oder unlesbaren Sicherung wird das Aufräumen ausgelassen. Fehlende oder beschädigte aktuelle Bilddateien führen zu einem Startfehler, damit Datenverluste nicht unbemerkt bleiben.

Oben rechts schaltet das Sonnen-/Mondsymbol zwischen **Hell** und **Dunkel** um. Unter **Einstellungen → Darstellung** steht zusätzlich **„Wie das Gerät“** zur Auswahl. Das ist die Voreinstellung und folgt dem Farbschema des Betriebssystems. Die Auswahl wird pro Browser lokal gespeichert, gilt auch für die Anmeldeseite und wird vor der ersten Darstellung angewendet. Sie ist unabhängig von den exportierten CRM-Einstellungen.

## Tags wiederverwenden

Das Profilformular zeigt vorhandene Tags aus allen Personen zur Auswahl. Über das Feld **„Tags“** kannst du sie filtern und anklicken. Gewählte Tags erscheinen als einzeln entfernbare Chips. Neue Tags mit Enter oder Komma hinzufügen; noch nicht bestätigter Text wird beim Speichern ebenfalls übernommen. Die App verwendet bei gleicher Schreibweise unabhängig von Groß-/Kleinschreibung den vorhandenen Tag: `freunde` wird zu `Freunde`, wenn dieser bereits existiert. Maximal 30 Tags mit jeweils 60 Zeichen sind möglich. Bestehende Daten werden durch das Update nicht umbenannt; die Vereinheitlichung gilt beim Speichern eines Profils.

Dialoge schließen per Escape, Außenklick/-tippen oder Schließen-Button. Bei ungespeicherten Änderungen fragt der Browser vor dem Verwerfen nach; Abbrechen erhält alle Eingaben. Das gilt auch für Tag-Auswahl und noch nicht übernommene Fotoausschnitte. Ohne Änderungen oder nach vollständigem Zurücksetzen schließt der Dialog direkt. Erfolgreiches Speichern benötigt keine zusätzliche Bestätigung.

## Laufende Themen und bearbeitbare Historie

Im Personenprofil unter **„Laufende Themen → Thema hinzufügen“** einen Titel und optional eine Beschreibung festhalten, etwa eine Wohnungssuche oder Weiterbildung. Über **„Eintrag ergänzen“** entstehen zugeordnete Notizen oder Kontakte. Die Entwicklungen sind beim Thema aufklappbar und bleiben zusätzlich unter „Eure Geschichte“ sichtbar. Auch in der schnellen Erfassung lässt sich nach Auswahl der Personen ein passendes Thema auswählen.

Themen lassen sich bearbeiten, abschließen und wieder öffnen. Abgeschlossene Themen bleiben samt Einträgen erhalten. Neue Einträge werden aktiven Themen zugeordnet; bestehende Einträge an einem abgeschlossenen Thema können weiterhin korrigiert werden.

Jeder Eintrag unter **„Eure Geschichte“** hat eine Bearbeiten-Aktion. Text, Datum, Typ, Kontaktart, zugeordnete Personen und Thema sind änderbar. ID und ursprünglicher Erstellungszeitpunkt bleiben erhalten, die Bearbeitung wird gekennzeichnet. Ein gemeinsamer Eintrag ist ein Datensatz: Änderungen gelten in allen zugeordneten Personenprofilen. Bereits angelegte Wiedervorlagen bleiben eigenständige Erinnerungen und werden durch eine Eintragskorrektur nicht verändert oder erneut angelegt.

Über **„Löschen“** lassen sich Notizen und Kontakte nach einer Sicherheitsrückfrage entfernen, auch im aufgeklappten Themenverlauf. Abbrechen erhält den Eintrag. Bei gemeinsamen Einträgen nennt die Rückfrage die Anzahl der betroffenen Personen; das bestätigte Löschen entfernt den Eintrag aus allen verknüpften Profilen und Themenverläufen. Themen und bereits angelegte Wiedervorlagen bleiben erhalten. Wird der letzte Kontakt gelöscht, wird der Kontaktrhythmus anhand des verbleibenden letzten Kontakts oder seines Einrichtungsdatums neu berechnet. Veraltete Einträge aus einem anderen Tab müssen vor dem Löschen neu geladen werden.

Reine Textkorrekturen ändern den Kontaktrhythmus nicht. Ändert sich durch eine Korrektur der letzte tatsächliche Kontakt – etwa Datum, Typ oder Personenzuordnung –, berechnet die App die betroffenen Rhythmen neu. Pausierte Rhythmen bleiben pausiert. Gibt es danach keinen Kontakt mehr, dient der Einrichtungszeitpunkt des Rhythmus als Ausgangspunkt. Wurde derselbe Eintrag oder dasselbe Thema inzwischen in einem anderen Tab geändert, wird ein veralteter Bearbeitungsstand mit einer Meldung abgewiesen; die eigenen Eingaben bleiben im Formular stehen.

## Kontaktrhythmus pro Person

Jedes Personenprofil hat eine eigene Karte **„Kontaktrhythmus“**. Dort lässt sich der gewünschte Abstand festlegen, ändern, pausieren, fortsetzen oder ausschalten. Vorlagen: alle zwei, vier, acht oder zwölf Wochen; eigene Abstände von 1 bis 3650 Tagen sind möglich. Ohne ausdrückliche Einrichtung ist kein Rhythmus aktiv.

Der nächste Termin richtet sich nach dem letzten über **„Kontakt festhalten“** erfassten Kontakt. Eine normale Notiz verändert ihn nicht. Ein gemeinsamer Kontakt setzt die Rhythmen aller zugeordneten Personen zurück; pausierte Rhythmen bleiben dabei pausiert. Ohne bisherigen Kontakt beginnt der erste Zeitraum beim Einrichten. Eine Änderung des Abstands behält den Beginn des laufenden Zeitraums bei, auch wenn dieser zuvor über „Erledigt“ neu gestartet wurde. Eine bereits verschobene Erinnerung bleibt bei unverändertem Abstand erhalten; bei geändertem Abstand wird der Termin neu berechnet.

Die Karte zeigt den nächsten Termin oder einen überfälligen Status. Fällige Kontakt-Erinnerungen erscheinen in „Demnächst“, im Kalender und in der eingerichteten täglichen Push-/E-Mail-Übersicht. Pausieren unterbricht die Erinnerungen; Fortsetzen behält den bestehenden Termin, der inzwischen überfällig sein kann.

Bereits über **„Erinnerung → Regelmäßig Kontakt halten“** angelegte Intervalle erscheinen ebenfalls in der Profilkarte. Neue doppelte Intervalle werden verhindert. Falls ältere Daten mehrere Intervalle für eine Person enthalten, weist die Karte darauf hin: Speichern oder Fortsetzen führt sie zu einem Rhythmus zusammen. Die alten Einträge bleiben beendet im JSON-Datenbestand erhalten. Auch Ausschalten löscht keine Gesprächshistorie oder Erinnerungseinträge. Eine Änderung der JSON-Dateiversion ist nicht erforderlich.

## Push auf Android, iPhone und Computer

Push wird in totally! unter **Einstellungen → Push auf deinen Geräten** eingerichtet. Schlüssel erzeugt die Anwendung beim ersten Start automatisch. Ein zusätzliches Anbieterkonto und weitere Container werden nicht benötigt.

1. Die App auf dem Gerät über ihre **HTTPS-Adresse** öffnen.
2. Einen Gerätenamen eingeben und **„Auf diesem Gerät aktivieren“** anklicken.
3. Die Browser-/Systemfreigabe erlauben und anschließend **„Testnachricht senden“** auswählen.
4. Unter **„Dein Erinnerungsrhythmus“** die tägliche Uhrzeit und Zeitzone speichern. Standard: 09:00 Uhr, Europe/Berlin. Die E-Mail-Checkbox ist für Push nicht erforderlich.

**iPhone und iPad:** Mindestens iOS/iPadOS 16.4. Die Seite in Safari öffnen, über **Teilen → Zum Home-Bildschirm** hinzufügen und totally! über dieses Symbol starten. Erst dort Benachrichtigungen aktivieren. Android und Desktop benötigen einen aktuellen Browser mit Web-Push-Unterstützung; die Installation zum Home-Bildschirm ist dort optional.

Auf dem Entwicklungscomputer funktioniert auch `http://localhost` bzw. die Loopback-Adresse. Eine unverschlüsselte LAN-Adresse wie `http://192.168...` reicht auf dem Handy nicht. Die App zeigt für fehlendes HTTPS, blockierte Berechtigungen und die iPhone-Einrichtung konkrete Hinweise.

Jedes Gerät wird separat verbunden. Unter Einstellungen können Geräte einzeln getrennt werden, auch wenn du das betreffende Gerät nicht zur Hand hast. Wird eine Gerätefreigabe vom Push-Dienst als abgelaufen gemeldet (HTTP 404/410), entfernt totally! sie automatisch; die Freigabe auf dem Gerät dann erneut aktivieren. Ein Logout beendet die App-Sitzung, nicht die separat erteilte Push-Freigabe.

Die tägliche Nachricht enthält **nur die Anzahl** fälliger Einträge und öffnet beim Antippen die App. Namen, Gesprächsnotizen und Details erscheinen nicht auf dem Sperrbildschirm. Der Service Worker speichert keine privaten Seiten oder API-Antworten offline. Der ZIP-Export enthält weder private Push-Schlüssel noch Geräteabonnements. Die verschlüsselte Zustellung nutzt die Push-Infrastruktur des Browsers bzw. Betriebssystems; totally! benötigt ausgehendes HTTPS zu diesen Diensten und keinen eingehenden Webhook.

Eine erfolgreiche Zustellung im Protokoll bedeutet **„An Push-Dienst übergeben“**, nicht, dass die Nachricht bereits auf dem Bildschirm erschien. Systemeinstellungen, Fokus-/Nicht-stören-Modi und die Geräteverbindung beeinflussen die Anzeige. Auf echten Geräten die Testnachricht prüfen. Vorübergehende Fehler werden nach 5, 10, 20 usw. Minuten bis maximal 6 Stunden erneut versucht; der Zustand bleibt über Neustarts erhalten. Nach einem Absturz zwischen Annahme und Erfolgsbestätigung sind doppelte Zustellungen möglich.

Pro verbundenem Gerät wird höchstens eine Tagesübersicht erzeugt. Ohne fällige Einträge wird nichts gesendet. Wird nach der Versandzeit erstmals ein fälliger Eintrag angelegt und ist heute noch keine Push-Übersicht erstellt worden, berücksichtigt der nächste Minutenlauf diesen Eintrag. Nach bereits erfolgtem Versand erscheinen zusätzliche Einträge in der nächsten Übersicht. Eine neue Freigabe oder ein neues Gerät kann eine eigene Übersicht erhalten. **„Heutige Übersicht jetzt prüfen“** prüft sowohl Push als auch optional E-Mail, ohne eine bereits erstellte Tagesübersicht erneut zu erzeugen. Testnachrichten sind unabhängig davon, mit mindestens 30 Sekunden Abstand pro Gerät.

Die serverseitige SMTP-Einrichtung ist unter [Installation und Betrieb](deployment.de.md#e-mail-zusätzlich-einrichten) beschrieben.
