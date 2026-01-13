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
