import {
  getWebMercatorFromWgs84Deg,
  WEB_MERCATOR_MAX_LATITUDE_DEG,
} from "@carma-geo/proj";
import type { Degrees } from "@carma-units";
/**
 * Non-tiled (single image) WMS support for MapLibre.
 *
 * Leaflet renders layers flagged `carmaconf://nonTiled` (layerType `wms-nt` /
 * `wmts-nt`) through `L.NonTiledLayer.WMS`: one GetMap request covering the
 * whole viewport instead of a 256px tile grid. Services that place labels or
 * symbols per image need that, otherwise labels get clipped and duplicated at
 * tile borders.
 *
 * MapLibre has no non-tiled raster source, so the equivalent is an `image`
 * source whose url and coordinates are re-computed whenever the view settles.
 * The request parameters travel on the style layer's metadata, which keeps both
 * the merged (setStyle) and the imperative (addSource/addLayer) paths working
 * with the same runtime updater.
 */

import type {
  ImageSource,
  ImageSourceSpecification,
  LngLatBounds,
  Map as MaplibreMap,
} from "maplibre-gl";

/** Metadata key carrying the GetMap parameters on the raster style layer. */
export const NON_TILED_METADATA_KEY = "carma:non-tiled-wms";

/** 1x1 transparent PNG, used until the first viewport-sized image is loaded. */
const PLACEHOLDER_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/** Degenerate quad near null island; replaced on the first update. */
const PLACEHOLDER_COORDINATES: [
  [number, number],
  [number, number],
  [number, number],
  [number, number]
] = [
  [0, 0],
  [0, 0],
  [0, 0],
  [0, 0],
];

/** Extra viewport border (css px) requested on each side, so a small pan is
 *  already covered by the current image. Matches the Leaflet layer's buffer. */
const DEFAULT_BUFFER_PX = 64;

/** Upper bound for the requested image edge length, to keep GetMap sane on
 *  large screens and high device pixel ratios. */
const DEFAULT_MAX_SIZE_PX = 2048;

export interface NonTiledWmsRequest {
  url: string;
  layers: string;
  styles?: string;
  version?: string;
  format?: string;
  transparent?: boolean;
  isWmts?: boolean;
  bufferPx?: number;
  maxSizePx?: number;
}

const querySeparator = (url: string): string =>
  url.endsWith("?") ? "" : url.includes("?") ? "&" : "?";

const lngToMercatorX = (lng: number): number =>
  getWebMercatorFromWgs84Deg(lng as Degrees, 0 as Degrees)[0];

const latToMercatorY = (lat: number): number => {
  const clamped = Math.max(
    -WEB_MERCATOR_MAX_LATITUDE_DEG,
    Math.min(WEB_MERCATOR_MAX_LATITUDE_DEG, lat)
  );
  return getWebMercatorFromWgs84Deg(0 as Degrees, clamped as Degrees)[1];
};

export const buildNonTiledWmsUrl = (
  request: NonTiledWmsRequest,
  bbox: { west: number; south: number; east: number; north: number },
  width: number,
  height: number
): string => {
  const version = request.version || "1.1.1";
  const crsParam = version >= "1.3.0" ? "crs" : "srs";
  const minX = lngToMercatorX(bbox.west);
  const maxX = lngToMercatorX(bbox.east);
  const minY = latToMercatorY(bbox.south);
  const maxY = latToMercatorY(bbox.north);

  return `${request.url}${querySeparator(
    request.url
  )}service=WMS&version=${version}&request=GetMap&layers=${
    request.layers
  }&styles=${request.styles || ""}&format=${
    request.format || "image/png"
  }&transparent=${request.transparent ? "true" : "false"}${
    request.isWmts ? "&type=wmts-nt" : ""
  }&width=${width}&height=${height}&${crsParam}=EPSG:3857&bbox=${minX},${minY},${maxX},${maxY}`;
};

export const createNonTiledImageSource = (): ImageSourceSpecification => ({
  type: "image",
  url: PLACEHOLDER_IMAGE,
  coordinates: PLACEHOLDER_COORDINATES.map((c) => [...c]) as [
    [number, number],
    [number, number],
    [number, number],
    [number, number]
  ],
});

export const createNonTiledMetadata = (
  request: NonTiledWmsRequest
): Record<string, unknown> => ({ [NON_TILED_METADATA_KEY]: request });

const bufferedBounds = (
  map: MaplibreMap,
  bufferPx: number
): { west: number; south: number; east: number; north: number } => {
  const bounds: LngLatBounds = map.getBounds();
  const canvas = map.getCanvas();
  const widthPx = Math.max(canvas.clientWidth || canvas.width, 1);
  const heightPx = Math.max(canvas.clientHeight || canvas.height, 1);

  const west = bounds.getWest();
  const east = bounds.getEast();
  const south = bounds.getSouth();
  const north = bounds.getNorth();

  const lngPad = ((east - west) * bufferPx) / widthPx;
  const latPad = ((north - south) * bufferPx) / heightPx;

  return {
    west: west - lngPad,
    east: east + lngPad,
    south: Math.max(-WEB_MERCATOR_MAX_LATITUDE_DEG, south - latPad),
    north: Math.min(WEB_MERCATOR_MAX_LATITUDE_DEG, north + latPad),
  };
};

type NonTiledLayer = { source: string; request: NonTiledWmsRequest };

const nonTiledLayers = (map: MaplibreMap): NonTiledLayer[] => {
  // getStyle serializes/deep-clones every layer and its coverage filters.
  // The live layer metadata is sufficient and is read only on style changes.
  try {
    return map.getLayersOrder().flatMap((id) => {
      const layer = map.getLayer(id);
      if (!layer || !("source" in layer) || typeof layer.source !== "string")
        return [];
      const request = (layer.metadata as Record<string, unknown> | undefined)?.[
        NON_TILED_METADATA_KEY
      ] as NonTiledWmsRequest | undefined;
      return request ? [{ source: layer.source, request }] : [];
    });
  } catch {
    return [];
  }
};

export const updateNonTiledSources = (
  map: MaplibreMap,
  lastRequests: Map<string, string>,
  layers: readonly NonTiledLayer[] = nonTiledLayers(map)
): void => {
  for (const { source: sourceId, request } of layers) {
    const source = map.getSource(sourceId) as ImageSource | undefined;
    if (!source || source.type !== "image") continue;

    const bbox = bufferedBounds(map, request.bufferPx ?? DEFAULT_BUFFER_PX);
    if (!(bbox.east > bbox.west) || !(bbox.north > bbox.south)) {
      continue;
    }

    const canvas = map.getCanvas();
    const maxSize = request.maxSizePx ?? DEFAULT_MAX_SIZE_PX;
    const bufferPx = request.bufferPx ?? DEFAULT_BUFFER_PX;
    // Keep the pixel aspect of the request equal to the mercator aspect of the
    // box, otherwise a rotated or pitched view would stretch the image.
    const spanX = lngToMercatorX(bbox.east) - lngToMercatorX(bbox.west);
    const spanY = latToMercatorY(bbox.north) - latToMercatorY(bbox.south);
    const aspect = spanY / spanX;
    let width = Math.min(
      maxSize,
      Math.max(
        1,
        Math.round((canvas.clientWidth || canvas.width) + 2 * bufferPx)
      )
    );
    let height = Math.max(1, Math.round(width * aspect));
    if (height > maxSize) {
      height = maxSize;
      width = Math.max(1, Math.round(height / aspect));
    }

    const url = buildNonTiledWmsUrl(request, bbox, width, height);
    if (lastRequests.get(sourceId) === url) {
      continue;
    }
    lastRequests.set(sourceId, url);

    const coordinates: [
      [number, number],
      [number, number],
      [number, number],
      [number, number]
    ] = [
      [bbox.west, bbox.north],
      [bbox.east, bbox.north],
      [bbox.east, bbox.south],
      [bbox.west, bbox.south],
    ];

    try {
      source.updateImage({ url, coordinates });
    } catch (error) {
      console.warn("[NON_TILED_WMS] updateImage failed", sourceId, error);
    }
  }
};

export const attachNonTiledWmsUpdater = (map: MaplibreMap): (() => void) => {
  const lastRequests = new Map<string, string>();
  const sources = new Map<string, ImageSource | undefined>();
  let layers: NonTiledLayer[] = [];
  let pending: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const refreshLayers = () => {
    layers = nonTiledLayers(map);
    const ids = new Set(layers.map((layer) => layer.source));
    for (const id of sources.keys()) {
      if (!ids.has(id)) {
        sources.delete(id);
        lastRequests.delete(id);
      }
    }
    for (const { source: id } of layers) {
      const source = map.getSource(id) as ImageSource | undefined;
      // Styledata also fires for filters/paint changes; only a replaced image
      // source loses its request. Otherwise those events repeat the same WMS.
      if (sources.get(id) !== source) lastRequests.delete(id);
      sources.set(id, source);
    }
  };
  const update = () => {
    if (pending !== undefined) clearTimeout(pending);
    pending = undefined;
    if (disposed || !layers.length) return;
    // Programmatic orbit frames emit moveend individually. Request a WMS only
    // after that burst settles, not once for each intermediate camera pose.
    pending = setTimeout(() => {
      pending = undefined;
      if (!disposed) updateNonTiledSources(map, lastRequests, layers);
    }, 100);
  };
  const onStyleData = () => {
    refreshLayers();
    update();
  };

  map.on("moveend", update);
  map.on("resize", update);
  map.on("styledata", onStyleData);
  refreshLayers();
  updateNonTiledSources(map, lastRequests, layers);

  return () => {
    disposed = true;
    if (pending !== undefined) clearTimeout(pending);
    map.off("moveend", update);
    map.off("resize", update);
    map.off("styledata", onStyleData);
    sources.clear();
    lastRequests.clear();
  };
};
