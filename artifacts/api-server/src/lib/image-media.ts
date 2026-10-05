/**
 * Image media-type detection from magic bytes (Audit 2 F-04).
 *
 * The image provider's `b64_json` payload is raw image bytes whose format
 * depends on the provider/model, but the data-URI label and download filename
 * were hardcoded to PNG. Browsers sniff the real format when rendering, so a
 * mislabeled WebP still displays — but downloads get a wrong extension and
 * the persisted markdown misstates the format. Sniffing the signature keeps
 * the whole pipeline honest without re-encoding or new dependencies.
 */

export type ImageMediaType = "image/png" | "image/webp" | "image/jpeg";

/** File extension for a detected media type (PNG fallback). */
export function imageExtension(type: ImageMediaType): string {
  switch (type) {
    case "image/webp":
      return "webp";
    case "image/jpeg":
      return "jpg";
    default:
      return "png";
  }
}

/**
 * Detect the media type of an encoded image buffer by its magic bytes.
 * Anything unrecognised is treated as PNG (the documented default output of
 * the gpt-image-1 model).
 */
export function detectImageMediaType(buffer: Buffer): ImageMediaType {
  // PNG: 89 50 4E 47 0D 0A 1A 0A ("\x89PNG\r\n\x1a\n")
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  // JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  return "image/png";
}

/** Build a data URI with a correctly labelled media type. */
export function imageDataUri(buffer: Buffer): string {
  return `data:${detectImageMediaType(buffer)};base64,${buffer.toString("base64")}`;
}
