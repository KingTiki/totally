# Hinweise zu Drittanbietern

[English](THIRD_PARTY_NOTICES.md) · [README](README.de.md)

Die [MIT-Lizenz des Projekts](LICENSE) ersetzt nicht die Lizenzen mitgelieferter
Komponenten von Drittanbietern.

## Schriften

Beide Schriften werden lokal ausgeliefert. Zur Laufzeit gibt es keine Anfragen
an Google Fonts. Die WOFF2-Dateien sind über Google Fonts verbreitete lateinische
Teilmengen.

| Datei                                        | Schrift und Copyright                                                                                                                         | Lizenz                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `static/fonts/plus-jakarta-sans-latin.woff2` | Plus Jakarta Sans — Copyright 2020 The Plus Jakarta Sans Project Authors ([Originalprojekt](https://github.com/tokotype/PlusJakartaSans))     | [SIL OFL 1.1 mit Copyright](static/fonts/OFL.txt)             |
| `static/fonts/caveat-brush-latin.woff2`      | Caveat Brush — Copyright 2015 Google Inc. All Rights Reserved. ([Originalprojekt](https://github.com/google/fonts/tree/main/ofl/caveatbrush)) | [SIL OFL 1.1 mit Copyright](static/fonts/CaveatBrush-OFL.txt) |

Bei Weitergabe der Schriften müssen die jeweiligen Copyright-Hinweise und die
vollständige Lizenz enthalten bleiben, auch in Builds und Container-Images.
Der Build kopiert Schriften und Lizenzdateien nach `build/client/fonts/`,
erreichbar unter `/fonts/`. Die OFL gilt für die Schriftdateien; Anwendung,
Screenshots und damit erstellte Dokumente müssen deshalb nicht unter der OFL
stehen. Bedingungen für Weitergabe und Änderungen stehen im jeweiligen Lizenztext.

## Software-Abhängigkeiten

Abhängigkeiten behalten ihre eigenen Lizenzen und Hinweise. Genaue Versionen und
Lizenzkennungen stehen in [package-lock.json](package-lock.json); vollständige
Hinweise liegen den installierten Paketen bei. Das Laufzeit-Image enthält die
Produktivabhängigkeiten samt Lizenzdateien unter `node_modules/`.

Der Build sammelt außerdem Lizenz-/Hinweisdateien und Paket-Metadaten installierter
Abhängigkeiten unter `build/licenses/`, einschließlich Build-Abhängigkeiten, deren
Code in die Anwendung eingehen kann (etwa Svelte und SvelteKit). Das Verzeichnis
mit Versions-/Lizenzübersicht liegt auch im Laufzeit-Image. Bei Weitergabe des Builds
beibehalten.
