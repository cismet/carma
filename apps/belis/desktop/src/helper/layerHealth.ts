/**
 * Layer availability check for the settings panel. LayerLoadingTracker only
 * sees layers already on the map, so it cannot answer whether a layer would
 * work if switched on.
 *
 * Probes match MapLibre's own requests: it loads raster tiles via fetch, so
 * CORS applies and an <img> probe would pass servers the map cannot use.
 */

import type { LibreLayer } from "@carma-mapping/engines/maplibre";
import type { LayerEntry } from "../config/mapLayerConfigs";

export type LayerHealth = "checking" | "ok" | "broken";

/** Off-intranet hosts hang rather than refuse, so only a timeout detects them. */
const PROBE_TIMEOUT_MS = 5000;
const RETRY_DELAY_MS = 1500;

/** Wuppertal centre. Over the data, and below basemap.de's 404 zooms. */
const PROBE_TILE = { z: 14, x: 8517, y: 5466 };

/** Web mercator extent in EPSG:3857. */
const MERCATOR_ORIGIN_SHIFT = 20037508.342789244;

/**
 * PROBE_TILE as a bbox. Must stay snapped to the tile grid: `tiled=true`
 * services reject any other extent with a ServiceException at HTTP 200.
 */
const buildProbeBbox = (): string => {
  const size = (2 * MERCATOR_ORIGIN_SHIFT) / 2 ** PROBE_TILE.z;
  const minX = -MERCATOR_ORIGIN_SHIFT + PROBE_TILE.x * size;
  const maxY = MERCATOR_ORIGIN_SHIFT - PROBE_TILE.y * size;
  return [minX, maxY - size, minX + size, maxY]
    .map((v) => v.toFixed(6))
    .join(",");
};

const PROBE_BBOX = buildProbeBbox();

const withTimeout = (ms = PROBE_TIMEOUT_MS): AbortSignal =>
  AbortSignal.timeout(ms);

/**
 * The probe URL is constant and the services send max-age up to 86400, so the
 * default cache mode answers from disk while offline. `no-store` forces the
 * request onto the network; `no-cache` would still allow a 304.
 */
const PROBE_REQUEST: RequestInit = { cache: "no-store" };

/**
 * Mirrors the `tileUrl` template in styleComposer.ts `addRasterSubStyle`, with
 * PROBE_BBOX in place of `{bbox-epsg-3857}`. Kept in sync by hand.
 */
const buildProbeUrl = (
  layer: Extract<LibreLayer, { type: "wms" | "wmts" }>
): string => {
  const version = layer.version || "1.1.1";
  const crsParam = version >= "1.3.0" ? "crs" : "srs";
  const isWmts = layer.type === "wmts";
  const querySep = layer.url.endsWith("?")
    ? ""
    : layer.url.includes("?")
    ? "&"
    : "?";
  const size = layer.tileSize ?? 256;

  return `${
    layer.url
  }${querySep}service=WMS&version=${version}&request=GetMap&layers=${
    layer.layers
  }&styles=${layer.styles || ""}&format=${
    layer.format || "image/png"
  }&transparent=${layer.transparent ? "true" : "false"}${
    isWmts ? "&type=wmts" : ""
  }&width=${size}&height=${size}&${crsParam}=EPSG:3857&bbox=${PROBE_BBOX}`;
};

const probeRaster = async (
  layer: Extract<LibreLayer, { type: "wms" | "wmts" }>
): Promise<boolean> => {
  try {
    const res = await fetch(buildProbeUrl(layer), {
      ...PROBE_REQUEST,
      mode: "cors",
      signal: withTimeout(),
    });
    if (!res.ok) return false;
    // A ServiceException arrives as HTTP 200 with text/xml.
    return (res.headers.get("content-type") ?? "").startsWith("image/");
  } catch {
    // No route, DNS failure, missing CORS, or timeout: the map cannot draw it.
    return false;
  }
};

/**
 * Reachability of a data URL; HEAD keeps the 1 MB esave GeoJSON off the wire.
 * `allow404` because tile servers answer 404 for tiles holding no data.
 */
const probeDataUrl = async (
  url: string,
  allow404: boolean
): Promise<boolean> => {
  try {
    const res = await fetch(url, {
      ...PROBE_REQUEST,
      method: "HEAD",
      signal: withTimeout(),
    });
    if (allow404 && res.status === 404) return true;
    if (!res.ok) return false;
    // Some templates are WMS GetMap calls; none answer XML legitimately.
    return !isServiceException(res);
  } catch {
    return false;
  }
};

const isServiceException = (res: Response): boolean => {
  const type = res.headers.get("content-type") ?? "";
  return type.includes("xml");
};

/**
 * Both template flavours occur in the configured styles: `{z}/{x}/{y}` for
 * vector tiles and `{bbox-epsg-3857}` for raster sources that are GetMap calls.
 */
const fillTileTemplate = (template: string): string =>
  template
    .replace("{z}", String(PROBE_TILE.z))
    .replace("{x}", String(PROBE_TILE.x))
    .replace("{y}", String(PROBE_TILE.y))
    .replace("{bbox-epsg-3857}", PROBE_BBOX);

interface StyleSource {
  type?: string;
  url?: string;
  tiles?: string[];
  data?: unknown;
}

/** A style.json can load while the tile server behind it is dead. */
const probeStyleSource = async (source: StyleSource): Promise<boolean> => {
  if (typeof source.data === "string") {
    return probeDataUrl(source.data, false);
  }
  const template = source.tiles?.[0];
  if (template) {
    return probeDataUrl(fillTileTemplate(template), true);
  }
  // TileJSON: resolve it, then probe one of its tiles.
  if (source.url) {
    try {
      const res = await fetch(source.url, {
        ...PROBE_REQUEST,
        signal: withTimeout(),
      });
      if (!res.ok) return false;
      const tileJson = (await res.json()) as { tiles?: string[] };
      const tileTemplate = tileJson.tiles?.[0];
      if (!tileTemplate) return true; // reachable, nothing deeper to follow
      return probeDataUrl(fillTileTemplate(tileTemplate), true);
    } catch {
      return false;
    }
  }
  // Inline data, or a shape with no URL to follow.
  return true;
};

const probeVector = async (
  layer: Extract<LibreLayer, { type: "vector" }>
): Promise<boolean> => {
  if (typeof layer.style !== "string") return true; // inline style, nothing to fetch
  try {
    const res = await fetch(layer.style, {
      ...PROBE_REQUEST,
      signal: withTimeout(),
    });
    if (!res.ok) return false;
    const style = (await res.json()) as {
      sources?: Record<string, StyleSource>;
    };
    const sources = Object.values(style.sources ?? {});
    if (sources.length === 0) return true;
    const results = await Promise.all(sources.map(probeStyleSource));
    return results.every(Boolean);
  } catch {
    return false;
  }
};

const probeLayer = async (layer: LibreLayer): Promise<boolean> => {
  switch (layer.type) {
    case "wms":
    case "wmts":
      return probeRaster(layer);
    case "vector":
      return probeVector(layer);
    case "geojson":
      return probeDataUrl(layer.data, false);
    case "tiles":
      return probeDataUrl(fillTileTemplate(layer.url), true);
    default:
      // Types belis does not configure (cog, 3d tiles).
      return true;
  }
};

/** Healthy only if every sub-layer is; Luftbildkarte spans three services. */
export const probeLayerEntry = async (entry: LayerEntry): Promise<boolean> => {
  const layers = Array.isArray(entry.layer) ? entry.layer : [entry.layer];
  const results = await Promise.all(layers.map(probeLayer));
  return results.every(Boolean);
};

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The retry keeps a server slower than PROBE_TIMEOUT_MS from being called dead. */
export const probeLayerEntryWithRetry = async (
  entry: LayerEntry
): Promise<boolean> => {
  if (await probeLayerEntry(entry)) return true;
  await delay(RETRY_DELAY_MS);
  return probeLayerEntry(entry);
};
