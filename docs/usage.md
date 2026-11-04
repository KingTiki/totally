# Using totally!

[Deutsch](usage.de.md) · [README](../README.md) · [Deployment](deployment.md) · [Backups](backups.md)

A name is enough to create a person. A note counts as contact only when you choose
**Log contact**. One conversation can link to several people; an optional follow-up
is saved together with the entry.

## Language

In **Settings → Language**, choose **English** or **Deutsch** and save. This applies
to the whole installation on every device, including login and newly generated
emails/push messages. New installations start in English; existing datasets retain
German on their first start after the language update.

Dates, month names and weekdays currently retain German formatting in both
languages. Language does not change the time zone or user-entered names, notes,
tags or reminder titles. Already generated messages keep their original content,
including on retries.

Language is stored separately in `preferences.json`, outside CRM imports/ZIP
exports. Include the full data folder in server backups to preserve it.

## Addresses

Optional **Street, House number, Postcode and City** fields are available when
creating or editing a profile. The address opens Google Maps in a new tab; partial
addresses such as a city alone work too. Search also matches streets and postcodes.
Existing city values are preserved. Address fields are included in exports; see
[data compatibility](backups.md#data-compatibility).

## Contact trash

**Move to trash** in a profile removes the person from the active address book after
confirmation. Under **People → Select contacts**, you can move several visible
contacts at once; selection respects the current search and tag filters.

Open **Settings → Trash** to restore contacts. There is no automatic or permanent
contact deletion: photos, notes, topics and relationships remain. Shared history
stays visible for active people; editing preserves links to trashed contacts.
Reminders involving any trashed person disappear from the agenda, calendar and new
notifications. Their state is preserved; restoring all involved people makes them
eligible again, including overdue reminders. JSON/ZIP backups include the trash
and its photos.

## Photos and appearance

Choose, change or remove a profile photo when creating or editing a person. JPG,
PNG and WebP up to 10 MB are supported. Drag with mouse/touch and use the zoom
slider, then **Apply crop**. Keyboard users can focus the preview and use arrow
keys (Shift for larger steps). Reset centers the image; cancel keeps the previous
photo. Apply or cancel the crop before saving the profile.

**Adjust crop** also works on existing photos. Only the crop is saved, resized to
384 × 384 pixels without original metadata such as location. To recover a larger
area, select the original image again. Photos appear in profiles, lists, search and
linked people.

Stored JPEGs are at most 96 KiB in `DATA_DIR/photos/<sha256>.jpg`; JSON holds a
`photoId`. Identical images are stored once. Note edits do not rewrite images.
Photos require authentication; the private browser cache checks the session before
reuse, and ETags avoid retransmitting unchanged images. Legacy inline-photo
migration is described in [backups](backups.md#data-compatibility).

Replaced/removed photos remain while referenced by current data or one of the ten
local CRM snapshots. Unreferenced files are collected after snapshot rotation.
Unreadable/corrupt snapshots prevent cleanup. Missing or corrupt current photos
cause startup failure to avoid unnoticed data loss.

Use the sun/moon button for **Light/Dark**. **Settings → Appearance → System** follows
the device and is the default. The selection is stored per browser, applies to
login and is set before first render. It is independent of exported CRM settings.

## Tags and dialogs

The profile form offers existing tags from all people. Filter and select them in
**Tags**; selected tags are removable chips. Add new tags with Enter or comma;
unconfirmed text is included when saving. Case-insensitive matches reuse an existing
spelling (for example `friends` becomes `Friends` if already present). Up to 30 tags
of 60 characters each are supported. Existing records are not renamed automatically;
normalization applies when saving a profile.

Close dialogs with Escape, an outside click/tap or the close button. Unsaved changes
trigger a browser confirmation; cancelling preserves all inputs, including tags and
pending photo crops. Unchanged/reset dialogs close directly. Successful saves do
not require another confirmation.

## Topics and history

Under **Ongoing topics → Add topic** in a profile, record a title and optional
description, such as a house move or course. **Add entry** links notes or contacts
to the topic. Expand a topic to see developments; entries also remain in **Your
shared history**. Quick capture offers suitable topics after selecting people.

Edit, complete or reopen topics. Completed topics retain their entries. New entries
are assigned to active topics; existing entries on completed topics remain editable.

History entries can be edited: text, date, kind, contact type, people and topic.
IDs and original creation times are preserved, with an edited marker. A shared entry
is one record, so changes apply to all linked profiles. Existing follow-ups remain
independent and are neither changed nor recreated by editing an entry.

**Delete** removes a note/contact after confirmation, including from expanded topic
history. For shared entries the prompt names the number of affected people; deletion
removes the entry from all linked profiles and topics. Topics and follow-ups remain.
Deleting the latest contact recalculates schedules using the remaining latest
contact or the schedule's creation date. Stale entries from another tab must be
reloaded before deletion.

Text-only corrections do not affect contact schedules. Changing the latest contact's
date, kind or people recalculates affected schedules. Paused schedules stay paused;
without any contact, the schedule's creation date becomes the baseline. Conflicting
edits from another tab are rejected with a message while preserving your form input.

## Personal contact schedules

Each profile has a **Keep in touch** card. Set/change an interval, pause, resume or
turn it off. Presets are two, four, eight or twelve weeks; custom intervals range
from 1 to 3650 days. No schedule is active until you create it.

The next date follows the latest **Log contact** entry. Notes do not reset it.
Shared contacts reset every linked person's schedule; paused schedules stay paused.
With no previous contact, the first interval starts at setup. Changing the interval
preserves the current interval's start, including after **Done**. Keeping the same
interval preserves a snoozed date; changing the interval recalculates it.

The card shows the next date or overdue status. Due reminders appear in the overview,
calendar and configured daily push/email digest. Pausing suppresses reminders;
resuming retains the existing date, which may now be overdue.

Older intervals created through **Reminder → Keep in touch regularly** also appear
in the card. New duplicate schedules are prevented. If old data contains several,
the card warns you: saving/resuming consolidates them into one, retaining old
records as completed. Turning off a schedule also preserves history and reminder
records. No JSON schema version change is required.

## Push on phones and computers

Set up push under **Settings → Push on your devices**. Keys are generated on first
startup; no additional provider account or container is needed.

1. Open the app's **HTTPS URL** on the device.
2. Enter a device name and choose **Enable on this device**.
3. Allow browser/system notifications, then send a test notification.
4. Save the daily time and time zone under the reminder schedule (default 09:00, Europe/Berlin). The email checkbox is not required for push.

**iPhone/iPad:** requires iOS/iPadOS 16.4+. Open in Safari, choose **Share → Add to
Home Screen**, then launch that icon and enable notifications there. Android and
desktop need a current Web Push browser; home-screen installation is optional.

Localhost/loopback HTTP also works on the development computer. A plain HTTP LAN
address such as `http://192.168...` is insufficient on a phone. The app provides
hints for missing HTTPS, blocked permissions and iPhone setup.

Connect each device separately. Disconnect individual devices in Settings even when
you no longer have them. Push-service responses 404/410 remove expired subscriptions;
re-enable on the device. Logging out ends the app session but does not revoke push
permission/subscriptions.

Daily notifications contain **only a count** and open the app when tapped. Names,
conversation notes and details stay off the lock screen. The service worker does not
cache private pages/API responses offline. ZIP exports exclude private push keys and
subscriptions. Encrypted delivery uses the browser/OS push infrastructure, requiring
outgoing HTTPS and no incoming webhook.

A successful delivery log means **handed to the push service**, not necessarily
shown on screen. Device connectivity, system settings and focus/do-not-disturb modes
affect display. Verify a test message on real devices. Temporary failures retry after
5, 10, 20, etc. minutes, capped at 6 hours, surviving restarts. A crash between service
acceptance and success recording can cause duplicates.

At most one daily digest is generated per connected device, with no empty messages.
A first due item added after the scheduled time is included at the next minute check
if no digest exists yet. Additional items after a digest wait for the next one. New
devices/subscriptions can receive their own digest. **Check today's digest now** checks
push and optional email without recreating an existing daily digest. Test messages
are independent, with at least 30 seconds between them per device.

For SMTP configuration, see [deployment](deployment.md#optional-email).
