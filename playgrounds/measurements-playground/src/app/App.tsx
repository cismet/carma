import { useEffect, useMemo, useRef, useState } from "react";
import { CarmaMap } from "@carma-mapping/core";
import type { LibreLayer } from "@carma-mapping/core";
import { Control, ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { useLibreContext } from "@carma-mapping/engines/maplibre";
import { Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowPointer,
  faLocationDot,
  faSlash,
  faDrawPolygon,
  faTag,
  faMagnet,
} from "@fortawesome/free-solid-svg-icons";
import {
  TerraDraw,
  TerraDrawPointMode,
  TerraDrawLineStringMode,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
} from "terra-draw";
import type { GeoJSONStoreFeatures } from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import area from "@turf/area";
import length from "@turf/length";
import centroid from "@turf/centroid";
import type { Feature, FeatureCollection, Point, Position } from "geojson";
import type { GeoJSONSource } from "maplibre-gl";
import Menu from "./Menu";

type DrawMode = "none" | "select" | "point" | "line" | "polygon";

const DRAW_MODE_BUTTONS: {
  mode: Exclude<DrawMode, "none">;
  label: string;
  icon: typeof faLocationDot;
}[] = [
  { mode: "select", label: "Auswählen / bearbeiten", icon: faArrowPointer },
  { mode: "point", label: "Punkt zeichnen", icon: faLocationDot },
  { mode: "line", label: "Linie zeichnen", icon: faSlash },
  { mode: "polygon", label: "Polygon zeichnen", icon: faDrawPolygon },
];

const APP_KEY = "measurements-playground-maplibre";
const LS_VECTOR_STYLES_KEY = `${APP_KEY}:vector-styles`;
const LS_LABELS_VISIBLE_KEY = `${APP_KEY}:labels-visible`;
const LS_SNAPPING_ENABLED_KEY = `${APP_KEY}:snapping-enabled`;
const LS_RADIUS_DEBUG_KEY = `${APP_KEY}:snap-radius-debug`;
const LS_SNAP_RADIUS_PX_KEY = `${APP_KEY}:snap-radius-px`;
const LS_SNAP_MODE_KEY = `${APP_KEY}:snap-mode`;
const LS_BG_SNAPPING_KEY = `${APP_KEY}:bg-snapping`;

// "opt-out": every style layer is a snap candidate unless flagged
//   metadata.carmaConf.skipSnapping = true. Means basemap.de geometry
//   participates too, often surprising in a measurement context.
// "derived-opt-in": only sources that ship at least one skipSnapping flag
//   somewhere are treated as curated snap targets. Non-skipSnapping layers
//   in those sources are snappable; everything else (including basemap.de
//   layers, which never carry skipSnapping) is excluded. Mirrors the
//   legacy "snappingLayers" curation pattern at the source level.
// "explicit": user picks per loaded libreLayer (via a checkbox in the
//   layer list) and decides separately whether basemap.de / built-in
//   layers participate via a "background snapping" checkbox. Loaded
//   libreLayer membership is read from `metadata["layer-id"]` which
//   StyleComposer injects on every namespaced layer (slugifyUrl(styleUrl)).
type SnapMode = "opt-out" | "derived-opt-in" | "explicit";
const SNAP_MODE_DEFAULT: SnapMode = "derived-opt-in";
const BG_SNAPPING_DEFAULT = false;
const SERVER_URL_TOKEN = "__SERVER_URL__";
const SERVER_URL_REPLACEMENT = "https://tiles.cismet.de";

const LABEL_SOURCE_ID = "measurements-labels";
const LABEL_LAYER_ID = "measurements-labels-symbols";
const SNAP_PREVIEW_SOURCE_ID = "measurements-snap-preview";
const SNAP_PREVIEW_LAYER_ID = "measurements-snap-preview-circle";
const SNAP_RADIUS_SOURCE_ID = "measurements-snap-radius";
const SNAP_RADIUS_LAYER_ID = "measurements-snap-radius-circle";
// Default screen-px radius around the cursor we search for snap candidates.
// Adjustable at runtime via the overlay slider.
const SNAP_RADIUS_PX_DEFAULT = 20;
const SNAP_RADIUS_PX_MIN = 5;
const SNAP_RADIUS_PX_MAX = 80;

const QUICK_LOAD_LINKS: { label: string; url: string }[] = [
  { label: "POIs", url: "https://tiles.cismet.de/poi/style.json" },
  {
    label: "ALKIS",
    url: "https://tiles.cismet.de/alkis/flurstuecke.black.style.json",
  },
];

type StoredVectorStyle =
  | { kind: "url"; name: string; url: string; snapping?: boolean }
  | { kind: "inline"; name: string; data: unknown; snapping?: boolean };

interface ResolvedVectorStyle {
  name: string;
  /** Either the original remote URL, or a Blob URL for inline JSON. */
  styleUrl: string;
  /** Set when styleUrl is a Blob URL we own and must revoke on cleanup. */
  blobUrl?: string;
  /** Matches `metadata["layer-id"]` that styleBuilder writes onto every
   *  layer added from this libreLayer's style.json. Empirically that is
   *  just the libreLayer's `name` (see `libraries/mapping/engines/maplibre/
   *  src/utils/styleBuilder.ts:492` for the merged-mode path: `layerId =
   *  capabilitiesLayer || layer.name`). Vector backgrounds carry a `bg-`
   *  prefixed name (see `LibreMap.tsx:491`) which we treat as "background"
   *  in explicit-snap mode. */
  layerId: string;
  /** User opt-in flag for explicit snap mode. Default true; only matters
   *  when SnapMode === "explicit". */
  snapping: boolean;
}

function deriveStyleName(url: string, fallbackIndex: number): string {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);
    const tail = segments[segments.length - 1] ?? "";
    const parent = segments[segments.length - 2] ?? "";
    if (tail && parent) return `${parent}/${tail}`;
    if (tail) return tail;
  } catch {
    // not a URL we can parse, fall through
  }
  return `layer-${fallbackIndex + 1}`;
}

function deriveInlineName(
  data: unknown,
  fileName: string,
  fallbackIndex: number
): string {
  if (
    data &&
    typeof data === "object" &&
    "name" in data &&
    typeof (data as { name: unknown }).name === "string"
  ) {
    return (data as { name: string }).name;
  }
  return fileName || `inline-layer-${fallbackIndex + 1}`;
}

function loadStoredVectorStyles(): StoredVectorStyle[] {
  try {
    const raw = localStorage.getItem(LS_VECTOR_STYLES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is StoredVectorStyle =>
        entry &&
        typeof entry === "object" &&
        (entry.kind === "url" || entry.kind === "inline")
    );
  } catch (e) {
    console.warn("[measurements-playground] failed to read stored styles", e);
    return [];
  }
}

function persistVectorStyles(styles: StoredVectorStyle[]) {
  try {
    localStorage.setItem(LS_VECTOR_STYLES_KEY, JSON.stringify(styles));
  } catch (e) {
    console.warn("[measurements-playground] failed to persist styles", e);
  }
}

function inlineDataToBlobUrl(data: unknown): string {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  return URL.createObjectURL(blob);
}

function loadLabelsVisible(): boolean {
  try {
    const raw = localStorage.getItem(LS_LABELS_VISIBLE_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

function persistLabelsVisible(value: boolean) {
  try {
    localStorage.setItem(LS_LABELS_VISIBLE_KEY, value ? "1" : "0");
  } catch (e) {
    console.warn("[measurements-playground] failed to persist labels flag", e);
  }
}

function loadSnappingEnabled(): boolean {
  try {
    const raw = localStorage.getItem(LS_SNAPPING_ENABLED_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

function persistSnappingEnabled(value: boolean) {
  try {
    localStorage.setItem(LS_SNAPPING_ENABLED_KEY, value ? "1" : "0");
  } catch (e) {
    console.warn(
      "[measurements-playground] failed to persist snapping flag",
      e
    );
  }
}

function loadRadiusDebug(): boolean {
  try {
    const raw = localStorage.getItem(LS_RADIUS_DEBUG_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

function persistRadiusDebug(value: boolean) {
  try {
    localStorage.setItem(LS_RADIUS_DEBUG_KEY, value ? "1" : "0");
  } catch {
    // ignore
  }
}

function clampSnapRadius(px: number): number {
  if (!Number.isFinite(px)) return SNAP_RADIUS_PX_DEFAULT;
  return Math.max(SNAP_RADIUS_PX_MIN, Math.min(SNAP_RADIUS_PX_MAX, Math.round(px)));
}

function loadSnapRadiusPx(): number {
  try {
    const raw = localStorage.getItem(LS_SNAP_RADIUS_PX_KEY);
    if (raw === null) return SNAP_RADIUS_PX_DEFAULT;
    return clampSnapRadius(Number.parseInt(raw, 10));
  } catch {
    return SNAP_RADIUS_PX_DEFAULT;
  }
}

function persistSnapRadiusPx(value: number) {
  try {
    localStorage.setItem(LS_SNAP_RADIUS_PX_KEY, String(clampSnapRadius(value)));
  } catch {
    // ignore
  }
}

function loadSnapMode(): SnapMode {
  try {
    const raw = localStorage.getItem(LS_SNAP_MODE_KEY);
    if (raw === "opt-out" || raw === "derived-opt-in") return raw;
    return SNAP_MODE_DEFAULT;
  } catch {
    return SNAP_MODE_DEFAULT;
  }
}

function persistSnapMode(value: SnapMode) {
  try {
    localStorage.setItem(LS_SNAP_MODE_KEY, value);
  } catch {
    // ignore
  }
}

function loadBackgroundSnapping(): boolean {
  try {
    const raw = localStorage.getItem(LS_BG_SNAPPING_KEY);
    if (raw === null) return BG_SNAPPING_DEFAULT;
    return raw === "1";
  } catch {
    return BG_SNAPPING_DEFAULT;
  }
}

function persistBackgroundSnapping(value: boolean) {
  try {
    localStorage.setItem(LS_BG_SNAPPING_KEY, value ? "1" : "0");
  } catch {
    // ignore
  }
}

// Walk every coordinate in a GeoJSON geometry. Used for vertex-snapping
// (the primary snap level — see findSnapTarget).
function iterateGeomCoords(
  geom: GeoJSON.Geometry,
  fn: (c: GeoJSON.Position) => void
): void {
  switch (geom.type) {
    case "Point":
      fn(geom.coordinates);
      return;
    case "MultiPoint":
    case "LineString":
      for (const c of geom.coordinates) fn(c);
      return;
    case "MultiLineString":
    case "Polygon":
      for (const ring of geom.coordinates) for (const c of ring) fn(c);
      return;
    case "MultiPolygon":
      for (const poly of geom.coordinates)
        for (const ring of poly) for (const c of ring) fn(c);
      return;
    case "GeometryCollection":
      for (const g of geom.geometries) iterateGeomCoords(g, fn);
      return;
  }
}

// Walk consecutive coordinate pairs (segments) of a GeoJSON geometry. Used
// for the secondary snap level (closest point on edge). Yields nothing for
// Point/MultiPoint; for closed polygon rings the closing pair is yielded
// naturally because GeoJSON repeats first === last.
function* iterateGeomSegments(
  geom: GeoJSON.Geometry
): Generator<[GeoJSON.Position, GeoJSON.Position]> {
  switch (geom.type) {
    case "Point":
    case "MultiPoint":
      return;
    case "LineString": {
      const cs = geom.coordinates;
      for (let i = 0; i < cs.length - 1; i++) yield [cs[i], cs[i + 1]];
      return;
    }
    case "MultiLineString":
    case "Polygon": {
      for (const ring of geom.coordinates) {
        for (let i = 0; i < ring.length - 1; i++) yield [ring[i], ring[i + 1]];
      }
      return;
    }
    case "MultiPolygon": {
      for (const poly of geom.coordinates) {
        for (const ring of poly) {
          for (let i = 0; i < ring.length - 1; i++) yield [ring[i], ring[i + 1]];
        }
      }
      return;
    }
    case "GeometryCollection":
      for (const g of geom.geometries) yield* iterateGeomSegments(g);
      return;
  }
}

// Project A and B to screen px, clamp the parametric position t to [0, 1],
// and return the closest point on segment AB to the cursor — or null if
// outside `radiusPx` or if AB is degenerate (A === B in screen px). The
// returned lng/lat is a linear blend of A/B, which is approximate on a
// curved surface but sub-pixel at the zoom levels this playground cares
// about. Cheap enough that we don't pull in turf.
function findClosestPointOnSegment(
  map: maplibregl.Map,
  cursor: { x: number; y: number },
  a: GeoJSON.Position,
  b: GeoJSON.Position,
  radiusPx: number
): { coord: GeoJSON.Position; distSq: number } | null {
  const pa = map.project({ lng: a[0], lat: a[1] });
  const pb = map.project({ lng: b[0], lat: b[1] });
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return null;
  let t = ((cursor.x - pa.x) * dx + (cursor.y - pa.y) * dy) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const px = pa.x + t * dx;
  const py = pa.y + t * dy;
  const ex = cursor.x - px;
  const ey = cursor.y - py;
  const distSq = ex * ex + ey * ey;
  if (distSq > radiusPx * radiusPx) return null;
  const lng = a[0] + t * (b[0] - a[0]);
  const lat = a[1] + t * (b[1] - a[1]);
  return { coord: [lng, lat], distSq };
}

// Local exclusions: terra-draw's own layers (`td-*`, handled separately by
// TD's built-in toCoordinate / toLine snapping) plus our own overlay layers
// (label / snap-dot / snap-radius — the cursor must not snap to itself).
function isLocallyExcludedSnapLayer(layerId: string): boolean {
  if (layerId.startsWith("td-")) return true;
  if (layerId === LABEL_LAYER_ID) return true;
  if (layerId === SNAP_PREVIEW_LAYER_ID) return true;
  if (layerId === SNAP_RADIUS_LAYER_ID) return true;
  return false;
}

// Read `metadata.carmaConf.skipSnapping` off a maplibre style layer (the
// carma-wide convention used e.g. by ALKIS to opt label / fill / arrow
// sublayers out of snap-target queries).
function hasSkipSnapping(layer: maplibregl.LayerSpecification): boolean {
  const meta = (layer as { metadata?: unknown }).metadata as
    | { carmaConf?: { skipSnapping?: boolean } }
    | undefined;
  return meta?.carmaConf?.skipSnapping === true;
}

// Read the styleBuilder-injected "layer-id" metadata that identifies which
// libreLayer a merged map layer came from. Empirically the value is the
// libreLayer's `name` (data layers) or `bg-<layerName>` (vector backgrounds
// loaded via `LibreMap.tsx:491`). Layers without the metadata are pure
// built-ins (terra-draw / our overlay layers); they're already excluded by
// `isLocallyExcludedSnapLayer` so callers don't need to special-case them.
function getOwnerLayerId(
  layer: maplibregl.LayerSpecification
): string | undefined {
  const meta = (layer as { metadata?: unknown }).metadata as
    | { "layer-id"?: unknown }
    | undefined;
  const v = meta?.["layer-id"];
  return typeof v === "string" ? v : undefined;
}

function isBackgroundOwner(owner: string | undefined): boolean {
  return owner === undefined || owner.startsWith("bg-");
}

// Build the list of layer ids eligible for snap-target queryRenderedFeatures.
// Three strategies, controlled by `mode`:
//
// - "opt-out": every layer in the merged style participates unless flagged
//   skipSnapping or locally excluded (terra-draw / our own overlays). The
//   cursor will snap to basemap.de geometry too.
// - "derived-opt-in": only layers belonging to a "curated" source. A source
//   is curated iff at least one of its layers in the merged style ships
//   skipSnapping = true (interpreted as: the style author thought about
//   snapping for this source, so the non-skipSnapping layers in it are
//   intentional snap targets). Sources without any skipSnapping flag (e.g.
//   basemap.de, today's POI style) are excluded entirely.
// - "explicit": user picks per libreLayer via the loaded-layers list.
//   Membership read from metadata["layer-id"] which styleBuilder writes on
//   every layer (= the libreLayer's `name`, or `bg-<layerName>` for the
//   vector background). The `optedInLayerIds` set holds the names of every
//   libreLayer the user ticked; `backgroundSnapping` controls whether
//   layers whose owner-id starts with `bg-` (basemap.de) participate too.
//
// Returns null when the style isn't ready — caller treats that as "no snap
// candidates available".
function getSnappableLayerIds(
  map: maplibregl.Map,
  mode: SnapMode,
  optedInLayerIds: Set<string>,
  backgroundSnapping: boolean
): string[] | null {
  const style = map.getStyle();
  if (!style || !style.layers) return null;
  const layers = style.layers;
  const layerSource = (layer: maplibregl.LayerSpecification): string =>
    (layer as { source?: string }).source ?? "__no-source__";

  let curatedSources: Set<string> | null = null;
  if (mode === "derived-opt-in") {
    curatedSources = new Set<string>();
    for (const layer of layers) {
      if (hasSkipSnapping(layer)) curatedSources.add(layerSource(layer));
    }
  }

  const ids: string[] = [];
  for (const layer of layers) {
    if (hasSkipSnapping(layer)) continue;
    if (isLocallyExcludedSnapLayer(layer.id)) continue;
    if (mode === "derived-opt-in") {
      if (!curatedSources!.has(layerSource(layer))) continue;
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

// Find the nearest snap target to the cursor within `radiusPx`. Two passes
// over the same queryRenderedFeatures result: vertex first, then closest
// point on edge as fallback. Priority is vertex > edge > none — if any
// vertex is within the radius, the edge pass is skipped (a vertex on a
// segment endpoint must not produce an "edge snap" result). Caller passes
// the pre-computed snappable layer-id list (cached across mousemoves; see
// snappableLayerIdsRef in TerraDrawIntegration). Returns the snap coord in
// lng/lat, or null if no candidate is in range.
function findSnapTarget(
  map: maplibregl.Map,
  cursor: { x: number; y: number },
  radiusPx: number,
  allowedLayerIds: string[]
): GeoJSON.Position | null {
  if (allowedLayerIds.length === 0) return null;
  const r = radiusPx;
  const features = map.queryRenderedFeatures(
    [
      [cursor.x - r, cursor.y - r],
      [cursor.x + r, cursor.y + r],
    ],
    { layers: allowedLayerIds }
  );
  // Pass 1: vertex.
  let bestVertexCoord: GeoJSON.Position | null = null;
  let bestVertexDistSq = r * r + 1;
  for (const f of features) {
    iterateGeomCoords(f.geometry, (coord) => {
      const proj = map.project({ lng: coord[0], lat: coord[1] });
      const dx = proj.x - cursor.x;
      const dy = proj.y - cursor.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= r * r && distSq < bestVertexDistSq) {
        bestVertexDistSq = distSq;
        bestVertexCoord = [coord[0], coord[1]];
      }
    });
  }
  if (bestVertexCoord) return bestVertexCoord;
  // Pass 2: closest point on edge. Only runs when no vertex was in range.
  let bestSegmentCoord: GeoJSON.Position | null = null;
  let bestSegmentDistSq = r * r + 1;
  for (const f of features) {
    for (const [a, b] of iterateGeomSegments(f.geometry)) {
      const hit = findClosestPointOnSegment(map, cursor, a, b, r);
      if (hit && hit.distSq < bestSegmentDistSq) {
        bestSegmentDistSq = hit.distSq;
        bestSegmentCoord = hit.coord;
      }
    }
  }
  return bestSegmentCoord;
}

const lengthFormatter0 = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 0,
});
const lengthFormatter2 = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 2,
});

function formatLengthMeters(m: number): string {
  if (m < 1000) return `${lengthFormatter0.format(Math.round(m))} m`;
  return `${lengthFormatter2.format(m / 1000)} km`;
}

function formatAreaSquareMeters(m2: number): string {
  if (m2 < 10000) return `${lengthFormatter0.format(Math.round(m2))} m²`;
  return `${lengthFormatter2.format(m2 / 10000)} ha`;
}

function midpoint(a: Position, b: Position): Position {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function segmentLengthMeters(a: Position, b: Position): number {
  const seg: Feature = {
    type: "Feature",
    geometry: { type: "LineString", coordinates: [a, b] },
    properties: {},
  };
  return length(seg, { units: "meters" });
}

// Derive a FeatureCollection of label points (one per polygon centroid for
// area, plus one per segment-midpoint for length) from the current TerraDraw
// snapshot. Mirrors the original react-cismap measurement plugin's `showArea`
// + `showLength` behaviour.
function buildLabelFeatures(
  features: ReadonlyArray<Feature>
): FeatureCollection<Point> {
  const labels: Feature<Point>[] = [];
  for (const feature of features) {
    const geom = feature.geometry;
    if (geom.type === "Polygon") {
      const ring = geom.coordinates[0];
      if (ring && ring.length >= 2) {
        for (let i = 0; i < ring.length - 1; i++) {
          const meters = segmentLengthMeters(ring[i], ring[i + 1]);
          if (meters <= 0) continue;
          labels.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: midpoint(ring[i], ring[i + 1]) },
            properties: { kind: "segment", label: formatLengthMeters(meters) },
          });
        }
      }
      // Closed ring with at least 3 unique vertices ⇒ area is meaningful.
      if (ring && ring.length >= 4) {
        const polyArea = area(feature);
        if (polyArea > 0) {
          const c = centroid(feature);
          labels.push({
            type: "Feature",
            geometry: c.geometry,
            properties: { kind: "area", label: formatAreaSquareMeters(polyArea) },
          });
        }
      }
    } else if (geom.type === "LineString") {
      const coords = geom.coordinates;
      for (let i = 0; i < coords.length - 1; i++) {
        const meters = segmentLengthMeters(coords[i], coords[i + 1]);
        if (meters <= 0) continue;
        labels.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: midpoint(coords[i], coords[i + 1]) },
          properties: { kind: "segment", label: formatLengthMeters(meters) },
        });
      }
    }
  }
  return { type: "FeatureCollection", features: labels };
}

export function App() {
  const [storedStyles, setStoredStyles] = useState<StoredVectorStyle[]>(
    loadStoredVectorStyles
  );
  // UI-only for now: clicking a button sets the active mode; clicking the
  // already-active mode clears it. Not wired to any draw library yet.
  const [drawMode, setDrawMode] = useState<DrawMode>("none");
  const [labelsVisible, setLabelsVisible] = useState<boolean>(loadLabelsVisible);
  const [snappingEnabled, setSnappingEnabled] = useState<boolean>(
    loadSnappingEnabled
  );
  const [radiusDebugVisible, setRadiusDebugVisible] = useState<boolean>(
    loadRadiusDebug
  );
  const [snapRadiusPx, setSnapRadiusPx] = useState<number>(loadSnapRadiusPx);
  const [snapMode, setSnapMode] = useState<SnapMode>(loadSnapMode);
  const [backgroundSnapping, setBackgroundSnapping] = useState<boolean>(
    loadBackgroundSnapping
  );

  const toggleLabelsVisible = () =>
    setLabelsVisible((prev) => {
      const next = !prev;
      persistLabelsVisible(next);
      return next;
    });

  const toggleSnappingEnabled = () =>
    setSnappingEnabled((prev) => {
      const next = !prev;
      persistSnappingEnabled(next);
      return next;
    });

  const toggleRadiusDebug = () =>
    setRadiusDebugVisible((prev) => {
      const next = !prev;
      persistRadiusDebug(next);
      return next;
    });

  const updateSnapRadiusPx = (next: number) => {
    const clamped = clampSnapRadius(next);
    setSnapRadiusPx(clamped);
    persistSnapRadiusPx(clamped);
  };

  const updateSnapMode = (next: SnapMode) => {
    setSnapMode(next);
    persistSnapMode(next);
  };

  const toggleBackgroundSnapping = () =>
    setBackgroundSnapping((prev) => {
      const next = !prev;
      persistBackgroundSnapping(next);
      return next;
    });

  // Wipe everything we persist for this playground (loaded layers +
  // four UX prefs) and put state back to its defaults. Drawn features live
  // in terra-draw's in-memory store, not localStorage, so they're untouched.
  const resetAll = () => {
    try {
      localStorage.removeItem(LS_VECTOR_STYLES_KEY);
      localStorage.removeItem(LS_LABELS_VISIBLE_KEY);
      localStorage.removeItem(LS_SNAPPING_ENABLED_KEY);
      localStorage.removeItem(LS_RADIUS_DEBUG_KEY);
      localStorage.removeItem(LS_SNAP_RADIUS_PX_KEY);
      localStorage.removeItem(LS_SNAP_MODE_KEY);
      localStorage.removeItem(LS_BG_SNAPPING_KEY);
    } catch (e) {
      console.warn(
        "[measurements-playground] failed to clear stored preferences",
        e
      );
    }
    setStoredStyles([]);
    setLabelsVisible(true);
    setSnappingEnabled(true);
    setRadiusDebugVisible(true);
    setSnapRadiusPx(SNAP_RADIUS_PX_DEFAULT);
    setSnapMode(SNAP_MODE_DEFAULT);
    setBackgroundSnapping(BG_SNAPPING_DEFAULT);
  };

  // Resolve each stored entry to { name, styleUrl } and own the Blob URL lifecycle.
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const resolvedStyles = useMemo<ResolvedVectorStyle[]>(() => {
    const next: ResolvedVectorStyle[] = [];
    const used = new Set<string>();

    storedStyles.forEach((entry, idx) => {
      // Default missing snapping flag to true (existing entries pre-date it).
      const snapping = entry.snapping !== false;
      if (entry.kind === "url") {
        const styleUrl = entry.url;
        const name = entry.name || deriveStyleName(styleUrl, idx);
        next.push({
          name,
          styleUrl,
          layerId: name,
          snapping,
        });
      } else {
        const blobUrl = inlineDataToBlobUrl(entry.data);
        used.add(blobUrl);
        const name = entry.name || `inline-layer-${idx + 1}`;
        next.push({
          name,
          styleUrl: blobUrl,
          blobUrl,
          layerId: name,
          snapping,
        });
      }
    });

    // Revoke any blob URLs that are no longer referenced.
    for (const old of blobUrlsRef.current) {
      if (!used.has(old)) URL.revokeObjectURL(old);
    }
    blobUrlsRef.current = used;
    return next;
  }, [storedStyles]);

  // Slug set for explicit-mode filtering. Stable identity tied to the
  // serialised list so the cache-rebuild effect in TerraDrawIntegration
  // fires only when the user actually flips a row.
  const optedInLayerIds = useMemo(
    () => resolvedStyles.filter((s) => s.snapping).map((s) => s.layerId),
    [resolvedStyles]
  );

  // Final cleanup on unmount.
  useEffect(() => {
    return () => {
      for (const url of blobUrlsRef.current) URL.revokeObjectURL(url);
      blobUrlsRef.current = new Set();
    };
  }, []);

  const libreLayers = useMemo<LibreLayer[]>(
    () =>
      resolvedStyles.map((s) => ({
        type: "vector",
        name: s.name,
        style: s.styleUrl,
      })),
    [resolvedStyles]
  );

  const addStoredStyle = (entry: StoredVectorStyle) => {
    setStoredStyles((prev) => {
      const next = [...prev, entry];
      persistVectorStyles(next);
      return next;
    });
  };

  const removeStyleAt = (index: number) => {
    setStoredStyles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      persistVectorStyles(next);
      return next;
    });
  };

  const toggleStyleSnappingAt = (index: number) => {
    setStoredStyles((prev) => {
      const next = prev.map((entry, i) =>
        i === index ? { ...entry, snapping: entry.snapping === false } : entry
      );
      persistVectorStyles(next);
      return next;
    });
  };

  const clearAllStyles = () => {
    setStoredStyles([]);
    persistVectorStyles([]);
  };

  const loadFromUrl = async (url: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(
          "[measurements-playground] fetch failed:",
          response.statusText
        );
        return;
      }
      // Validate it's JSON; if it is we still pass the URL (not the body) as the
      // style source, so MapLibre can resolve relative refs against the origin.
      const contentType = response.headers.get("Content-Type") ?? "";
      if (!contentType.includes("application/json")) {
        console.warn(
          "[measurements-playground] dropped URL is not JSON:",
          contentType
        );
      }
      addStoredStyle({
        kind: "url",
        name: deriveStyleName(url, storedStyles.length),
        url,
      });
    } catch (error) {
      console.error("[measurements-playground] failed to fetch URL:", error);
    }
  };

  const loadFromFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const fileContent = e.target?.result;
        if (typeof fileContent !== "string") return;
        const replaced = fileContent.replaceAll(
          SERVER_URL_TOKEN,
          SERVER_URL_REPLACEMENT
        );
        const data = JSON.parse(replaced);
        addStoredStyle({
          kind: "inline",
          name: deriveInlineName(data, file.name, storedStyles.length),
          data,
        });
      } catch (error) {
        console.error(
          "[measurements-playground] failed to parse dropped file:",
          error
        );
      }
    };
    reader.readAsText(file);
  };

  // Window-level drag-and-drop: URL strings or local style.json files.
  useEffect(() => {
    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      const url = event.dataTransfer?.getData("URL");
      if (url) {
        void loadFromUrl(url);
        return;
      }
      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        loadFromFile(files[0]);
      }
    };
    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
    };
    window.addEventListener("drop", handleDrop);
    window.addEventListener("dragover", handleDragOver);
    return () => {
      window.removeEventListener("drop", handleDrop);
      window.removeEventListener("dragover", handleDragOver);
    };
    // loadFromUrl/loadFromFile close over storedStyles.length only for naming,
    // and addStoredStyle uses the functional setState — re-binding listeners
    // on every change is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <CarmaMap
        appKey={APP_KEY}
        mapEngine="maplibre"
        exposeMapToWindow
        logErrors
        overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
        libreLayers={libreLayers}
        // Suppress carma's vector-feature selection while a draw mode is
        // active so it doesn't fight terra-draw for clicks (e.g. after
        // dropping an ALKIS / POI layer that has its own click semantics).
        selectionEnabled={drawMode === "none"}
        modalMenu={<Menu />}
        extraControls={
          <>
            <DrawModeControls
              active={drawMode}
              onSelect={(mode) =>
                setDrawMode((prev) => (prev === mode ? "none" : mode))
              }
            />
            <ToggleStackControls
              entries={[
                {
                  key: "labels",
                  active: labelsVisible,
                  onToggle: toggleLabelsVisible,
                  tooltip: labelsVisible
                    ? "Maße ausblenden"
                    : "Maße einblenden",
                  testId: "labels-toggle-control",
                  icon: faTag,
                },
                {
                  key: "snapping",
                  active: snappingEnabled,
                  onToggle: toggleSnappingEnabled,
                  tooltip: snappingEnabled
                    ? "Snapping aus"
                    : "Snapping an",
                  testId: "snapping-toggle-control",
                  icon: faMagnet,
                },
              ]}
            />
          </>
        }
      />
      <TerraDrawIntegration
        mode={drawMode}
        labelsVisible={labelsVisible}
        snappingEnabled={snappingEnabled}
        radiusDebugVisible={radiusDebugVisible}
        snapRadiusPx={snapRadiusPx}
        snapMode={snapMode}
        optedInLayerIds={optedInLayerIds}
        backgroundSnapping={backgroundSnapping}
      />
      <OverlayUI
        layers={resolvedStyles}
        onClear={clearAllStyles}
        onRemove={removeStyleAt}
        onToggleSnapping={toggleStyleSnappingAt}
        onQuickLoad={(url) => void loadFromUrl(url)}
        radiusDebugVisible={radiusDebugVisible}
        onToggleRadiusDebug={toggleRadiusDebug}
        snapRadiusPx={snapRadiusPx}
        onSnapRadiusChange={updateSnapRadiusPx}
        snapMode={snapMode}
        onSnapModeChange={updateSnapMode}
        backgroundSnapping={backgroundSnapping}
        onToggleBackgroundSnapping={toggleBackgroundSnapping}
        onResetAll={resetAll}
      />
    </>
  );
}

function drawModeToTerraDraw(
  mode: DrawMode
): "select" | "point" | "linestring" | "polygon" | "static" {
  switch (mode) {
    case "select":
      return "select";
    case "point":
      return "point";
    case "line":
      return "linestring";
    case "polygon":
      return "polygon";
    case "none":
    default:
      return "static";
  }
}

function TerraDrawIntegration({
  mode,
  labelsVisible,
  snappingEnabled,
  radiusDebugVisible,
  snapRadiusPx,
  snapMode,
  optedInLayerIds,
  backgroundSnapping,
}: {
  mode: DrawMode;
  labelsVisible: boolean;
  snappingEnabled: boolean;
  radiusDebugVisible: boolean;
  snapRadiusPx: number;
  snapMode: SnapMode;
  optedInLayerIds: string[];
  backgroundSnapping: boolean;
}) {
  const { map } = useLibreContext();
  const drawRef = useRef<TerraDraw | null>(null);
  // Latest mode captured by ref so the init effect can apply it without
  // re-running on every mode change.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // Same trick for the labels-visible flag — read by setupLabelLayer (init
  // and style.load paths) so we don't have to thread the state through.
  const labelsVisibleRef = useRef(labelsVisible);
  labelsVisibleRef.current = labelsVisible;
  // Snapping flag: read live by both the mousemove preview handler and the
  // snapping.toCustom callback baked into the line/polygon modes (which is
  // captured at TerraDraw construction time).
  const snappingEnabledRef = useRef(snappingEnabled);
  snappingEnabledRef.current = snappingEnabled;
  // Same for the radius (slider value): read live so handlers always use
  // the current value without re-running the heavy init effect.
  const snapRadiusPxRef = useRef(snapRadiusPx);
  snapRadiusPxRef.current = snapRadiusPx;
  const radiusDebugVisibleRef = useRef(radiusDebugVisible);
  radiusDebugVisibleRef.current = radiusDebugVisible;
  // Snap-mode (opt-out / derived-opt-in / explicit) read live by attach()
  // and the recompute effect below so changes flip the eligible-layer list
  // without tearing down terra-draw. Same trick for the explicit-mode
  // inputs (per-libreLayer opt-in set + background snapping flag).
  const snapModeRef = useRef(snapMode);
  snapModeRef.current = snapMode;
  const optedInLayerIdsSetRef = useRef<Set<string>>(new Set(optedInLayerIds));
  optedInLayerIdsSetRef.current = new Set(optedInLayerIds);
  const backgroundSnappingRef = useRef(backgroundSnapping);
  backgroundSnappingRef.current = backgroundSnapping;
  // Cached list of layer ids eligible for snap querying. Recomputed on
  // attach() (initial mount + after every style swap) AND when snapMode
  // flips, so the hot mousemove path doesn't have to call map.getStyle()
  // + walk + filter every frame.
  const snappableLayerIdsRef = useRef<string[]>([]);

  // (Re)create TerraDraw whenever the maplibre map instance becomes available.
  useEffect(() => {
    if (!map) return;

    const setupLabelLayer = () => {
      if (!map.getSource(LABEL_SOURCE_ID)) {
        map.addSource(LABEL_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer(LABEL_LAYER_ID)) {
        map.addLayer({
          id: LABEL_LAYER_ID,
          type: "symbol",
          source: LABEL_SOURCE_ID,
          layout: {
            "text-field": ["get", "label"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 12,
            "text-anchor": "center",
            // Lift segment labels above their midpoint so the polygon /
            // line edge doesn't cut through the text. Area labels stay
            // centred on the polygon centroid.
            "text-offset": [
              "case",
              ["==", ["get", "kind"], "segment"],
              ["literal", [0, -0.8]],
              ["literal", [0, 0]],
            ],
            "text-allow-overlap": false,
            "text-ignore-placement": false,
            visibility: labelsVisibleRef.current ? "visible" : "none",
          },
          paint: {
            "text-color": "#111",
            "text-halo-color": "#fff",
            "text-halo-width": 2,
          },
        });
      }
    };

    const radiusLayerVisible = () =>
      snappingEnabledRef.current && radiusDebugVisibleRef.current;

    const setupSnapRadiusLayer = () => {
      if (!map.getSource(SNAP_RADIUS_SOURCE_ID)) {
        map.addSource(SNAP_RADIUS_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer(SNAP_RADIUS_LAYER_ID)) {
        map.addLayer({
          id: SNAP_RADIUS_LAYER_ID,
          type: "circle",
          source: SNAP_RADIUS_SOURCE_ID,
          layout: {
            visibility: radiusLayerVisible() ? "visible" : "none",
          },
          paint: {
            "circle-color": "#fff",
            "circle-opacity": 0.2,
            "circle-radius": snapRadiusPxRef.current,
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 1,
            "circle-stroke-opacity": 0.6,
          },
        });
      }
    };

    const setupSnapPreviewLayer = () => {
      if (!map.getSource(SNAP_PREVIEW_SOURCE_ID)) {
        map.addSource(SNAP_PREVIEW_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer(SNAP_PREVIEW_LAYER_ID)) {
        map.addLayer({
          id: SNAP_PREVIEW_LAYER_ID,
          type: "circle",
          source: SNAP_PREVIEW_SOURCE_ID,
          layout: {
            visibility: snappingEnabledRef.current ? "visible" : "none",
          },
          paint: {
            "circle-color": "#000",
            "circle-radius": 5,
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 1.5,
          },
        });
      }
    };

    // Single-feature setData helper: pass a coord to render a Point there,
    // null to clear. Used by both the snap dot and the snap radius circle.
    const setPointSourceAt = (
      sourceId: string,
      coord: GeoJSON.Position | null
    ) => {
      const src = map.getSource(sourceId) as GeoJSONSource | undefined;
      if (!src) return;
      if (coord) {
        src.setData({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: coord },
              properties: {},
            },
          ],
        });
      } else {
        src.setData({ type: "FeatureCollection", features: [] });
      }
    };

    // rAF throttle: high-refresh-rate mice fire mousemove at 120–200+ Hz,
    // but the screen only repaints at 60–144 Hz. Coalesce all moves that
    // arrive within one frame into a single update — process the most
    // recent event, drop the rest. Cuts queryRenderedFeatures + setData
    // calls roughly in half on a 144 Hz mouse over a 60 Hz monitor, more
    // on faster input devices.
    let pendingFrame: number | null = null;
    let pendingEvent: maplibregl.MapMouseEvent | null = null;

    const processMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (!snappingEnabledRef.current) {
        setPointSourceAt(SNAP_PREVIEW_SOURCE_ID, null);
        setPointSourceAt(SNAP_RADIUS_SOURCE_ID, null);
        return;
      }
      if (radiusDebugVisibleRef.current) {
        setPointSourceAt(SNAP_RADIUS_SOURCE_ID, [e.lngLat.lng, e.lngLat.lat]);
      } else {
        setPointSourceAt(SNAP_RADIUS_SOURCE_ID, null);
      }
      const target = findSnapTarget(
        map,
        { x: e.point.x, y: e.point.y },
        snapRadiusPxRef.current,
        snappableLayerIdsRef.current
      );
      setPointSourceAt(SNAP_PREVIEW_SOURCE_ID, target);
    };

    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      pendingEvent = e;
      if (pendingFrame !== null) return;
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = null;
        const ev = pendingEvent;
        pendingEvent = null;
        if (ev) processMouseMove(ev);
      });
    };
    const handleMouseLeave = () => {
      // Cancel any queued update and clear both layers immediately.
      if (pendingFrame !== null) {
        cancelAnimationFrame(pendingFrame);
        pendingFrame = null;
        pendingEvent = null;
      }
      setPointSourceAt(SNAP_PREVIEW_SOURCE_ID, null);
      setPointSourceAt(SNAP_RADIUS_SOURCE_ID, null);
    };

    const refreshLabels = () => {
      const draw = drawRef.current;
      if (!draw) return;
      const src = map.getSource(LABEL_SOURCE_ID) as GeoJSONSource | undefined;
      if (!src) return;
      try {
        const fc = buildLabelFeatures(draw.getSnapshot() as Feature[]);
        src.setData(fc);
        // (Note: terra-draw's adapter does NOT re-add or re-order its
        // layers on internal renders — verified in
        // terra-draw-maplibre-gl-adapter.module.js. The adapter's render()
        // only calls setData on existing sources. So we don't need
        // moveLayer here — the layer order set by attach() stays valid.)
      } catch (e) {
        console.warn("[measurements-playground] label rebuild failed", e);
      }
    };

    // Same shape used by both LineString + Polygon modes. Returns the snap
    // target only when snapping is enabled — terra-draw treats `undefined`
    // as "no snap, use raw cursor coord".
    const snapToCustom = (event: { containerX: number; containerY: number }) => {
      if (!snappingEnabledRef.current) return undefined;
      const target = findSnapTarget(
        map,
        { x: event.containerX, y: event.containerY },
        snapRadiusPxRef.current,
        snappableLayerIdsRef.current
      );
      return target ?? undefined;
    };

    const createDraw = () => {
      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [
          new TerraDrawPointMode(),
          new TerraDrawLineStringMode({
            snapping: {
              toLine: true,
              toCoordinate: true,
              toCustom: snapToCustom,
            },
          }),
          new TerraDrawPolygonMode({
            snapping: {
              toLine: true,
              toCoordinate: true,
              toCustom: snapToCustom,
            },
          }),
          new TerraDrawSelectMode({
            // Fully-editable defaults: drag the feature, drag/delete vertices,
            // add midpoints. Same shape Terra Draw's docs use as the canonical
            // example.
            flags: {
              point: { feature: { draggable: true } },
              linestring: {
                feature: {
                  draggable: true,
                  coordinates: {
                    midpoints: true,
                    draggable: true,
                    deletable: true,
                  },
                },
              },
              polygon: {
                feature: {
                  draggable: true,
                  coordinates: {
                    midpoints: true,
                    draggable: true,
                    deletable: true,
                  },
                },
              },
            },
          }),
        ],
      });
      draw.start();
      draw.setMode(drawModeToTerraDraw(modeRef.current));
      draw.on("change", () => refreshLabels());
      return draw;
    };

    // Single idempotent attach: handles initial setup AND recovery after a
    // basemap style swap (which strips both our label layer and Terra Draw's
    // own sources/layers — its adapter has no built-in style.load recovery).
    // If a draw instance already exists, snapshot its features, tear it down,
    // recreate it against the new style, and restore the features.
    const attach = () => {
      const oldDraw = drawRef.current;
      if (oldDraw) {
        let savedFeatures: GeoJSONStoreFeatures[] = [];
        try {
          savedFeatures = oldDraw.getSnapshot();
        } catch (e) {
          console.warn(
            "[measurements-playground] could not snapshot before reattach",
            e
          );
        }
        // stop() throws after a style swap because the adapter's unregister()
        // calls map.removeLayer("td-point") etc., but those layer ids no
        // longer exist in the freshly-loaded style. The base adapter still
        // unbinds canvas event listeners before that throw, so swallowing
        // the error here doesn't leak handlers — and crucially lets us
        // continue to createDraw + addFeatures + setupLabelLayer below
        // (without the catch, the whole attach aborted and even the labels
        // failed to re-render).
        try {
          oldDraw.stop();
        } catch (e) {
          console.warn(
            "[measurements-playground] terra-draw stop() failed during style.load reattach (expected — adapter tried to removeLayer non-existent ids)",
            e
          );
        }
        drawRef.current = createDraw();
        if (savedFeatures.length > 0) {
          try {
            drawRef.current.addFeatures(savedFeatures);
          } catch (e) {
            console.warn(
              "[measurements-playground] could not restore drawn features",
              e
            );
          }
        }
      } else {
        drawRef.current = createDraw();
      }
      setupLabelLayer();
      setupSnapRadiusLayer();
      setupSnapPreviewLayer();
      refreshLabels();
      // Refresh the cached snappable-layer-id list now that the new style
      // is fully loaded (terra-draw + label/snap layers were just added).
      // Without this the cache would point at stale ids from the old style.
      snappableLayerIdsRef.current =
        getSnappableLayerIds(
          map,
          snapModeRef.current,
          optedInLayerIdsSetRef.current,
          backgroundSnappingRef.current
        ) ?? [];
      // Wipe any stale preview/radius from the previous style; mousemove
      // will fill them back in on the next pointer event.
      setPointSourceAt(SNAP_PREVIEW_SOURCE_ID, null);
      setPointSourceAt(SNAP_RADIUS_SOURCE_ID, null);
    };

    // INITIAL ATTACH — robust against MapLibre's "Style is not done loading,
    // rebuilding from scratch" path.
    //
    // The obvious wiring (`isStyleLoaded() ? attach() : on('style.load', attach)`)
    // misses one specific timing: when LibreMap's effect fires `setStyle()`
    // before the *initial* style finishes loading, MapLibre logs "Unable to
    // perform style diff: Style is not done loading.. Rebuilding the style
    // from scratch." and — in that rebuild path — the `style.load` event
    // never fires for our listener. Symptom: terra-draw is never created,
    // every click lands on a bare canvas, "no measurements can be created"
    // with a raster-only basemap (this playground's default).
    //
    // Fix: gate the *first* attach on `isStyleLoaded()` and listen on every
    // event that can mark the style as ready (`style.load`, `load`, `idle`,
    // `styledata`). Whichever fires first with a loaded style wins.
    // Subsequent `style.load` events (basemap swap) still trigger a full
    // re-attach via the existing `attach()` path — that's the case the
    // initial-only flag mustn't break.
    let initialAttachDone = false;
    const tryInitialAttach = () => {
      if (initialAttachDone) return;
      if (!map.isStyleLoaded()) return;
      initialAttachDone = true;
      attach();
    };
    const onStyleLoad = () => {
      if (initialAttachDone) attach();
      else tryInitialAttach();
    };

    if (map.isStyleLoaded()) tryInitialAttach();
    map.on("style.load", onStyleLoad);
    map.on("load", tryInitialAttach);
    map.on("idle", tryInitialAttach);
    map.on("styledata", tryInitialAttach);
    map.on("mousemove", handleMouseMove);
    map.on("mouseout", handleMouseLeave);

    return () => {
      map.off("style.load", onStyleLoad);
      map.off("load", tryInitialAttach);
      map.off("idle", tryInitialAttach);
      map.off("styledata", tryInitialAttach);
      map.off("mousemove", handleMouseMove);
      map.off("mouseout", handleMouseLeave);
      if (pendingFrame !== null) {
        cancelAnimationFrame(pendingFrame);
        pendingFrame = null;
        pendingEvent = null;
      }
      if (drawRef.current) {
        drawRef.current.stop();
        drawRef.current = null;
      }
    };
  }, [map]);

  // React to mode changes after init.
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw) return;
    draw.setMode(drawModeToTerraDraw(mode));
  }, [mode]);

  // React to label visibility toggle.
  useEffect(() => {
    if (!map) return;
    if (!map.getLayer(LABEL_LAYER_ID)) return;
    map.setLayoutProperty(
      LABEL_LAYER_ID,
      "visibility",
      labelsVisible ? "visible" : "none"
    );
  }, [map, labelsVisible]);

  // React to snap-related toggles. The dot is bound to the magnet (snap on /
  // off). The radius circle has its own debug toggle in the overlay AND is
  // implicitly hidden when snapping is off (no radius without snapping).
  // Wiped sources prevent stale dots after toggling off.
  useEffect(() => {
    if (!map) return;
    const dotVisibility = snappingEnabled ? "visible" : "none";
    const radiusVisibility =
      snappingEnabled && radiusDebugVisible ? "visible" : "none";
    if (map.getLayer(SNAP_PREVIEW_LAYER_ID)) {
      map.setLayoutProperty(SNAP_PREVIEW_LAYER_ID, "visibility", dotVisibility);
    }
    if (map.getLayer(SNAP_RADIUS_LAYER_ID)) {
      map.setLayoutProperty(
        SNAP_RADIUS_LAYER_ID,
        "visibility",
        radiusVisibility
      );
    }
    const empty: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [],
    };
    if (!snappingEnabled) {
      const previewSrc = map.getSource(SNAP_PREVIEW_SOURCE_ID) as
        | GeoJSONSource
        | undefined;
      if (previewSrc) previewSrc.setData(empty);
    }
    if (!snappingEnabled || !radiusDebugVisible) {
      const radiusSrc = map.getSource(SNAP_RADIUS_SOURCE_ID) as
        | GeoJSONSource
        | undefined;
      if (radiusSrc) radiusSrc.setData(empty);
    }
  }, [map, snappingEnabled, radiusDebugVisible]);

  // React to snap-radius slider: update the rendered circle's pixel size.
  // The actual snap-search radius is read from the ref by handleMouseMove
  // and snapToCustom, so changes are picked up on the next pointer event /
  // click without re-binding anything.
  useEffect(() => {
    if (!map) return;
    if (!map.getLayer(SNAP_RADIUS_LAYER_ID)) return;
    map.setPaintProperty(SNAP_RADIUS_LAYER_ID, "circle-radius", snapRadiusPx);
  }, [map, snapRadiusPx]);

  // React to any snap-target input flip (mode, per-libreLayer opt-ins,
  // background flag): rebuild the cached layer-id list. Skip if the style
  // isn't ready yet — attach() will compute it on style.load.
  useEffect(() => {
    if (!map || !map.isStyleLoaded()) return;
    snappableLayerIdsRef.current =
      getSnappableLayerIds(
        map,
        snapMode,
        new Set(optedInLayerIds),
        backgroundSnapping
      ) ?? [];
  }, [map, snapMode, optedInLayerIds, backgroundSnapping]);

  return null;
}

function DrawModeControls({
  active,
  onSelect,
}: {
  active: DrawMode;
  onSelect: (mode: Exclude<DrawMode, "none">) => void;
}) {
  // All draw-mode buttons live inside a single <Control> so they render as
  // one fused button group (same pattern apps/geoportal MapWrapper uses for
  // the compass + 3D-toggle pair, and for the +/- zoom pair).
  // Built-in topleft orders today: 10 zoom, 20 compass, 30 terrain,
  // 50 fullscreen, 60 locator. The whole draw group sits at order 70.
  const last = DRAW_MODE_BUTTONS.length - 1;
  return (
    <Control position="topleft" order={70}>
      <div className="flex flex-col">
        {DRAW_MODE_BUTTONS.map(({ mode, label, icon }, idx) => {
          const isActive = active === mode;
          // First: square bottom + drop bottom border (next button supplies it).
          // Middle: square both ends + drop bottom border + thin top border.
          // Last: square top + thin top border.
          let groupClass: string;
          if (idx === 0) {
            groupClass = "!border-b-0 !rounded-b-none";
          } else if (idx === last) {
            groupClass = "!rounded-t-none !border-t-[1px]";
          } else {
            groupClass = "!rounded-none !border-t-[1px] !border-b-0";
          }
          return (
            <Tooltip key={mode} title={label} placement="right">
              <ControlButtonStyler
                onClick={() => onSelect(mode)}
                dataTestId={`draw-${mode}-control`}
                useDisabledStyle={false}
                className={groupClass}
              >
                <FontAwesomeIcon
                  icon={icon}
                  className={isActive ? "text-[#1677ff]" : ""}
                />
              </ControlButtonStyler>
            </Tooltip>
          );
        })}
      </div>
    </Control>
  );
}

type ToggleEntry = {
  key: string;
  active: boolean;
  onToggle: () => void;
  tooltip: string;
  testId: string;
  icon: typeof faTag;
};

// Sibling to DrawModeControls (order=70). Renders one fused button stack
// (same visual pattern as the draw-mode buttons) at order=80 so the whole
// group sits directly below the draw-mode strip in the topleft column.
function ToggleStackControls({ entries }: { entries: ToggleEntry[] }) {
  const last = entries.length - 1;
  return (
    <Control position="topleft" order={80}>
      <div className="flex flex-col">
        {entries.map(({ key, active, onToggle, tooltip, testId, icon }, idx) => {
          let groupClass = "";
          if (entries.length > 1) {
            if (idx === 0) groupClass = "!border-b-0 !rounded-b-none";
            else if (idx === last) groupClass = "!rounded-t-none !border-t-[1px]";
            else groupClass = "!rounded-none !border-t-[1px] !border-b-0";
          }
          return (
            <Tooltip key={key} title={tooltip} placement="right">
              <ControlButtonStyler
                onClick={onToggle}
                dataTestId={testId}
                useDisabledStyle={false}
                className={groupClass}
              >
                <FontAwesomeIcon
                  icon={icon}
                  className={active ? "text-[#1677ff]" : ""}
                />
              </ControlButtonStyler>
            </Tooltip>
          );
        })}
      </div>
    </Control>
  );
}

function OverlayUI({
  layers,
  onClear,
  onRemove,
  onToggleSnapping,
  onQuickLoad,
  radiusDebugVisible,
  onToggleRadiusDebug,
  snapRadiusPx,
  onSnapRadiusChange,
  snapMode,
  onSnapModeChange,
  backgroundSnapping,
  onToggleBackgroundSnapping,
  onResetAll,
}: {
  layers: ResolvedVectorStyle[];
  onClear: () => void;
  onRemove: (index: number) => void;
  onToggleSnapping: (index: number) => void;
  onQuickLoad: (url: string) => void;
  radiusDebugVisible: boolean;
  onToggleRadiusDebug: () => void;
  snapRadiusPx: number;
  onSnapRadiusChange: (next: number) => void;
  snapMode: SnapMode;
  onSnapModeChange: (next: SnapMode) => void;
  backgroundSnapping: boolean;
  onToggleBackgroundSnapping: () => void;
  onResetAll: () => void;
}) {
  const isExplicit = snapMode === "explicit";
  return (
    <div
      className="absolute top-4 left-1/2 -translate-x-1/2 z-[9999]"
      style={{
        backgroundColor: "white",
        padding: "8px 12px",
        borderRadius: "4px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        fontSize: "14px",
        minWidth: "320px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <strong style={{ fontSize: "13px" }}>Snap-target layers</strong>
        {layers.length > 0 && (
          <>
            <div
              style={{ width: "1px", height: "20px", backgroundColor: "#ddd" }}
            />
            <button
              onClick={onClear}
              title="Remove all vector layers"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px 8px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "13px",
                color: "#dc2626",
              }}
            >
              Clear ({layers.length})
            </button>
          </>
        )}
        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={onResetAll}
            title="Reset everything stored for this playground (loaded layers + all toggles + radius)"
            data-testid="reset-all-button"
            style={{
              background: "none",
              border: "1px solid #d1d5db",
              borderRadius: "3px",
              cursor: "pointer",
              padding: "2px 8px",
              fontSize: "12px",
              color: "#374151",
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          fontSize: "13px",
          flexWrap: "wrap",
        }}
      >
        <span style={{ color: "#555" }}>Quick load:</span>
        {QUICK_LOAD_LINKS.map((link, i) => {
          const alreadyLoaded = layers.some((l) => l.styleUrl === link.url);
          return (
            <span
              key={link.url}
              style={{ display: "inline-flex", gap: "10px" }}
            >
              {i > 0 && (
                <span style={{ color: "#ddd" }} aria-hidden>
                  |
                </span>
              )}
              <button
                onClick={() => onQuickLoad(link.url)}
                disabled={alreadyLoaded}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: alreadyLoaded ? "#9ca3af" : "#2563eb",
                  cursor: alreadyLoaded ? "default" : "pointer",
                  textDecoration: alreadyLoaded ? "line-through" : "none",
                }}
                title={alreadyLoaded ? "already loaded" : link.url}
              >
                {link.label}
              </button>
            </span>
          );
        })}
        <span style={{ color: "#888", fontSize: "12px" }}>
          (or drop a URL / style.json file anywhere)
        </span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          fontSize: "13px",
          flexWrap: "wrap",
        }}
      >
        <strong style={{ fontSize: "13px" }}>Snap (debug)</strong>
        <span
          role="radiogroup"
          aria-label="snap mode"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          {(
            [
              {
                value: "opt-out" as SnapMode,
                label: "opt-out",
                title:
                  "Every layer participates unless flagged skipSnapping. Basemap.de geometry included.",
              },
              {
                value: "derived-opt-in" as SnapMode,
                label: "derived opt-in",
                title:
                  "Only sources that ship at least one skipSnapping flag are treated as curated snap targets. Basemap.de excluded.",
              },
              {
                value: "explicit" as SnapMode,
                label: "explicit",
                title:
                  "User picks per loaded libreLayer (checkbox below). Background (basemap.de + built-ins) gated separately.",
              },
            ] as const
          ).map((opt) => (
            <label
              key={opt.value}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                cursor: "pointer",
              }}
              title={opt.title}
            >
              <input
                type="radio"
                name="snap-mode"
                value={opt.value}
                checked={snapMode === opt.value}
                onChange={() => onSnapModeChange(opt.value)}
                data-testid={`snap-mode-${opt.value}`}
              />
              {opt.label}
            </label>
          ))}
        </span>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            cursor: isExplicit ? "pointer" : "not-allowed",
            opacity: isExplicit ? 1 : 0.5,
          }}
          title={
            isExplicit
              ? "Include layers that aren't part of any loaded libreLayer (basemap.de plus any built-ins)."
              : "Only relevant in explicit mode."
          }
        >
          <input
            type="checkbox"
            checked={backgroundSnapping}
            disabled={!isExplicit}
            onChange={onToggleBackgroundSnapping}
            data-testid="snap-background-toggle"
          />
          background
        </label>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            cursor: "pointer",
          }}
          title="Show the white snap-radius circle around the cursor"
        >
          <input
            type="checkbox"
            checked={radiusDebugVisible}
            onChange={onToggleRadiusDebug}
            data-testid="snap-radius-debug-toggle"
          />
          show radius
        </label>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            flex: "1 1 200px",
            minWidth: "180px",
          }}
          title={`Snap search radius (${SNAP_RADIUS_PX_MIN}–${SNAP_RADIUS_PX_MAX} px)`}
        >
          <span style={{ color: "#555", whiteSpace: "nowrap" }}>radius</span>
          <input
            type="range"
            min={SNAP_RADIUS_PX_MIN}
            max={SNAP_RADIUS_PX_MAX}
            step={1}
            value={snapRadiusPx}
            onChange={(e) =>
              onSnapRadiusChange(Number.parseInt(e.target.value, 10))
            }
            data-testid="snap-radius-slider"
            style={{ flex: 1 }}
          />
          <span
            style={{
              color: "#111",
              fontVariantNumeric: "tabular-nums",
              minWidth: "3ch",
              textAlign: "right",
            }}
          >
            {snapRadiusPx}
          </span>
          <span style={{ color: "#888" }}>px</span>
        </label>
      </div>

      {layers.length > 0 && (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            fontSize: "12px",
            maxHeight: "180px",
            overflowY: "auto",
          }}
        >
          {layers.map((layer, idx) => (
            <li
              key={`${layer.styleUrl}-${idx}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
                padding: "2px 4px",
                backgroundColor: "#f9fafb",
                borderRadius: "3px",
              }}
            >
              <span
                title={layer.styleUrl}
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: layer.blobUrl ? "#9333ea" : "#2563eb",
                    marginRight: 6,
                    verticalAlign: "middle",
                  }}
                  aria-hidden
                />
                {layer.name}
              </span>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11px",
                  color: isExplicit ? "#374151" : "#9ca3af",
                  cursor: isExplicit ? "pointer" : "not-allowed",
                  opacity: isExplicit ? 1 : 0.6,
                }}
                title={
                  isExplicit
                    ? "Include this libreLayer's features as snap targets."
                    : "Only relevant in explicit mode."
                }
              >
                <input
                  type="checkbox"
                  checked={layer.snapping}
                  disabled={!isExplicit}
                  onChange={() => onToggleSnapping(idx)}
                  data-testid={`layer-snapping-toggle-${idx}`}
                />
                snap
              </label>
              <button
                onClick={() => onRemove(idx)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#6b7280",
                  fontSize: "14px",
                  padding: "0 4px",
                }}
                title="Remove layer"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
