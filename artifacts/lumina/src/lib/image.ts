/**
 * Download extension for an image src, shared by the inline message Download
 * control and the lightbox.
 *
 * A data URI carries its media type (Audit 2 F-04); a server-held reference
 * carries the format as a `.ext` suffix (Audit 3 F-03). Falls back to PNG when
 * neither is present.
 */
export function imageExtension(src: string): string {
  const dataUri = src.match(/^data:image\/([a-z0-9.+-]+);/i);
  if (dataUri) return dataUri[1] === 'jpeg' ? 'jpg' : dataUri[1];
  const suffix = src.match(/\.([a-z0-9]+)$/i);
  return suffix ? suffix[1] : 'png';
}
