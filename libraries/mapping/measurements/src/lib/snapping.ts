import type { Map as MaplibreMap, MapGeoJSONFeature } from "maplibre-gl";
import type { Position } from "geojson";

// Geographic coordinate, lng-then-lat (GeoJSON convention).
type LngLat = [number, number];

interface ScreenPoint {
  x: number;
  y: number;
}

// Identifying the kind of snap is useful for future visual differentiation
// (e.g. a different dot for vertex vs. edge). Not used by terra-draw itself.
export type SnapKind = "vertex" | "edge";

export interface SnapHit {
  position: LngLat;
  kind: SnapKind;
}

// Layer ids whose render targets we never want to treat as snap candidates,
// regardless of metadata flags. Terra-draw's own draft renders are excluded
// so a vertex being drawn doesn't snap to itself; our label symbols have
// no useful coords; the snap-related helper layers are added by other
// consumers and we don't want to chase our own tail.
const ALWAYS_EXCLUDED_PREFIXES = [
  "td-", // terra-draw adapter layers
  "carma-measurements-", // our own helper layers (labels, future preview/radius)
];

// Symbol layers ARE valid snap targets — many CARMA datasets render points
// as icons (leuchten, masten, POI, etc.); maplibre's queryRenderedFeatures
// returns the underlying source feature with its Point geometry, which is
// exactly the coordinate we want to snap to.
const SNAPPABLE_LAYER_TYPES = new Set([
  "line",
  "fill",
  "fill-extrusion",
  "circle",
  "symbol",
]);

// Snap-mode controls how candidate layers are selected. Hosts pick one based
// on how much UI they want to expose:
//
// - "opt-out": every geometry-bearing layer participates unless it carries
//   metadata.carmaConf.skipSnapping === true. The simplest mode and the one
//   belis ships today.
// - "derived-opt-in": only layers belonging to a "curated" source. A source
//   is curated iff at least one of its layers ships skipSnapping === true
//   (read as: the style author thought about snapping for this source, so the
//   non-skipSnapping layers in it are intentional snap targets). Sources
//   without any skipSnapping flag are excluded entirely.
// - "explicit": the host picks per libreLayer via `optedInLayerIds`. Layer
//   ownership is read from metadata["layer-id"] which styleBuilder writes on
//   every merged layer (= the libreLayer's `name`, or `bg-<layerName>` for
//   vector backgrounds). `backgroundSnapping` toggles whether `bg-*` owner
//   layers participate.
export type SnapMode = "opt-out" | "derived-opt-in" | "explicit";

interface MaybeMetadata {
  metadata?: unknown;
}

function hasSkipSnapping(layer: MaybeMetadata): boolean {
  const meta = layer.metadata as
    | { carmaConf?: { skipSnapping?: boolean } }
    | undefined;
  return meta?.carmaConf?.skipSnapping === true;
}

/** Read the styleBuilder-injected `metadata["layer-id"]` that identifies which
 * libreLayer a merged map layer originated from. Empirically the value is
 * the libreLayer's `name` for data layers, or `bg-<layerName>` for vector
 * backgrounds. Layers without the metadata are pure built-ins (terra-draw /
 * our overlay layers) and are already excluded by the prefix filter. */
export function getOwnerLayerId(layer: MaybeMetadata): string | undefined {
  const meta = layer.metadata as { "layer-id"?: unknown } | undefined;
  const v = meta?.["layer-id"];
  return typeof v === "string" ? v : undefined;
}

/** A layer with no owner-id, or whose owner-id starts with `bg-`, is treated
 * as part of the basemap (controlled separately by `backgroundSnapping` in
 * explicit mode). */
export function isBackgroundOwner(owner: string | undefined): boolean {
  return owner === undefined || owner.startsWith("bg-");
}

const EMPTY_OPTED_IN_LAYER_IDS: ReadonlySet<string> = new Set();

/** Return rendered-layer ids on the current style that should be treated as
 * snap candidates under the chosen policy. The base filter is shared across
 * all modes (geometry-bearing layer type, not a built-in overlay/td-* layer,
 * not flagged skipSnapping); modes layer additional restrictions on top.
 * Returns `[]` when the style isn't ready — caller treats that as "no snap
 * candidates this frame". */
export function getSnappableLayerIds(
  map: MaplibreMap,
  mode: SnapMode,
  optedInLayerIds: ReadonlySet<string>,
  backgroundSnapping: boolean
): string[] {
  let style: ReturnType<MaplibreMap["getStyle"]>;
  try {
    style = map.getStyle();
  } catch {
    return [];
  }
  const layers = style?.layers ?? [];

  let curatedSources: Set<string> | null = null;
  if (mode === "derived-opt-in") {
    curatedSources = new Set<string>();
    for (const layer of layers) {
      if (!hasSkipSnapping(layer)) continue;
      const source = (layer as { source?: string }).source ?? "__no-source__";
      curatedSources.add(source);
    }
  }

  const ids: string[] = [];
  for (const layer of layers) {
    if (!SNAPPABLE_LAYER_TYPES.has(layer.type)) continue;
    if (ALWAYS_EXCLUDED_PREFIXES.some((p) => layer.id.startsWith(p))) continue;
    if (hasSkipSnapping(layer)) continue;
    if (mode === "derived-opt-in") {
      const source = (layer as { source?: string }).source ?? "__no-source__";
      if (!curatedSources!.has(source)) continue;
    } else if (mode === "explicit") {
      const owner = getOwnerLayerId(layer);
      if (isBackgroundOwner(owner)) {
        if (!backgroundSnapping) continue;
      } else if (!optedInLayerIds.has(owner!)) {
        continue;
      }
    }
    ids.push(layer.id);
  }
  return ids;
}

/** Convenience alias for `getSnappableLayerIds(map, "opt-out", ∅, false)`.
 * Kept as the call shape used by the lib's `MeasurementHost` so the existing
 * belis-desktop output is unchanged by the introduction of snap modes. */
export function getOptOutSnappableLayerIds(map: MaplibreMap): string[] {
  return getSnappableLayerIds(map, "opt-out", EMPTY_OPTED_IN_LAYER_IDS, false);
}

function pixelDistance(a: ScreenPoint, b: ScreenPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function* iterateCoords(
  geom: MapGeoJSONFeature["geometry"]
): Generator<LngLat> {
  switch (geom.type) {
    case "Point":
      yield geom.coordinates as LngLat;
      return;
    case "MultiPoint":
    case "LineString":
      for (const c of geom.coordinates) yield c as LngLat;
      return;
    case "MultiLineString":
    case "Polygon":
      for (const ring of geom.coordinates) {
        for (const c of ring) yield c as LngLat;
      }
      return;
    case "MultiPolygon":
      for (const poly of geom.coordinates) {
        for (const ring of poly) {
          for (const c of ring) yield c as LngLat;
        }
      }
      return;
    default:
      return;
  }
}

function* iterateSegments(
  geom: MapGeoJSONFeature["geometry"]
): Generator<[LngLat, LngLat]> {
  const yieldRing = function* (
    ring: Position[]
  ): Generator<[LngLat, LngLat]> {
    for (let i = 0; i < ring.length - 1; i++) {
      yield [ring[i] as LngLat, ring[i + 1] as LngLat];
    }
  };

  switch (geom.type) {
    case "LineString":
      yield* yieldRing(geom.coordinates);
      return;
    case "MultiLineString":
      for (const ls of geom.coordinates) yield* yieldRing(ls);
      return;
    case "Polygon":
      for (const ring of geom.coordinates) yield* yieldRing(ring);
      return;
    case "MultiPolygon":
      for (const poly of geom.coordinates) {
        for (const ring of poly) yield* yieldRing(ring);
      }
      return;
    default:
      return;
  }
}

/** Closest point on segment AB to P, all in screen space. Returns the
 * position interpolated back to lng/lat. Linear blend is sub-pixel-correct
 * at the zoom levels measurement consumers care about; no turf needed. */
function closestPointOnSegment(
  map: MaplibreMap,
  a: LngLat,
  b: LngLat,
  pointerScreen: ScreenPoint
): { position: LngLat; pixelDistance: number } | null {
  const aScreen = map.project(a);
  const bScreen = map.project(b);
  const ax = aScreen.x;
  const ay = aScreen.y;
  const bx = bScreen.x;
  const by = bScreen.y;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return null; // degenerate segment
  let t =
    ((pointerScreen.x - ax) * dx + (pointerScreen.y - ay) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const projectedScreen = { x: ax + t * dx, y: ay + t * dy };
  const dist = pixelDistance(projectedScreen, pointerScreen);
  const lng = a[0] + t * (b[0] - a[0]);
  const lat = a[1] + t * (b[1] - a[1]);
  return { position: [lng, lat], pixelDistance: dist };
}

/** Two-pass snap: find the closest vertex within `radiusPx`; if none, fall
 * back to the closest point on any edge. Returns null when nothing is in
 * range. `layerIds` is the curated candidate set built once per attach() /
 * style.load via getOptOutSnappableLayerIds. */
export function findSnapTarget(
  map: MaplibreMap,
  pointerScreen: ScreenPoint,
  radiusPx: number,
  layerIds: string[]
): SnapHit | null {
  if (layerIds.length === 0) return null;

  const bbox: [[number, number], [number, number]] = [
    [pointerScreen.x - radiusPx, pointerScreen.y - radiusPx],
    [pointerScreen.x + radiusPx, pointerScreen.y + radiusPx],
  ];

  let candidates: MapGeoJSONFeature[];
  try {
    candidates = map.queryRenderedFeatures(bbox, { layers: layerIds });
  } catch {
    // Style mid-swap or layer ids stale — recover next frame.
    return null;
  }
  if (candidates.length === 0) return null;

  // Pass 1: vertex.
  let bestVertex: { position: LngLat; pixelDistance: number } | null = null;
  for (const feature of candidates) {
    for (const coord of iterateCoords(feature.geometry)) {
      const screen = map.project(coord);
      const d = pixelDistance(screen, pointerScreen);
      if (d > radiusPx) continue;
      if (bestVertex === null || d < bestVertex.pixelDistance) {
        bestVertex = { position: coord, pixelDistance: d };
      }
    }
  }
  if (bestVertex !== null) {
    return { position: bestVertex.position, kind: "vertex" };
  }

  // Pass 2: edge.
  let bestEdge: { position: LngLat; pixelDistance: number } | null = null;
  for (const feature of candidates) {
    for (const [a, b] of iterateSegments(feature.geometry)) {
      const hit = closestPointOnSegment(map, a, b, pointerScreen);
      if (hit === null) continue;
      if (hit.pixelDistance > radiusPx) continue;
      if (bestEdge === null || hit.pixelDistance < bestEdge.pixelDistance) {
        bestEdge = hit;
      }
    }
  }
  if (bestEdge !== null) {
    return { position: bestEdge.position, kind: "edge" };
  }
  return null;
}
