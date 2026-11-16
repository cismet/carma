import maplibregl from "maplibre-gl";
import type { MapGeoJSONFeature, Map as MaplibreMap } from "maplibre-gl";

import { registerClickHitProvider } from "./clickHitProviders";
import { isSelectableHit } from "./selectableHits";
import { zoom256as512 } from "./zoomUtils";

/**
 * Selecting an object the way a click on it does.
 *
 * The object is clicked, so the map answers as it does for any click: the
 * engine's selection with highlight and info box, and whatever the host runs
 * off clicks (feature info for WMS layers, say). The click names the object
 * through the engine's click hit providers (`registerClickHitProvider`), so it
 * does not have to be on top: a layer drawn over it at that point is passed
 * over.
 */

export type RenderedFeatureRequest = {
  lat: number;
  lng: number;
  /** Leaflet scale; the map moves there first when given or out of view */
  zoom?: number;
  /** catalog id of the object's layer (`carma-layer-id` or `layer-id`) */
  layerId?: string;
  /** property values the object must have, compared as trimmed strings */
  where?: Record<string, string | number>;
};

export type RenderedFeatureClick = {
  /** where the click went */
  clicked: { lat: number; lng: number };
  /** catalog id of the clicked object's layer, when it could be told */
  layerId: string | null;
};

/** the map zoom to select at when the point is out of view, Leaflet scale */
const DEFAULT_SELECT_ZOOM = 17;
const SETTLE_TIMEOUT_MS = 15_000;
const LAYER_ON_MAP_TIMEOUT_MS = 10_000;
const POLL_MS = 100;
/** grid of click candidates over an area object's on-screen box */
const GRID_STEPS = 7;
/** a symbol sits above its own coordinate: rings around a point object */
const RING_OFFSETS: Array<[number, number]> = [
  [0, 0],
  ...[7, 14, 21].flatMap((radius) =>
    Array.from({ length: 8 }, (_, step): [number, number] => {
      const angle = (step / 8) * 2 * Math.PI;
      return [
        Math.round(Math.cos(angle) * radius),
        Math.round(Math.sin(angle) * radius),
      ];
    })
  ),
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const waitFor = async (check: () => boolean, timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() >= deadline) {
      return false;
    }
    await sleep(POLL_MS);
  }
  return true;
};

/** the map has stopped moving and drawn what it is going to draw */
const settle = async (map: MaplibreMap) => {
  // a fly may begin a frame later
  await sleep(POLL_MS);
  await waitFor(() => !map.isMoving(), SETTLE_TIMEOUT_MS);
  if (map.isStyleLoaded() && map.areTilesLoaded()) {
    return;
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, SETTLE_TIMEOUT_MS);
    map.once("idle", () => {
      clearTimeout(timer);
      resolve();
    });
  });
};

/** the catalog id and the style's own name of the layer a style layer belongs to */
const layerIdsOf = (metadata: unknown): string[] => {
  if (!isRecord(metadata)) {
    return [];
  }
  return ["carma-layer-id", "layer-id"]
    .map((key) => metadata[key])
    .filter((id): id is string => typeof id === "string");
};

const catalogIdOf = (hit: MapGeoJSONFeature): string | null => {
  const metadata: unknown = hit.layer.metadata;
  if (!isRecord(metadata)) {
    return null;
  }
  const id = metadata["carma-layer-id"] ?? metadata["layer-id"];
  return typeof id === "string" ? id : null;
};

const hasProperties = (
  hit: MapGeoJSONFeature,
  where: Record<string, string | number>
) =>
  Object.entries(where).every(([key, value]) => {
    const actual: unknown = hit.properties[key];
    return (
      (typeof actual === "string" || typeof actual === "number") &&
      String(actual).trim() === String(value).trim()
    );
  });

const matcher =
  (
    layerId: string | undefined,
    where: Record<string, string | number> | undefined
  ) =>
  (hit: MapGeoJSONFeature) =>
    (!layerId || layerIdsOf(hit.layer.metadata).includes(layerId)) &&
    (!where || hasProperties(hit, where));

/** every coordinate of a GeoJSON geometry, flat */
const coordinatesOf = (geometry: GeoJSON.Geometry): Array<[number, number]> => {
  switch (geometry.type) {
    case "Point":
      return [geometry.coordinates as [number, number]];
    case "MultiPoint":
    case "LineString":
      return geometry.coordinates as Array<[number, number]>;
    case "MultiLineString":
    case "Polygon":
      return geometry.coordinates.flat() as Array<[number, number]>;
    case "MultiPolygon":
      return geometry.coordinates.flat(2) as Array<[number, number]>;
    case "GeometryCollection":
      return geometry.geometries.flatMap(coordinatesOf);
    default:
      return [];
  }
};

/**
 * Pixels worth trying for one object: around a point object, or a grid over
 * the part of an area or line object that is on screen.
 */
const candidatesOf = (
  map: MaplibreMap,
  hit: MapGeoJSONFeature
): maplibregl.Point[] => {
  const pixels = coordinatesOf(hit.geometry).map((lngLat) =>
    map.project(lngLat)
  );
  if (pixels.length === 0) {
    return [];
  }
  if (hit.geometry.type === "Point") {
    const [center] = pixels;
    return RING_OFFSETS.map(
      ([dx, dy]) => new maplibregl.Point(center.x + dx, center.y + dy)
    );
  }
  const canvas = map.getCanvas();
  const xs = pixels.map(({ x }) => x);
  const ys = pixels.map(({ y }) => y);
  const left = Math.max(0, Math.min(...xs));
  const right = Math.min(canvas.clientWidth, Math.max(...xs));
  const top = Math.max(0, Math.min(...ys));
  const bottom = Math.min(canvas.clientHeight, Math.max(...ys));
  if (left > right || top > bottom) {
    return [];
  }
  const points = [new maplibregl.Point((left + right) / 2, (top + bottom) / 2)];
  for (let i = 1; i < GRID_STEPS; i++) {
    for (let j = 1; j < GRID_STEPS; j++) {
      points.push(
        new maplibregl.Point(
          left + ((right - left) * i) / GRID_STEPS,
          top + ((bottom - top) * j) / GRID_STEPS
        )
      );
    }
  }
  return points;
};

const onCanvas = (map: MaplibreMap, point: maplibregl.Point) => {
  const canvas = map.getCanvas();
  return (
    point.x >= 0 &&
    point.y >= 0 &&
    point.x <= canvas.clientWidth &&
    point.y <= canvas.clientHeight
  );
};

type ClickPoint = {
  point: maplibregl.Point;
  /** the object to select, drawn at `point` */
  hit: MapGeoJSONFeature;
  /** every selectable hit at `point`, topmost first, `hit` among them */
  drawnHere: MapGeoJSONFeature[];
};

/**
 * The first candidate at which a matching object is the topmost selectable
 * hit, else one where it is drawn under something else, else null. Either
 * selects it (`clickAs`); a point where it is on top merely matches what a
 * click by hand there would show.
 */
const findClickPoint = (
  map: MaplibreMap,
  isTarget: (hit: MapGeoJSONFeature) => boolean,
  candidates: maplibregl.Point[]
): ClickPoint | null => {
  let buried: ClickPoint | null = null;
  for (const point of candidates) {
    if (!onCanvas(map, point)) {
      continue;
    }
    let drawnHere: MapGeoJSONFeature[] = [];
    try {
      drawnHere = map.queryRenderedFeatures(point).filter(isSelectableHit);
    } catch {
      // the style changed under the query; the next point tries again
      continue;
    }
    const target = drawnHere.find(isTarget);
    if (!target) {
      continue;
    }
    if (drawnHere[0] === target) {
      return { point, hit: target, drawnHere };
    }
    buried = buried ?? { point, hit: target, drawnHere };
  }
  return buried;
};

const distanceSquared = (a: maplibregl.Point, b: maplibregl.Point) =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

const fireClick = (map: MaplibreMap, point: maplibregl.Point) => {
  map.fire("click", {
    lngLat: map.unproject(point),
    point,
    // the map's own handlers read modifier keys off this; a click that
    // carries none is a plain click, which is what this is
    originalEvent: new MouseEvent("click"),
  });
};

/**
 * A click at the point that stands for one object: the engine asks its click
 * hit providers before it queries the map, and this one answers with the
 * object first and the rest of what is drawn there after it. Answers only
 * this click, so a click by hand in between is left alone.
 */
const clickAs = (map: MaplibreMap, { point, hit, drawnHere }: ClickPoint) => {
  let answered = false;
  const unregister = registerClickHitProvider(map, (asked) => {
    if (answered || asked.x !== point.x || asked.y !== point.y) {
      return null;
    }
    answered = true;
    return [hit, ...drawnHere.filter((other) => other !== hit)];
  });
  try {
    fireClick(map, point);
  } finally {
    unregister();
  }
};

/**
 * Clicks the object the request names. Without `layerId` and `where` the
 * click goes to the point itself; with them, to the matching object nearest
 * to the point. Rejects when the layer is not drawn, nothing in view matches,
 * or the matching object cannot be clicked in view. Returns once the click is
 * fired; what the host shows for it follows on its own time.
 */
export const selectRenderedFeature = async (
  map: MaplibreMap,
  { lat, lng, zoom, layerId, where }: RenderedFeatureRequest
): Promise<RenderedFeatureClick> => {
  if (layerId) {
    // a layer added just before may need a moment to reach the style
    const onMap = await waitFor(
      () =>
        (map.getStyle()?.layers ?? []).some((styleLayer) =>
          layerIdsOf(styleLayer.metadata).includes(layerId)
        ),
      LAYER_ON_MAP_TIMEOUT_MS
    );
    if (!onMap) {
      throw new Error(
        `layer "${layerId}" is not drawn on the map; it may be a raster (WMS) layer, which can only be selected by point: leave layerId and where out`
      );
    }
  }

  if (zoom !== undefined || !map.getBounds().contains([lng, lat])) {
    map.flyTo({
      center: [lng, lat],
      zoom: zoom256as512(zoom ?? DEFAULT_SELECT_ZOOM),
    });
  }
  await settle(map);

  const target = map.project([lng, lat]);

  if (!layerId && !where) {
    if (!onCanvas(map, target)) {
      throw new Error("the point is not in view");
    }
    fireClick(map, target);
    return { clicked: { lat, lng }, layerId: null };
  }

  const isTarget = matcher(layerId, where);
  const matching = map
    .queryRenderedFeatures()
    .filter((hit) => isSelectableHit(hit) && isTarget(hit));
  if (matching.length === 0) {
    throw new Error(
      `nothing drawn in view matches${layerId ? ` layer "${layerId}"` : ""}${
        where ? ` with ${JSON.stringify(where)}` : ""
      }; check the property names with a plain select at the point`
    );
  }
  // nearest first, by the distance of each object's first vertex
  const ranked = matching
    .map((hit) => ({ hit, candidates: candidatesOf(map, hit) }))
    .filter(({ candidates }) => candidates.length > 0)
    .sort(
      (a, b) =>
        distanceSquared(a.candidates[0], target) -
        distanceSquared(b.candidates[0], target)
    );
  const found = findClickPoint(map, isTarget, [
    target,
    ...ranked.flatMap(({ candidates }) => candidates),
  ]);
  if (!found) {
    throw new Error("the object is in the data but not clickable in view");
  }
  clickAs(map, found);
  const clicked = map.unproject(found.point);
  return {
    clicked: { lat: clicked.lat, lng: clicked.lng },
    layerId: catalogIdOf(found.hit),
  };
};
