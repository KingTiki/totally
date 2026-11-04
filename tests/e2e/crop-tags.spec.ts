import { test, expect, type Page } from '@playwright/test';
import type { Database } from '../../src/lib/model.ts';
import { authenticate } from './helpers.ts';

async function login(page: Page) {
  await authenticate(page);
  await expect(page.getByRole('heading', { name: 'Demnächst.' })).toBeVisible();
}
async function startPerson(page: Page, name: string) {
  await page.goto('/personen');
  await page.getByRole('button', { name: 'Person hinzufügen', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  return dialog;
}

test('chosen crop matches the preview after mouse/touch dragging, zoom and keyboard adjustment; cancellation preserves photo', async ({
  page
}, info) => {
  await login(page);
  const dialog = await startPerson(page, `Ausschnitt ${info.project.name}`);
  const striped = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 600;
    const c = canvas.getContext('2d')!;
    ['#ef2929', '#29d829', '#2929ef'].forEach((color, index) => {
      c.fillStyle = color;
      c.fillRect(index * 300, 0, 300, 600);
    });
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await dialog.getByLabel('Profilfoto auswählen').setInputFiles({
    name: 'landscape.png',
    mimeType: 'image/png',
    buffer: Buffer.from(striped, 'base64')
  });
  const stage = dialog.getByRole('button', { name: 'Bildausschnitt verschieben', exact: true });
  await expect(stage).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Person anlegen', exact: true })).toBeDisabled();
  const slider = dialog.getByRole('slider', { name: /Zoom/ });
  await slider.focus();
  await slider.press('End');
  await expect(slider).toHaveValue('3');
  await stage.scrollIntoViewIfNeeded();
  const bounds = (await stage.boundingBox())!;
  const session = info.project.name === 'mobile' ? await page.context().newCDPSession(page) : null;
  for (let drag = 0; drag < 2; drag++) {
    const start = { x: bounds.x + bounds.width - 12, y: bounds.y + bounds.height / 2 };
    const end = { x: bounds.x + 12, y: start.y };
    if (session) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      for (let step = 1; step <= 5; step++)
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: start.x + ((end.x - start.x) * step) / 5, y: start.y }]
        });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 5 });
      await page.mouse.up();
    }
  }
  await session?.detach();
  const beforeKey = await stage.locator('img').getAttribute('style');
  await stage.focus();
  await stage.press('Shift+ArrowRight');
  expect(await stage.locator('img').getAttribute('style')).not.toEqual(beforeKey);
  await stage.press('Shift+ArrowLeft');
  await dialog
    .locator('.photo-cropper')
    .screenshot({ path: info.outputPath('crop-editor.png'), animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Ausschnitt übernehmen', exact: true }).click();
  await expect(dialog.locator('.photo-preview img')).toBeVisible();
  await dialog.getByRole('button', { name: 'Ausschnitt anpassen', exact: true }).click();
  await dialog.getByRole('button', { name: 'Zurücksetzen', exact: true }).click();
  await expect(slider).toHaveValue('1');
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await dialog.getByRole('button', { name: 'Person anlegen', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const profileUrl = page.url();
  const photo = await page.locator('.profile-avatar img').getAttribute('src');
  await page.locator('.profile-avatar img').evaluate((img: HTMLImageElement) => img.decode());
  const pixel = await page.locator('.profile-avatar img').evaluate((img: HTMLImageElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 384;
    const c = canvas.getContext('2d')!;
    c.drawImage(img, 0, 0);
    return [...c.getImageData(192, 192, 1, 1).data];
  });
  expect(pixel[2]).toBeGreaterThan(200);
  expect(pixel[0]).toBeLessThan(80);
  await page.getByRole('button', { name: 'Profil bearbeiten', exact: true }).click();
  await dialog.getByRole('button', { name: 'Ausschnitt anpassen', exact: true }).click();
  await slider.focus();
  await slider.press('End');
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await dialog.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.locator('.profile-avatar img')).toHaveAttribute('src', photo!);
  const stored = (
    (await (await page.request.get('/export?format=json')).json()) as Database
  ).people.find((p) => profileUrl.endsWith(p.id))!;
  expect(`/photos/${stored.photoId}`).toBe(photo);
  expect(stored.photo).toBeUndefined();
});

test('existing tags can be searched, selected and removed while new and unfinished tags save without case duplicates', async ({
  page
}, info) => {
  await login(page);
  let dialog = await startPerson(page, `Tagquelle ${info.project.name}`);
  const existing = `Konzert ${info.project.name}`,
    newTag = `Wandern ${info.project.name}`,
    pending = `Arbeit ${info.project.name}`;
  await dialog.getByRole('textbox', { name: 'Tags', exact: true }).fill(`Freunde, ${existing}`);
  await dialog.getByRole('button', { name: 'Person anlegen', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  dialog = await startPerson(page, `Tags ${info.project.name}`);
  const input = dialog.getByRole('textbox', { name: 'Tags', exact: true });
  await input.fill('kon');
  await dialog.getByRole('button', { name: `Tag ${existing} auswählen`, exact: true }).click();
  await input.fill('fr');
  await dialog.getByRole('button', { name: 'Tag Freunde auswählen', exact: true }).click();
  await input.fill('freunde');
  await input.press('Enter');
  await expect(
    dialog.getByRole('button', { name: 'Tag Freunde entfernen', exact: true })
  ).toHaveCount(1);
  await input.fill(newTag);
  await input.press('Enter');
  await input.fill(pending);
  await dialog
    .locator('.tag-picker')
    .screenshot({ path: info.outputPath('tag-picker.png'), animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Person anlegen', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const id = page.url().split('/').at(-1)!;
  let db = (await (await page.request.get('/export?format=json')).json()) as Database;
  expect(db.people.find((p) => p.id === id)!.tags).toEqual([existing, 'Freunde', newTag, pending]);
  await page.getByRole('button', { name: 'Profil bearbeiten', exact: true }).click();
  await dialog.getByRole('button', { name: 'Tag Freunde entfernen', exact: true }).click();
  await dialog.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(dialog).not.toBeVisible();
  db = (await (await page.request.get('/export?format=json')).json()) as Database;
  expect(db.people.find((p) => p.id === id)!.tags).toEqual([existing, newTag, pending]);
  await page.goto('/personen');
  await page.getByRole('combobox', { name: 'Nach Tag filtern' }).selectOption(existing);
  await expect(page.locator('.person-row')).toHaveCount(2);
});
