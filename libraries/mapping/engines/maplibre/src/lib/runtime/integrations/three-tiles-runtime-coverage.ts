import type { Tile } from "3d-tiles-renderer/core";
import {
  FAILED_LOADING_STATE,
  LOADED_LOADING_STATE,
} from "./three-tiles-runtime-vendor";

/** Diagnostic only: signed LOD distance, not a prediction of download count or time. */
export function estimateTileTargetSteps(
  tile: Tile,
  targetPixels: number,
  readError: (tile: Tile) => number | null,
  options: { maxNodes?: number; tolerance?: number } = {}
): { minimum: number; maximum: number; estimated: boolean } | null {
  const error = readError(tile);
  if (error === null || !Number.isFinite(error) || !(targetPixels > 0))
    return null;
  const threshold = targetPixels * (1 + (options.tolerance ?? 0.1));
  let budget = options.maxNodes ?? 128;
  const content = (node: Tile) =>
    node.internal?.hasRenderableContent === true &&
    !(node.traversal as { unconditionallyRefine?: boolean } | undefined)
      ?.unconditionallyRefine;
  if (error <= threshold) {
    let steps = 0;
    let parent = tile.parent;
    const seen = new Set<Tile>([tile]);
    while (parent && budget-- > 0 && !seen.has(parent)) {
      seen.add(parent);
      if (content(parent)) {
        // ADD parents do not replace their children and cannot prove over-detail.
        if (parent.refine !== "REPLACE") break;
        const parentError = readError(parent);
        if (
          parentError === null ||
          !Number.isFinite(parentError) ||
          parentError > threshold
        )
          break;
        steps++;
      }
      parent = parent.parent;
    }
    return {
      minimum: -steps,
      maximum: -steps,
      estimated: parent !== null && budget <= 0,
    };
  }
  const seen = new Set<Tile>();
  const visit = (
    node: Tile,
    depth: number
  ): { minimum: number; maximum: number; estimated: boolean } => {
    if (budget-- <= 0 || seen.has(node)) {
      const remaining = Math.max(
        1,
        Math.ceil(Math.log2(error / targetPixels)) - depth
      );
      return {
        minimum: depth + remaining,
        maximum: depth + remaining,
        estimated: true,
      };
    }
    const nodeError = readError(node);
    const ready = nodeError !== null && Number.isFinite(nodeError);
    if (ready && content(node) && nodeError <= threshold)
      return { minimum: depth, maximum: depth, estimated: false };
    if (!node.children?.length) {
      const ratio = ready ? nodeError / targetPixels : error / targetPixels;
      const remaining = Math.max(1, Math.ceil(Math.log2(Math.max(1, ratio))));
      return {
        minimum: depth + remaining,
        maximum: depth + remaining,
        estimated: true,
      };
    }
    seen.add(node);
    const ranges = node.children.map((child) =>
      visit(child, depth + (content(child) ? 1 : 0))
    );
    return {
      minimum: Math.min(...ranges.map((range) => range.minimum)),
      maximum: Math.max(...ranges.map((range) => range.maximum)),
      estimated: ranges.some((range) => range.estimated),
    };
  };
  return visit(tile, 0);
}

export const THREE_TILES_COVERAGE_EVIDENCE = {
  DISABLED: "disabled",
  SOURCE_PENDING: "source-pending",
  FLOOR_NOT_ARMED: "floor-not-armed",
  FLOOR_UNKNOWN: "floor-unknown",
  FLOOR_INCOMPLETE: "floor-incomplete",
  FLOOR_CUT_COVERED: "floor-cut-covered",
} as const;

export type ThreeTilesCoverageEvidence =
  (typeof THREE_TILES_COVERAGE_EVIDENCE)[keyof typeof THREE_TILES_COVERAGE_EVIDENCE];

export type ThreeTilesRuntimeCoverageStatus = Readonly<{
  enabled: boolean;
  sourcePendingMetadata: boolean;
  floorArmed: boolean;
  floorReady: boolean;
  /**
   * Strength of the source-floor observation. Even FLOOR_CUT_COVERED is not
   * proof that every registered camera has a complete renderable cut.
   */
  evidence: ThreeTilesCoverageEvidence;
  cameraCoverageCertified: false;
  /** Main-view base-cut observation; independent of whole-floor evidence. */
  visibleBaseReady: boolean;
  floorLoaded: number;
  floorTotal: number;
  uncoveredFallbackRoots: number;
  failedFallbackRoots: number;
  unknownFallbackRoots: number;
  displayed: number;
  underlay: number;
  pending: number;
  queued: number;
  downloading: number;
  parsing: number;
  requestedErrorTarget: number;
  effectiveErrorTarget: number;
  paused: boolean;
  cacheBytes: number;
  ceilingBytes: number;
  traversalRevision: number;
}>;

export type ThreeTilesRuntimeCoverageInput = Readonly<{
  /** Increment only after a traversal has published its floor/frontier sets. */
  traversalRevision: number;
  enabled: boolean;
  sourcePendingMetadata: boolean;
  floorArmed: boolean;
  visibleBaseReady: boolean;
  /** Precomputed floor roots; the diagnostics getter never discovers the tree. */
  floorRoots: readonly Tile[];
  displayed: ReadonlySet<Tile>;
  underlay: ReadonlySet<Tile>;
  pending: number;
  queued: number;
  downloading: number;
  parsing: number;
  requestedErrorTarget: number;
  effectiveErrorTarget: number;
  paused: boolean;
  cacheBytes: number;
  ceilingBytes: number;
}>;

type FallbackEvidence = "covered" | "failed" | "unknown";

/** Discover the full source floor, not the main-view-only floor subset. */
export const collectTilesetFloorRoots = (
  root: Tile,
  extentGeometricError: number
): Tile[] => {
  const roots: Tile[] = [];
  const visit = (tile: Tile) => {
    if (!tile.internal) {
      roots.push(tile);
      return;
    }
    const children = tile.children ?? [];
    if (
      (tile.internal.hasUnrenderableContent &&
        tile.internal.loadingState !== LOADED_LOADING_STATE) ||
      children.length === 0
    ) {
      roots.push(tile);
      return;
    }
    if (
      tile.geometricError >= extentGeometricError &&
      (children.every((child) => child.geometricError < extentGeometricError) ||
        (tile.internal.hasRenderableContent &&
          children.some(
            (child) => child.geometricError < extentGeometricError
          )))
    ) {
      // An uneven hierarchy can cross the floor on only part of a branch.
      // Its renderable parent covers that part; descending into unloaded
      // fine children would falsely report holes beneath a loaded fallback.
      roots.push(tile);
      return;
    }
    for (const child of children) visit(child);
  };
  visit(root);
  return roots;
};

/**
 * Bounded-cadence content stamp for already discovered floor subtrees.
 * Loading may settle without advancing renderer frameCount.
 */
export const getTilesetFloorContentRevision = (
  roots: readonly Tile[]
): string => {
  const values: Array<number | boolean> = [];
  const visit = (tile: Tile) => {
    const internal = tile.internal;
    const children = tile.children ?? [];
    values.push(
      internal?.loadingState ?? Number.NaN,
      internal?.hasRenderableContent ?? false,
      internal?.hasUnrenderableContent ?? false,
      children.length
    );
    for (const child of children) visit(child);
  };
  for (const root of roots) visit(root);
  return values.join(",");
};

const isLoadedMesh = (tile: Tile): boolean =>
  tile.internal?.hasRenderableContent === true &&
  tile.internal.loadingState === LOADED_LOADING_STATE;

/**
 * Mirrors the Mesh Coverage story's fallback-cut rule. Unprocessed metadata,
 * failed routing nodes and missing children are uncertainty, never coverage.
 */
const classifyFallback = (tile: Tile): FallbackEvidence => {
  if (isLoadedMesh(tile)) return "covered";
  const internal = tile.internal;
  if (!internal) return "unknown";
  if (internal.loadingState === FAILED_LOADING_STATE) return "failed";
  const children = tile.children ?? [];
  if (internal.hasUnrenderableContent) {
    if (internal.loadingState !== LOADED_LOADING_STATE || children.length === 0)
      return "unknown";
  } else if (children.length === 0) {
    return "unknown";
  }
  const childrenEvidence = children.map(classifyFallback);
  if (childrenEvidence.every((evidence) => evidence === "covered"))
    return "covered";
  if (childrenEvidence.some((evidence) => evidence === "failed"))
    return "failed";
  return "unknown";
};

const emptyStatus: ThreeTilesRuntimeCoverageStatus = {
  enabled: false,
  sourcePendingMetadata: false,
  floorArmed: false,
  floorReady: false,
  evidence: THREE_TILES_COVERAGE_EVIDENCE.DISABLED,
  cameraCoverageCertified: false,
  visibleBaseReady: false,
  floorLoaded: 0,
  floorTotal: 0,
  uncoveredFallbackRoots: 0,
  failedFallbackRoots: 0,
  unknownFallbackRoots: 0,
  displayed: 0,
  underlay: 0,
  pending: 0,
  queued: 0,
  downloading: 0,
  parsing: 0,
  requestedErrorTarget: 0,
  effectiveErrorTarget: 0,
  paused: false,
  cacheBytes: 0,
  ceilingBytes: 0,
  traversalRevision: -1,
};

/**
 * Coverage diagnostics cache recursive floor evidence once per traversal.
 * Call update after traversal-owned sets change; public consumers only call
 * getCoverageStatus, which is O(1) and never scans the tile hierarchy.
 */
export const createThreeTilesRuntimeCoverageDiagnostics = () => {
  let lastCoverageRevision = Number.NaN;
  let floorLoaded = 0;
  let floorTotal = 0;
  let failedFallbackRoots = 0;
  let unknownFallbackRoots = 0;
  let status = emptyStatus;

  const update = (
    input: ThreeTilesRuntimeCoverageInput
  ): ThreeTilesRuntimeCoverageStatus => {
    if (input.traversalRevision !== lastCoverageRevision) {
      lastCoverageRevision = input.traversalRevision;
      floorTotal = input.floorRoots.length;
      floorLoaded = 0;
      failedFallbackRoots = 0;
      unknownFallbackRoots = 0;
      for (const root of input.floorRoots) {
        if (isLoadedMesh(root)) floorLoaded += 1;
        const evidence = classifyFallback(root);
        if (evidence === "failed") failedFallbackRoots += 1;
        else if (evidence === "unknown") unknownFallbackRoots += 1;
      }
    }
    const uncoveredFallbackRoots = failedFallbackRoots + unknownFallbackRoots;
    const floorReady =
      input.enabled &&
      !input.sourcePendingMetadata &&
      input.floorArmed &&
      floorTotal > 0 &&
      uncoveredFallbackRoots === 0 &&
      input.pending === 0;
    const evidence = !input.enabled
      ? THREE_TILES_COVERAGE_EVIDENCE.DISABLED
      : input.sourcePendingMetadata
      ? THREE_TILES_COVERAGE_EVIDENCE.SOURCE_PENDING
      : !input.floorArmed
      ? THREE_TILES_COVERAGE_EVIDENCE.FLOOR_NOT_ARMED
      : floorTotal === 0
      ? THREE_TILES_COVERAGE_EVIDENCE.FLOOR_UNKNOWN
      : floorReady
      ? THREE_TILES_COVERAGE_EVIDENCE.FLOOR_CUT_COVERED
      : THREE_TILES_COVERAGE_EVIDENCE.FLOOR_INCOMPLETE;
    status = {
      enabled: input.enabled,
      sourcePendingMetadata: input.sourcePendingMetadata,
      floorArmed: input.floorArmed,
      floorReady,
      evidence,
      cameraCoverageCertified: false,
      visibleBaseReady: input.visibleBaseReady,
      floorLoaded,
      floorTotal,
      uncoveredFallbackRoots,
      failedFallbackRoots,
      unknownFallbackRoots,
      displayed: input.displayed.size,
      underlay: input.underlay.size,
      pending: input.pending,
      queued: input.queued,
      downloading: input.downloading,
      parsing: input.parsing,
      requestedErrorTarget: input.requestedErrorTarget,
      effectiveErrorTarget: input.effectiveErrorTarget,
      paused: input.paused,
      cacheBytes: input.cacheBytes,
      ceilingBytes: input.ceilingBytes,
      traversalRevision: input.traversalRevision,
    };
    return status;
  };

  return {
    update,
    getCoverageStatus: (): ThreeTilesRuntimeCoverageStatus => status,
  };
};
