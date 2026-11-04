import { t } from './i18n/browser.ts';
// Uploads are cropped client-side; the server stores the resulting JPEG separately.
export const PHOTO_SIZE = 384;
export const PHOTO_MAX_BYTES = 96 * 1024;
export const PHOTO_MAX_LENGTH = 23 + Math.ceil(PHOTO_MAX_BYTES / 3) * 4;
export const PHOTO_INPUT_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_ID_PATTERN = /^[a-f0-9]{64}$/;

export function photoSource(person: { photo?: string; photoId?: string }): string | undefined {
  return person.photoId && PHOTO_ID_PATTERN.test(person.photoId)
    ? `/photos/${person.photoId}`
    : person.photo;
}

export type CropSelection = { x: number; y: number; zoom: number };
export const initialCrop = (): CropSelection => ({ x: 0.5, y: 0.5, zoom: 1 });

export function clampCrop(width: number, height: number, selection: CropSelection): CropSelection {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new Error(t('Das Bild hat keine gültige Größe.'));
  const zoom = Math.max(1, Math.min(3, Number.isFinite(selection.zoom) ? selection.zoom : 1));
  const size = Math.min(width, height) / zoom;
  const clamp = (value: number, half: number) =>
    Math.max(half, Math.min(1 - half, Number.isFinite(value) ? value : 0.5));
  return {
    x: clamp(selection.x, size / width / 2),
    y: clamp(selection.y, size / height / 2),
    zoom
  };
}

export function cropArea(width: number, height: number, selection: CropSelection) {
  const crop = clampCrop(width, height, selection);
  const size = Math.min(width, height) / crop.zoom;
  return { x: crop.x * width - size / 2, y: crop.y * height - size / 2, size };
}

export async function openPhoto(
  file: File
): Promise<{ image: HTMLImageElement; release: () => void }> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error(t('Bitte ein Foto als JPG, PNG oder WebP auswählen.'));
  if (!file.size || file.size > PHOTO_INPUT_MAX_BYTES)
    throw new Error(t('Bitte ein Foto mit maximal 10 MB auswählen.'));
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { image, release: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    if (error instanceof DOMException)
      throw new Error(
        t('Das Foto konnte nicht geöffnet werden. Bitte ein anderes Bild auswählen.')
      );
    throw error;
  }
}

export function renderPhoto(image: HTMLImageElement, selection: CropSelection): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PHOTO_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error(t('Das Foto konnte nicht vorbereitet werden.'));
  // Browsers apply EXIF orientation while decoding. Re-encoding drops metadata.
  const { x, y, size } = cropArea(image.naturalWidth, image.naturalHeight, selection);
  context.fillStyle = '#fffefa';
  context.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
  context.drawImage(image, x, y, size, size, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  for (const quality of [0.85, 0.7, 0.5]) {
    const photo = canvas.toDataURL('image/jpeg', quality);
    if (photo.length <= PHOTO_MAX_LENGTH) return photo;
  }
  throw new Error(t('Das Foto ist zu detailreich. Bitte ein anderes Bild auswählen.'));
}
