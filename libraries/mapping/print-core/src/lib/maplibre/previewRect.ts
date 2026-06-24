// MapLibre-specific print preview rectangle helpers.
//
// This is the MapLibre analog of the Leaflet functions that live in the
// geoportal print helper (drawRectanglePrev / getPolygonPoints /
// getPreviewBounds / getCenterPrintPreview …). It owns the on-map rectangle —
// a GeoJSON source + fill/line layers — plus the math to seed it from the map
// center, project its corners to screen pixels, and drag it.
//
// It MAY import maplibre-gl (types only) and from "../core". The core MUST NOT
// import from here.

import {
  getFromWGS84ToWebMercator,
  getFromWebMercatorToWGS84,
} from "@carma-geo/proj";
import type {
  GeoJSONSource,
  LngLatBoundsLike,
  Map as MapLibreMap,
  MapLayerMouseEvent,
} from "maplibre-gl";

import {
  calculateBBox,
  getMercatorScale,
  getPrintPixelSize,
} from "../core";
import type { Orientation } from "../core";

// getFromWGS84ToWebMercator wants a branded LngLat type; the rectangle math
// works in plain numbers, so funnel WGS84 → 3857 through this cast helper
// instead of importing the brand types here.
const wgs84ToWebMercator = (lng: number, lat: number): [number, number] => {
  const [x, y] = getFromWGS84ToWebMercator([lng, lat] as unknown as Parameters<
    typeof getFromWGS84ToWebMercator
  >[0]);
  return [x, y];
};

export const PREVIEW_SOURCE_ID = "carma-print-preview";
export const PREVIEW_FILL_LAYER_ID = "carma-print-preview-fill";
export const PREVIEW_LINE_LAYER_ID = "carma-print-preview-line";

/** Geographic extent (WGS84) of the axis-aligned print rectangle. */
export interface RectBounds {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/** Pixel box of the rectangle in the map container (north-up assumption). */
export interface RectScreenBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Seed the rectangle bounds from the current map center, sized for the A4
 * print area at the given scale. Mirrors the geoportal getPreviewBounds math:
 * the print pixel size at 72dpi is turned into a metric bbox (with the
 * Mercator latitude correction) around the center, then projected back to
 * WGS84 corners.
 */
export const buildRectBounds = (
  map: MapLibreMap,
  scale: number,
  orientation: Orientation
): RectBounds => {
  const center = map.getCenter();
  const center3857 = wgs84ToWebMercator(center.lng, center.lat);
  const { width, height } = getPrintPixelSize(orientation);
  const mercatorScale = getMercatorScale(scale, center.lat);

  const bbox = calculateBBox(
    center3857[0],
    center3857[1],
    width,
    height,
    72,
    mercatorScale
  );

  const sw = getFromWebMercatorToWGS84([bbox.minX, bbox.minY]); // [lng, lat]
  const ne = getFromWebMercatorToWGS84([bbox.maxX, bbox.maxY]);

  return {
    minLng: sw[0],
    minLat: sw[1],
    maxLng: ne[0],
    maxLat: ne[1],
  };
};

/** Closed GeoJSON polygon ring for the rectangle (lng/lat). */
export const rectBoundsToFeature = (
  bounds: RectBounds
): GeoJSON.Feature<GeoJSON.Polygon> => {
  const { minLng, minLat, maxLng, maxLat } = bounds;
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [minLng, minLat],
          [maxLng, minLat],
          [maxLng, maxLat],
          [minLng, maxLat],
          [minLng, minLat],
        ],
      ],
    },
  };
};

/** Center of the rectangle in EPSG:3857 — the print job's map center. */
export const getRectCenter3857 = (bounds: RectBounds): [number, number] => {
  const lng = (bounds.minLng + bounds.maxLng) / 2;
  const lat = (bounds.minLat + bounds.maxLat) / 2;
  return wgs84ToWebMercator(lng, lat);
};

/**
 * Project the rectangle corners to container pixels so the HTML overlay can be
 * positioned over it. Assumes a north-up map (bearing 0, no pitch), which is
 * the same assumption the geoportal Leaflet overlay makes.
 */
export const getRectScreenBox = (
  map: MapLibreMap,
  bounds: RectBounds
): RectScreenBox => {
  const nw = map.project([bounds.minLng, bounds.maxLat]);
  const ne = map.project([bounds.maxLng, bounds.maxLat]);
  const sw = map.project([bounds.minLng, bounds.minLat]);
  return {
    top: nw.y,
    left: nw.x,
    width: ne.x - nw.x,
    height: sw.y - nw.y,
  };
};

/** Pixel hit-test: is the screen point inside the rectangle's screen box? */
export const pointInRectBox = (
  point: { x: number; y: number },
  box: RectScreenBox
): boolean =>
  point.x >= box.left &&
  point.x <= box.left + box.width &&
  point.y >= box.top &&
  point.y <= box.top + box.height;

/**
 * Inverse of getRectScreenBox: recover WGS84 bounds from a (north-up) pixel
 * box. Used to commit the new rectangle position after a DOM-transform drag —
 * the screen box is translated by the drag delta, then unprojected once.
 */
export const unprojectScreenBox = (
  map: MapLibreMap,
  box: RectScreenBox
): RectBounds => {
  const nw = map.unproject([box.left, box.top]);
  const se = map.unproject([box.left + box.width, box.top + box.height]);
  return {
    minLng: Math.min(nw.lng, se.lng),
    maxLng: Math.max(nw.lng, se.lng),
    minLat: Math.min(nw.lat, se.lat),
    maxLat: Math.max(nw.lat, se.lat),
  };
};

/** Zoom/pan the map so the rectangle fills the view (geoportal fitBounds). */
export const fitMapToRect = (
  map: MapLibreMap,
  bounds: RectBounds,
  animate = false
): void => {
  const bbox: LngLatBoundsLike = [
    [bounds.minLng, bounds.minLat],
    [bounds.maxLng, bounds.maxLat],
  ];
  map.fitBounds(bbox, { animate, padding: 0 });
};

/** Add the source + fill/line layers if absent, then set the rectangle data. */
export const ensureRectLayers = (
  map: MapLibreMap,
  bounds: RectBounds
): void => {
  const data = rectBoundsToFeature(bounds);
  const existing = map.getSource(PREVIEW_SOURCE_ID) as
    | GeoJSONSource
    | undefined;

  if (existing) {
    existing.setData(data);
    return;
  }

  map.addSource(PREVIEW_SOURCE_ID, { type: "geojson", data });
  // Match the geoportal Leaflet preview polygon exactly: black hairline
  // outline (color: black, weight: 1) over a black fill at Leaflet's default
  // polygon fill-opacity of 0.2 (fillColor defaults to the stroke color, and
  // the fill doubles as the drag hit area).
  map.addLayer({
    id: PREVIEW_FILL_LAYER_ID,
    type: "fill",
    source: PREVIEW_SOURCE_ID,
    paint: {
      "fill-color": "#000000",
      "fill-opacity": 0.2,
    },
  });
  map.addLayer({
    id: PREVIEW_LINE_LAYER_ID,
    type: "line",
    source: PREVIEW_SOURCE_ID,
    paint: {
      "line-color": "#000000",
      "line-width": 1,
    },
  });
};

/** Update only the rectangle geometry (no layer churn). */
export const updateRectData = (map: MapLibreMap, bounds: RectBounds): void => {
  const source = map.getSource(PREVIEW_SOURCE_ID) as GeoJSONSource | undefined;
  source?.setData(rectBoundsToFeature(bounds));
};

/** Remove the rectangle layers + source. Safe to call when nothing is drawn. */
export const removeRectLayers = (map: MapLibreMap): void => {
  if (map.getLayer(PREVIEW_LINE_LAYER_ID))
    map.removeLayer(PREVIEW_LINE_LAYER_ID);
  if (map.getLayer(PREVIEW_FILL_LAYER_ID))
    map.removeLayer(PREVIEW_FILL_LAYER_ID);
  if (map.getSource(PREVIEW_SOURCE_ID)) map.removeSource(PREVIEW_SOURCE_ID);
};

export interface RectDragHandlers {
  /** Current rectangle bounds (read at drag start / each move). */
  getBounds: () => RectBounds | null;
  /** Apply translated bounds (updates the source + the caller's own ref). */
  applyBounds: (bounds: RectBounds) => void;
  onDragStart?: () => void;
  onDragEnd?: (bounds: RectBounds) => void;
  /** Block dragging (e.g. while a print job is running). */
  isEnabled?: () => boolean;
}

/**
 * Make the rectangle draggable. Pressing on the fill grabs it; moving the
 * pointer translates the rectangle by the lng/lat delta (map panning is
 * suspended meanwhile); releasing re-fits the map to the new rectangle — the
 * same "drag then fitBounds" behavior as the Leaflet preview. Returns a
 * cleanup that detaches every listener.
 */
export const attachRectDrag = (
  map: MapLibreMap,
  handlers: RectDragHandlers
): (() => void) => {
  let dragging = false;
  let startLng = 0;
  let startLat = 0;

  const canvas = map.getCanvas();

  const onMove = (e: MapLayerMouseEvent) => {
    if (!dragging) return;
    const bounds = handlers.getBounds();
    if (!bounds) return;
    const dLng = e.lngLat.lng - startLng;
    const dLat = e.lngLat.lat - startLat;
    startLng = e.lngLat.lng;
    startLat = e.lngLat.lat;
    handlers.applyBounds({
      minLng: bounds.minLng + dLng,
      minLat: bounds.minLat + dLat,
      maxLng: bounds.maxLng + dLng,
      maxLat: bounds.maxLat + dLat,
    });
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    map.off("mousemove", onMove);
    map.dragPan.enable();
    canvas.style.cursor = "";
    const bounds = handlers.getBounds();
    if (bounds) handlers.onDragEnd?.(bounds);
  };

  const onDown = (e: MapLayerMouseEvent) => {
    if (handlers.isEnabled && !handlers.isEnabled()) return;
    // Suppress the map's own drag-pan while grabbing the rectangle.
    e.preventDefault();
    dragging = true;
    startLng = e.lngLat.lng;
    startLat = e.lngLat.lat;
    map.dragPan.disable();
    handlers.onDragStart?.();
    map.on("mousemove", onMove);
    map.once("mouseup", onUp);
  };

  const onEnter = () => {
    if (handlers.isEnabled && !handlers.isEnabled()) return;
    canvas.style.cursor = "grab";
  };
  const onLeave = () => {
    if (!dragging) canvas.style.cursor = "";
  };

  map.on("mousedown", PREVIEW_FILL_LAYER_ID, onDown);
  map.on("mouseenter", PREVIEW_FILL_LAYER_ID, onEnter);
  map.on("mouseleave", PREVIEW_FILL_LAYER_ID, onLeave);

  return () => {
    map.off("mousedown", PREVIEW_FILL_LAYER_ID, onDown);
    map.off("mouseenter", PREVIEW_FILL_LAYER_ID, onEnter);
    map.off("mouseleave", PREVIEW_FILL_LAYER_ID, onLeave);
    map.off("mousemove", onMove);
    if (dragging) {
      map.dragPan.enable();
      canvas.style.cursor = "";
    }
  };
};

/** Attach a double-click-to-print handler on the rectangle. Returns cleanup. */
export const attachRectDblClick = (
  map: MapLibreMap,
  handler: () => void
): (() => void) => {
  const onDblClick = (e: MapLayerMouseEvent) => {
    // Stop the map from zooming on the same double-click.
    e.preventDefault();
    handler();
  };
  map.on("dblclick", PREVIEW_FILL_LAYER_ID, onDblClick);
  return () => {
    map.off("dblclick", PREVIEW_FILL_LAYER_ID, onDblClick);
  };
};
