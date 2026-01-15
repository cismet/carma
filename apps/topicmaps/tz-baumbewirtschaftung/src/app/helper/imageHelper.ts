const BOARD_URL_PREFIX = "https://board.cismet.de/";
const SECRES_BASE_URL = "https://wunda-cloud.cismet.de/wunda/api/secres";

/**
 * Transforms a board.cismet.de image URL to use the secured resource endpoint.
 *
 * Input:  https://board.cismet.de/tzb/demo/some-image.jpg
 * Output: https://wunda-cloud.cismet.de/wunda/api/secres/{jwt}/tzb/demo/some-image.jpg
 */
export const transformImageUrl = (
  url: string | undefined,
  jwt: string | null | undefined
): string | undefined => {
  if (!url || !jwt) return undefined;

  if (url.startsWith(BOARD_URL_PREFIX)) {
    const path = url.substring(BOARD_URL_PREFIX.length);
    return `${SECRES_BASE_URL}/${jwt}/${path}`;
  }

  // URL doesn't match expected pattern, return as-is
  return url;
};

/**
 * Converts an image URL to its thumbnail version by appending .thumbnail.{ext} to the URL.
 *
 * Input:  https://example.com/path/image.jpg
 * Output: https://example.com/path/image.jpg.thumbnail.jpg
 *
 * Input:  https://example.com/path/photo.png
 * Output: https://example.com/path/photo.png.thumbnail.png
 *
 * If no extension is found, returns the original URL.
 * If URL is undefined/null, returns undefined.
 */
export const getThumbnail = (url: string | undefined): string | undefined => {
  if (!url) return undefined;

  // Don't transform data URLs (base64)
  if (url.startsWith("data:")) return url;

  const lastDotIndex = url.lastIndexOf(".");
  const lastSlashIndex = url.lastIndexOf("/");

  // Check if there's a valid extension (dot must be after the last slash)
  if (lastDotIndex === -1 || lastDotIndex < lastSlashIndex) {
    return url;
  }

  const extension = url.substring(lastDotIndex);

  return `${url}.thumbnail${extension}`;
};
