import { test, expect, type Page } from '@playwright/test';
import { authenticate } from './helpers.ts';
import { fileURLToPath } from 'node:url';

async function confirmClose(page: Page, action: () => Promise<unknown>, discard: boolean) {
  const asked = page.waitForEvent('dialog');
  const pending = action();
  const confirmation = await asked;
  expect(confirmation.type()).toBe('confirm');
  expect(confirmation.message()).toContain('ungespeicherte Änderungen');
  if (discard) await confirmation.accept();
  else await confirmation.dismiss();
  await pending;
}

async function outsideClick(page: Page, touch: boolean) {
  // All dialogs keep a margin to the viewport, including on mobile.
  const y = page.viewportSize()!.height / 2;
  if (touch) await page.touchscreen.tap(4, y);
  else await page.mouse.click(4, y);
}

test('calendar dialog closes on backdrop or Escape, keeps interior clicks and discards unsaved input', async ({
  page,
  isMobile
}) => {
  await authenticate(page);
  await page.goto('/kalender');
  const open = page.getByRole('button', { name: 'Erinnerung anlegen', exact: true }).first();
  const dialog = page.getByRole('dialog', { name: 'Erinnerung anlegen', exact: true });
  await open.click();
  const title = dialog.getByLabel('Woran möchtest du denken?');
  await title.fill('Nicht gespeicherter Termin');
  const bounds = (await dialog.boundingBox())!;
  await page.mouse.click(bounds.x + 7, bounds.y + 7);
  await expect(dialog).toBeVisible();
  await title.click();
  await expect(dialog).toBeVisible();
  await confirmClose(page, () => outsideClick(page, isMobile), true);
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  await open.click();
  await expect(title).toHaveValue('');
  await title.fill('Auch nicht speichern');
  await confirmClose(page, () => title.press('Escape'), true);
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  const db = await (await page.request.get('/export?format=json')).json();
  expect(
    db.reminders.some(
      (item: { title: string }) =>
        item.title.includes('Nicht gespeicherter') || item.title === 'Auch nicht speichern'
    )
  ).toBe(false);
});

test('profile dialog closes consistently while dragging from inside to outside keeps it open', async ({
  page,
  isMobile
}, info) => {
  await authenticate(page);
  await page.goto('/personen');
  await page.getByRole('button', { name: 'Person hinzufügen', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Person hinzufügen', exact: true });
  const name = `Dialog ${info.project.name}`;
  await create.getByLabel('Name', { exact: true }).fill(name);
  await create.getByRole('button', { name: 'Person anlegen', exact: true }).click();
  const open = page.getByRole('button', { name: 'Profil bearbeiten', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Profil bearbeiten', exact: true });
  await open.click();
  await dialog.getByLabel('Name', { exact: true }).fill('Verworfen');
  await confirmClose(page, () => dialog.getByLabel('Name', { exact: true }).press('Escape'), true);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await open.click();
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue(name);
  const heading = (await dialog
    .getByRole('heading', { name: 'Profil bearbeiten', exact: true })
    .boundingBox())!;
  await page.mouse.move(heading.x + 10, heading.y + 10);
  await page.mouse.down();
  await page.mouse.move(4, heading.y + 10, { steps: 4 });
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  await outsideClick(page, isMobile);
  await expect(dialog).toHaveCount(0);
  await open.click();
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Kontakt festhalten', exact: true }).click();
  const contact = page.getByRole('dialog', { name: 'Kontakt festhalten', exact: true });
  await expect(
    contact.getByRole('radio', { name: 'Kontakt festhalten', exact: true })
  ).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(contact).toHaveCount(0);
});

test('Escape closes from the close button and directly dispatched keys; confirmation can be cancelled and reverted edits need none', async ({
  page
}) => {
  await authenticate(page);
  await page.goto('/kalender');
  const open = page.getByRole('button', { name: 'Erinnerung anlegen', exact: true }).first();
  const dialog = page.getByRole('dialog', { name: 'Erinnerung anlegen', exact: true });
  await open.click();
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await open.click();
  const title = dialog.getByLabel('Woran möchtest du denken?');
  // Dispatched key events have no browser-native cancel action. Our explicit
  // capture handler must still close, even if a child stops bubbling the key.
  await title.evaluate((element) => {
    element.addEventListener('keydown', (event) => event.stopPropagation(), { once: true });
    element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );
  });
  await expect(dialog).toHaveCount(0);
  await open.click();
  await title.fill('Bitte behalten');
  await confirmClose(page, () => title.press('Escape'), false);
  await expect(dialog).toBeVisible();
  await expect(title).toHaveValue('Bitte behalten');
  await title.fill('');
  await title.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
});

test('discard guard notices tag buttons and unfinished photo edits; save and restoring the original stay prompt-free', async ({
  page,
  isMobile
}, info) => {
  await authenticate(page);
  await page.goto('/personen');
  await page.getByRole('button', { name: 'Person hinzufügen', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Person hinzufügen', exact: true });
  await create.getByLabel('Name', { exact: true }).fill(`Schutz ${info.project.name}`);
  await create.getByRole('textbox', { name: 'Tags', exact: true }).fill('Dialogtag');
  await create.getByRole('button', { name: 'Person anlegen', exact: true }).click();
  const open = page.getByRole('button', { name: 'Profil bearbeiten', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Profil bearbeiten', exact: true });
  await open.click();
  await dialog.getByRole('button', { name: 'Tag Dialogtag entfernen', exact: true }).click();
  await confirmClose(
    page,
    () => dialog.getByRole('button', { name: 'Schließen', exact: true }).click(),
    false
  );
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Tag Dialogtag entfernen', exact: true })
  ).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Tag Dialogtag auswählen', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await open.click();
  const tags = dialog.getByRole('textbox', { name: 'Tags', exact: true });
  await tags.fill('Noch nicht bestätigt');
  await confirmClose(page, () => outsideClick(page, isMobile), false);
  await expect(tags).toHaveValue('Noch nicht bestätigt');
  await confirmClose(
    page,
    () => dialog.getByRole('button', { name: 'Schließen', exact: true }).click(),
    true
  );
  await expect(dialog).toHaveCount(0);
  await open.click();
  await dialog
    .getByLabel('Profilfoto auswählen', { exact: true })
    .setInputFiles(fileURLToPath(new URL('../fixtures/profile.jpg', import.meta.url)));
  const crop = dialog.getByRole('button', { name: 'Bildausschnitt verschieben', exact: true });
  await expect(crop).toBeVisible();
  await confirmClose(page, () => crop.press('Escape'), false);
  await expect(crop).toBeVisible();
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await open.click();
  await dialog.getByLabel('Kontext', { exact: true }).fill('Normal speichern');
  await dialog.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Normal speichern', { exact: true })).toBeVisible();
});
