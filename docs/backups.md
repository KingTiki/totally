# Backups and recovery

[Deutsch](backups.de.md) · [README](../README.md) · [Deployment](deployment.md)

The app stores personal information as readable files. Protect access to the data
folder and external backups. A ZIP export backs up CRM data; a full server backup
also includes private push data, language preferences and configuration.

## Files and exports

With [compose.yaml](../compose.yaml), the data directory lives inside the named
`totally-data` volume, including when using a locally built image. For full server
recovery, back up/restore the volume contents as well as the installation's `.env`.
Copying the installation directory alone does not include a named volume.

`DATA_DIR` contains:

```text
data.json            # people, photo IDs, history, relationships, reminders, settings, email delivery state
preferences.json     # installation language, separate from the CRM export
preferences-backups/ # previous language preference snapshots
photos/              # private JPEGs referenced by current data and snapshots
backups/             # ten previous valid CRM snapshots
push/data.json       # private push keys, device subscriptions and delivery state
push/backups/        # ten previous private push snapshots
```

CRM data uses `schemaVersion: 1` and stable IDs. Credentials, session secret and SMTP
configuration live only in the environment. Email contents and private notes are
part of the data and backups.

**Export:** in **Settings**, select **Download ZIP backup**. The ZIP contains
`data.json` and `photos/<sha256>.jpg` for every currently referenced photo, including
contacts in the trash. It can be restored on an empty installation.
`/export?format=json` exports metadata and photo IDs only; without the matching
photo files it is not a complete photo backup.

**Import:** under **Restore data**, select a ZIP backup or older JSON export up to
100 MiB and confirm replacement. ZIPs may contain up to 10,000 images, 32 MiB JSON
and 128 MiB total uncompressed data. Back up larger datasets through the full data
volume. The app validates expected paths, ZIP checksums, photo format/hash,
completeness, data version and person references. Invalid imports do not replace
existing data. A valid import first saves a snapshot of the old data. Imports also
replace CRM settings and email delivery history, potentially changing delivery
behavior.

Language preferences are stored separately, remain unchanged by CRM imports and
are not included in ZIP exports. Existing push subscriptions and delivery state
also remain unchanged. Losing private push data requires reconnecting devices;
corrupt push keys are not silently replaced. A full folder backup preserves all
these files. A missing preferences file with existing preference backups requires
explicit recovery.

The ten local snapshots help with recent mistakes, but subsequent writes,
including delivery-state updates, rotate them quickly. They do not replace an
external backup. Snapshots referencing `photoId` need the corresponding `photos/`
folder. Save `.env` securely for full server recovery.

## Server recovery

Stop the application before copying or restoring files. Keep the original data
separately. Restore the complete data directory (including photos, preferences,
push keys and snapshots) and the matching private configuration, then start one
app process against it. Back up the stopped data directory for a consistent full
server snapshot.

To recover one selected CRM snapshot while retaining `photos/`:

```sh
docker compose stop app
docker compose run --rm --no-deps app node -e "require('node:fs').copyFileSync('/app/data/backups/YOUR-BACKUP.json','/app/data/data.json')"
docker compose start app
```

Replace `YOUR-BACKUP.json` with an actual snapshot. Alternatively, use the app's
ZIP/JSON restore when the installation still works. Missing `data.json` with
existing backups intentionally causes a startup error; restore a selected backup
explicitly as `data.json`.

Writes are serialized to temporary files, synced and atomically renamed. On Linux,
the containing directory is synced too. Failure after rename locks the store until
restart to prevent overwriting committed data. Check disk and logs before restarting.
Corrupt primary data is never silently replaced with an empty database.

## Password changes

Generate a new scrypt password hash and `SESSION_SECRET`. Run the setup script from
a separate empty directory, for example
`node /absolute/path/to/totally/scripts/setup.mjs`. Copy only `PASSWORD_HASH` and
`SESSION_SECRET` into the existing private `.env`, then recreate the container.
Existing sessions become invalid.

## Data compatibility

Optional fields such as `street`, `houseNumber`, `postalCode`, `photoId` and
`deletedAt`, plus the `topics` list, extend `schemaVersion: 1`. Old exports remain
readable; old app versions may reject newer fields. Keep pre-update backups for
rollbacks. Restart the development server after model changes too.

Topics use `topicId` references from entries; edited entries retain `updatedAt`.
Old files without `topics` are read as an empty topic list and gain it on the next
save. Trashed contacts retain their data and photos, with an optional ISO timestamp
`deletedAt`; restoring removes the marker.

Photos are separate files in current exports. Legacy inline Base64 photos are
migrated by writing images first, then atomically replacing JSON, preserving an
unaltered JSON snapshot. Legacy imports follow the same path. See
[photo retention](usage.md#photos-and-appearance).
