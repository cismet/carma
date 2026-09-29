import type { Tile } from "3d-tiles-renderer/core";
import type * as THREE from "three";
import type { estimateTileTargetSteps } from "../../runtime/integrations/three-tiles-runtime-coverage";

/** What a tile is to the diagnostics; ancestors are parents above the drawn cut. */
export const TILE_DIAGNOSTIC_KIND = {
  DISPLAYED: "displayed",
  FLOOR: "floor",
  RING: "ring",
  RESIDENT: "resident",
  QUEUED: "queued",
  LOADING: "loading",
  PARSING: "parsing",
  FAILED: "failed",
  DEFERRED: "deferred",
  ANCESTOR: "ancestor",
} as const;
export type RectKind =
  (typeof TILE_DIAGNOSTIC_KIND)[keyof typeof TILE_DIAGNOSTIC_KIND];
/** The kinds with a fill of their own: everything but ancestors. */
export type Kind = Exclude<RectKind, typeof TILE_DIAGNOSTIC_KIND.ANCESTOR>;

export const FILL = {
  [TILE_DIAGNOSTIC_KIND.DISPLAYED]: "rgba(0, 224, 255, 0.30)",
  [TILE_DIAGNOSTIC_KIND.FLOOR]: "rgba(12, 18, 32, 0.26)",
  [TILE_DIAGNOSTIC_KIND.RING]: "rgba(12, 18, 32, 0.26)",
  [TILE_DIAGNOSTIC_KIND.RESIDENT]: "rgba(12, 18, 32, 0.26)",
  [TILE_DIAGNOSTIC_KIND.QUEUED]: "rgba(12, 18, 32, 0.26)",
  [TILE_DIAGNOSTIC_KIND.LOADING]: "rgba(12, 18, 32, 0.26)",
  [TILE_DIAGNOSTIC_KIND.PARSING]: "rgba(12, 18, 32, 0.26)",
  [TILE_DIAGNOSTIC_KIND.FAILED]: "rgba(12, 18, 32, 0.26)",
  [TILE_DIAGNOSTIC_KIND.DEFERRED]: "rgba(12, 18, 32, 0.26)",
} as const satisfies Record<Kind, string>;

/** Which demand a tile serves: camera demand, seam support or the base extent. */
export const TILE_DIAGNOSTIC_COVERAGE = {
  VIEWPORT: "viewport",
  SEAM: "seam",
  BASE: "base",
} as const;
export type TileDiagnosticCoverage =
  (typeof TILE_DIAGNOSTIC_COVERAGE)[keyof typeof TILE_DIAGNOSTIC_COVERAGE];

/** Where a scheduled tile stands in the request queue. */
export const TILE_DIAGNOSTIC_QUEUE_STATE = {
  QUEUED: "queued",
  DOWNLOADING: "downloading",
  PARSING: "parsing",
  CANCELLED: "cancelled",
  FAILED: "failed",
} as const;
export type TileDiagnosticQueueState =
  (typeof TILE_DIAGNOSTIC_QUEUE_STATE)[keyof typeof TILE_DIAGNOSTIC_QUEUE_STATE];

// Map strokes have a narrow darken under-stroke; only the popout has fills.
export const OVERVIEW_COLORS = {
  text: "#f4fbff",
  quality: "#fff278",
  grid: "#8aeeff",
  parent: "rgba(138,238,255,0.55)",
  reserve: "#ff9cf0",
  seam: "#ffc46b",
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
  /** Resident tile size reported by the renderer cache. */
  bytes?: number;
  steps?: OverlayVolume["steps"];
  tile: Tile;
  id: string;
  /** World-space box, scene metres. */
  world: THREE.Box3;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: RectKind;
  floor: boolean;
  coverage?: TileDiagnosticCoverage;
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
  /** Packed min/max boxes, six numbers each; local when tileTransforms is present. */
  tileBounds?: number[];
  /** Optional local-box to world matrices, sixteen numbers per tile. */
  tileTransforms?: number[];
  /** Boxes and transforms aligned with the rendered tile records for orbit reprojection. */
  rectBounds?: number[];
  rectTransforms?: number[];
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
