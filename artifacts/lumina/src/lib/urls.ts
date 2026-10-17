/**
 * Shared scheme check for outbound links (BUG-018 / Audit 4 A4).
 *
 * Only absolute `http:`/`https:` URLs may become an `<a href>`. Anything else
 * — `javascript:`, `data:`, `vbscript:`, protocol-relative or relative strings
 * — is rejected so a poisoned upstream (or a future data file) cannot hand the
 * page an executable or non-navigational URL. Used for the search-source cards
 * and the comparison page's external anchors.
 */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    // Relative or malformed input is not an outbound link we can vouch for.
    return false;
  }
}
