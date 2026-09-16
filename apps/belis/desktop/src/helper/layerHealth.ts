/**
 * Layer availability check for the settings panel.
 *
 * The map-side LayerLoadingTracker only ever sees layers that are already on
 * the map, so it cannot answer "would this layer work if I switched it on".
 * This module actively probes every configured layer instead.
 *
 * The probes mirror what MapLibre itself does, because anything else tests the
 * wrong thing:
 *   - Raster tiles are fetched by MapLibre via fetch/XHR, not via <img>
 *     (ImageRequest.getImage, refreshExpiredTiles defaults to true), so CORS is
 *     required. An <img> probe ignores CORS and would report "works" for a
 *     server the map cannot actually use.
 *   - A broken WMS answers HTTP 200 with a text/xml ServiceException, so the
 *     status code alone proves nothing — the content type has to be checked.
 *   - Not being on the city intranet is a silent hang: DNS resolves to a
 *     private address and the TCP connect never completes. Only our own
 *     timeout detects that case.
 */

import type { LibreLayer } from "@carma-mapping/engines/maplibre";
import type { LayerEntry } from "../config/mapLayerConfigs";

export type LayerHealth = "checking" | "ok" | "broken";

/** Per-probe budget. Long enough for a slow WMS, short enough that a dead
 *  intranet host does not keep the whole panel spinning. */
const PROBE_TIMEOUT_MS = 5000;
/** A layer reported broken gets one silent second chance, which turns it blue
 *  again if the server was merely slow rather than dead. */
const RETRY_DELAY_MS = 1500;

/**
 * The tile every probe asks for: Wuppertal centre at z14. Over the city on
 * purpose — an extent outside the data would answer with an empty tile and
 * prove nothing. z14 also still has vector tiles; the basemap.de tileset
 * already answers 404 at z16 and beyond.
 */
const PROBE_TILE = { z: 14, x: 8517, y: 5466 };

/** Half the equator in metres, the web mercator extent in EPSG:3857. */
const MERCATOR_ORIGIN_SHIFT = 20037508.342789244;

/**
 * The same tile as an EPSG:3857 bbox, derived rather than written out so the
 * bbox and the tile can never drift apart.
 *
 * Snapping to the tile grid is not cosmetic: services called with `tiled=true`
 * reject anything else with "Request too large or invalid BBOX. (not a single
 * tile)" at HTTP 200, which read as a broken layer. The Stadtplan (bunt) style
 * pulls two such Schummerung sources.
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
 * Rebuild the GetMap URL exactly as the engine builds it for a tile.
 *
 * Kept in sync by hand with `addRasterSubStyle` in
 * libraries/mapping/engines/maplibre/src/utils/styleComposer.ts (the
 * `tileUrl` template). The only difference is that `{bbox-epsg-3857}`, which
 * MapLibre substitutes per tile, is replaced by PROBE_BBOX here.
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
      mode: "cors",
      signal: withTimeout(),
    });
    if (!res.ok) return false;
    // A ServiceException comes back as HTTP 200 with text/xml.
    return (res.headers.get("content-type") ?? "").startsWith("image/");
  } catch {
    // Offline, no route to the intranet, DNS failure, missing CORS header,
    // or our own timeout — all of them mean the map cannot draw this layer.
    return false;
  }
};

/**
 * Reachability of a URL that MapLibre would download as data (vector tile,
 * TileJSON, GeoJSON). HEAD keeps the 1 MB esave GeoJSON off the wire.
 *
 * A 404 counts as reachable on purpose: vector tile servers answer 404 for
 * tiles that contain no data, so treating it as a failure would paint working
 * layers red.
 */
const probeDataUrl = async (
  url: string,
  allow404: boolean
): Promise<boolean> => {
  try {
    const res = await fetch(url, { method: "HEAD", signal: withTimeout() });
    if (allow404 && res.status === 404) return true;
    if (!res.ok) return false;
    // Some of these templates are WMS GetMap calls (see fillTileTemplate), and
    // a broken WMS reports its failure as XML at HTTP 200. None of the probed
    // URLs legitimately answer with XML, so this is safe for every source kind.
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
 * Fill in a tile URL template so it points at one concrete tile over Wuppertal.
 *
 * Styles use two different template flavours and both occur in the layers
 * belis loads: `{z}/{x}/{y}` for vector tiles, and `{bbox-epsg-3857}` for
 * raster sources that are really WMS GetMap calls (the Stadtplan (bunt) style
 * carries two such Schummerung sources). Leaving the bbox placeholder in place
 * makes the request fail outright, which reported the whole layer as broken.
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

/**
 * Follow one style source down to the server that actually holds the data.
 * A style.json can load perfectly while the tileserver behind it is dead, so
 * the shallow check would be misleading.
 */
const probeStyleSource = async (source: StyleSource): Promise<boolean> => {
  // geojson source: the data lives at a plain URL
  if (typeof source.data === "string") {
    return probeDataUrl(source.data, false);
  }
  // vector source with an inline tile template
  const template = source.tiles?.[0];
  if (template) {
    return probeDataUrl(fillTileTemplate(template), true);
  }
  // vector source pointing at a TileJSON: read it, then probe one of its tiles
  if (source.url) {
    try {
      const res = await fetch(source.url, { signal: withTimeout() });
      if (!res.ok) return false;
      const tileJson = (await res.json()) as { tiles?: string[] };
      const tileTemplate = tileJson.tiles?.[0];
      if (!tileTemplate) return true; // reachable, nothing deeper to follow
      return probeDataUrl(fillTileTemplate(tileTemplate), true);
    } catch {
      return false;
    }
  }
  // inline data or a shape we do not know how to follow: nothing to prove
  return true;
};

const probeVector = async (
  layer: Extract<LibreLayer, { type: "vector" }>
): Promise<boolean> => {
  if (typeof layer.style !== "string") return true; // inline style, nothing to fetch
  try {
    const res = await fetch(layer.style, { signal: withTimeout() });
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
      // Types belis does not configure (cog, 3d tiles) are not judged.
      return true;
  }
};

/**
 * A layer entry is healthy only if every sub-layer is: the Luftbildkarte
 * expands into three services and is useless if any of them is missing.
 */
export const probeLayerEntry = async (entry: LayerEntry): Promise<boolean> => {
  const layers = Array.isArray(entry.layer) ? entry.layer : [entry.layer];
  const results = await Promise.all(layers.map(probeLayer));
  return results.every(Boolean);
};

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Probe once and, if that failed, quietly once more. The retry is what keeps a
 * server that is merely slower than PROBE_TIMEOUT_MS from being declared dead.
 */
export const probeLayerEntryWithRetry = async (
  entry: LayerEntry
): Promise<boolean> => {
  if (await probeLayerEntry(entry)) return true;
  await delay(RETRY_DELAY_MS);
  return probeLayerEntry(entry);
};
