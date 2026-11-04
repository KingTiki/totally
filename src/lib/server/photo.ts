import { PHOTO_MAX_BYTES, PHOTO_MAX_LENGTH, PHOTO_SIZE } from '../photo.ts';

export function validPhoto(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length > PHOTO_MAX_LENGTH ||
    !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    return false;
  const encoded = value.slice(23);
  const bytes = Buffer.from(encoded, 'base64');
  if (
    bytes.length > PHOTO_MAX_BYTES ||
    bytes.toString('base64') !== encoded ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0xd9
  )
    return false;
  let dimensions = false;
  // Read JPEG segments, accepting baseline/progressive raster images only.
  for (let offset = 2; offset + 3 < bytes.length;) {
    if (bytes[offset++] !== 0xff) return false;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x00 || offset + 2 > bytes.length)
      return false;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length - 2) return false;
    if (marker === 0xda) return dimensions && length >= 6 && offset + length < bytes.length - 2;
    if (marker === 0xc0 || marker === 0xc2) {
      if (length < 11 || bytes[offset + 2] !== 8) return false;
      const height = bytes.readUInt16BE(offset + 3),
        width = bytes.readUInt16BE(offset + 5);
      if (!width || !height || width > PHOTO_SIZE || height > PHOTO_SIZE) return false;
      dimensions = true;
    }
    offset += length;
  }
  return false;
}
