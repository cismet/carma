/**
 * Base URL for the published investigation data (georadar volumes, MDIO
 * chunks, survey graph, capture-026 scene and the levelling control points).
 *
 * Everything lives next to the point-cloud deliveries in the same mesh2024
 * folder, so the stories run against the published data by default and no
 * longer need a local .data checkout. Point
 * VITE_INVESTIGATION_DATA_BASE_URL at the dev server's own routes (an empty
 * string) to work against locally derived data instead.
 */
export const PUBLISHED_INVESTIGATION_DATA_BASE_URL =
  "https://wupp-3d-data.cismet.de/mesh2024";

// The data is published under mesh2024, but switching the default over still
// breaks the georadar scenes ("Failed to fetch" before any request reaches the
// host), so the dev-server routes stay the default until that is resolved.
// Set VITE_INVESTIGATION_DATA_BASE_URL to the published base to test it.
export const INVESTIGATION_DATA_BASE_URL: string =
  import.meta.env.VITE_INVESTIGATION_DATA_BASE_URL ?? "";

/** Joins a root-relative investigation data path onto the active base URL. */
export const investigationDataUrl = (path: string): string =>
  `${INVESTIGATION_DATA_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
