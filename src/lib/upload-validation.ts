const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

export function validateImageMagicBytes(buffer: Buffer): "jpeg" | "png" | null {
  if (buffer.length < 4) return null;
  if (JPEG_MAGIC.every((byte, i) => buffer[i] === byte)) return "jpeg";
  if (PNG_MAGIC.every((byte, i) => buffer[i] === byte)) return "png";
  return null;
}

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
