import type { Tile } from "3d-tiles-renderer/core";
import type * as THREE from "three";
import type { estimateTileTargetSteps } from "../../runtime/integrations/three-tiles-runtime-coverage";

export const FILL = {
  displayed: "rgba(0, 224, 255, 0.30)",
  underlay: "rgba(0, 224, 255, 0.30)",
  floor: "rgba(12, 18, 32, 0.26)",
  ring: "rgba(12, 18, 32, 0.26)",
  resident: "rgba(12, 18, 32, 0.26)",
  queued: "rgba(12, 18, 32, 0.26)",
  loading: "rgba(12, 18, 32, 0.26)",
  parsing: "rgba(12, 18, 32, 0.26)",
  failed: "rgba(12, 18, 32, 0.26)",
  deferred: "rgba(12, 18, 32, 0.26)",
} as const;
export type Kind = keyof typeof FILL;

// Map strokes have a narrow darken under-stroke; only the popout has fills.
export const OVERVIEW_COLORS = {
  text: "#f4fbff",
  quality: "#fff278",
  grid: "#8aeeff",
  parent: "rgba(138,238,255,0.55)",
  reserve: "#ff9cf0",
  ring: "#b7b5ff",
  baseline: "#8ba7b8",
  processing: "#d1afff",
  failed: "#ff829c",
  backdrop: "#404040",
  frustum: "#ffffff",
} as const;

/**
 * The steps a tile can report, in the order they happen. The slot is the step's
 * identity, so its colour is stable across tiles, and steps of the same kind
 * share a hue: blue for fetching, green for raster and mesh work, violet for
 * the geometry handed to the renderer, amber for waiting on a cut.
 */
export const TILE_STEPS = [
  { label: "Warten", color: "#8c9daf" },
  { label: "Schatten", color: "#ffdb87" },
  { label: "Cache", color: "#a9dcff" },
  { label: "Laden", color: "#5aabf2" },
  { label: "Dekodieren", color: "#9ef0c0" },
  { label: "Vermaschen", color: "#63d79a" },
  { label: "Projizieren", color: "#2fae7a" },
  { label: "Relief", color: "#c9a6ff" },
  { label: "Aufbau", color: "#a87dff" },
  { label: "Anzeige", color: "#ffc46b" },
  { label: "Einfugen", color: "#ff9a4d" },
] as const;

export type OverlayRect = {
  tile: Tile;
  id: string;
  /** World-space box, scene metres. */
  world: THREE.Box3;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: Kind | "ancestor";
  floor: boolean;
  error: number;
  levels: number;
  quality: ReturnType<typeof estimateTileTargetSteps>;
  ring: boolean;
  /** No active camera requests this tile; retained/floor tiles have no LOD target. */
  outsideDemand: boolean;
  phase: string;
};

/**
 * A tile from a source that has no 3D Tiles tree of its own. Terrain is such a
 * source: 2.5D tiles whose box is the footprint plus the elevation range they
 * cover, tested against the same main and corridor frustums as mesh tiles.
 */
export type OverlayVolume = {
  id: string;
  /** World-space box, scene metres. */
  world: THREE.Box3;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: Kind;
  phase: string;
  /** Intersects the main camera frustum. */
  inView: boolean;
  /** Intersects the shadow corridor frustum. */
  inShadow: boolean;
  error: number;
  /** Payload size, for the size marks drawn inside the tile. */
  bytes?: number;
  /** Tile level; generations above the finest one are drawn fainter. */
  level?: number;
  /** What the tile cost, step by step; the last one may still be running. */
  steps?: readonly Readonly<{ label: string; ms: number; pending?: boolean }>[];
};

/** Fixed coordinate frame of a tile snapshot; live cameras project into this frame. */
export type DiagnosticViewportBasis = {
  /** Packed world-space min/max boxes of every reported tile, six numbers each. */
  tileBounds?: number[];
  bounds: number[];
  worldToOverview: number[];
  /** [scale, offsetX, offsetY] and optionally a separate vertical scale. */
  screen: number[];
  width: number;
  height: number;
};
export type OverlayModel = {
  viewportBasis?: DiagnosticViewportBasis;
  width: number;
  height: number;
  extent: { x: number; y: number; w: number; h: number } | null;
  /** Projected edges of the true 3D camera-frustum/tileset-bounds intersection. */
  intersectionEdges: ReadonlyArray<
    readonly [number, number, number, number]
  > | null;
  /** Centre and projected extent of the clipped camera volume. */
  centerHit: [number, number] | null;
  footprintBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null;
  rects: OverlayRect[];
  /** Tiles of sources without their own tile tree, drawn beside the rects. */
  volumes?: OverlayVolume[];
  /** Draw the payload size grid inside each tile. */
  showSize?: boolean;
  /** Draw the processing pie and its reference ring. */
  showStats?: boolean;
  target: number;
};
