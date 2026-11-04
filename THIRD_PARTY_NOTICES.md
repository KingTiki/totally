# Third-party notices

[Deutsch](THIRD_PARTY_NOTICES.de.md) · [README](README.md)

The project's [MIT license](LICENSE) does not replace the licenses of bundled
third-party components.

## Fonts

Both fonts are hosted locally; no requests to Google Fonts are made at runtime.
The bundled WOFF2 files are Latin subsets distributed through Google Fonts.

| File                                         | Family and copyright                                                                                                                   | License                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `static/fonts/plus-jakarta-sans-latin.woff2` | Plus Jakarta Sans — Copyright 2020 The Plus Jakarta Sans Project Authors ([upstream](https://github.com/tokotype/PlusJakartaSans))     | [SIL OFL 1.1, including copyright](static/fonts/OFL.txt)             |
| `static/fonts/caveat-brush-latin.woff2`      | Caveat Brush — Copyright 2015 Google Inc. All Rights Reserved. ([upstream](https://github.com/google/fonts/tree/main/ofl/caveatbrush)) | [SIL OFL 1.1, including copyright](static/fonts/CaveatBrush-OFL.txt) |

Keep each font's copyright notice and full license when redistributing the font,
including in builds and container images. The build copies the fonts and their
license files to `build/client/fonts/`, served at `/fonts/`. The OFL applies to
the font files; it does not require the application, screenshots or documents
created with them to use the OFL. See the license texts for redistribution and
modification conditions.

## Software dependencies

Dependencies retain their own licenses and notices. Exact versions and license
identifiers are recorded in [package-lock.json](package-lock.json); full notices
are supplied with the installed packages. The runtime image retains production
dependencies and their license files in `node_modules/`.

The build also collects license/notice files and package metadata from installed
dependencies into `build/licenses/`, including build dependencies whose code may
be bundled into the app (such as Svelte and SvelteKit). This directory and its
version/license inventory are included in the runtime image. Keep it when
redistributing the build.
