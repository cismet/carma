/**
 * TEMPORARY WORKAROUND — remove once the backend serves a size-capped "web"
 * image variant.
 *
 * On mobile devices the fullscreen photo lightbox decodes the full-resolution
 * camera originals (e.g. 4032x3024 ~ 12 MP, roughly 48 MB uncompressed in RAM
 * per image). Swiping through several of those exhausts the per-tab memory
 * budget of mobile browsers, so the OS discards and force-reloads the page
 * (the "crash" reported by the customer). We therefore serve the small
 * thumbnail in the lightbox on mobile until a proper server-side downscaled
 * version exists.
 *
 * Coarse device detection is enough here: we only need to know whether we are
 * on a memory-constrained mobile/tablet browser, not the exact device.
 */
export const isMobileDevice = (): boolean => {
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent || "";

  if (
    /Android|iPhone|iPad|iPod|Mobile|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile/i.test(
      ua
    )
  ) {
    return true;
  }

  // iPadOS 13+ reports a desktop Safari user agent ("Macintosh"); identify it
  // via touch support, which no real Mac reports.
  return /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
};
