import type { Tile } from "3d-tiles-renderer/core";
import { isMeshCoverageRemovalSafe } from "../../core/mesh-tile-coverage";
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

export type ThreeTilesReserveCoverage = Readonly<{
  known: number;
  demanded: number;
  resident: number;
  renderable: number;
  covered: number;
  totalKnown: boolean;
  /** Whole-region ratio; null until the denominator is known. */
  ratio: number | null;
  ready: boolean;
}>;

export type ThreeTilesClosureCoverage = Pick<
  ThreeTilesReserveCoverage,
  "known" | "covered" | "totalKnown" | "ratio" | "ready"
>;

export type ThreeTilesRuntimeCoverageStatus = Readonly<{
  enabled: boolean;
  presentationMode: "exclusive-mesh" | "exclusive-shadow";
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
  baseCoverage: ThreeTilesReserveCoverage;
  /** Current traversal's admitted transition ring, not the whole tileset. */
  seamCoverage: ThreeTilesReserveCoverage;
  /** Whole-base cut compatible with the currently committed fine cut. */
  closureCoverage: ThreeTilesClosureCoverage;
  waitingForBase: boolean;
  floorLoaded: number;
  floorTotal: number;
  uncoveredFallbackRoots: number;
  failedFallbackRoots: number;
  unknownFallbackRoots: number;
  displayed: number;
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
  /** Native FAILED also parks intentionally deferred payloads without an error. */
  deferredTiles?: ReadonlySet<Tile>;
  /** Current traversal's known ring-one payload demand. */
  seamTiles?: readonly Tile[];
  isResident?: (tile: Tile) => boolean;
  isRenderable?: (tile: Tile) => boolean;
  isDemanded?: (tile: Tile) => boolean;
  closureCoverage?: Omit<ThreeTilesClosureCoverage, "ratio">;
  displayed: ReadonlySet<Tile>;
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
  roots: readonly Tile[],
  deferredTiles?: ReadonlySet<Tile>
): string => {
  const values: Array<number | boolean> = [];
  const visit = (tile: Tile) => {
    const internal = tile.internal;
    const children = tile.children ?? [];
    values.push(
      internal?.loadingState ?? Number.NaN,
      internal?.hasRenderableContent ?? false,
      internal?.hasUnrenderableContent ?? false,
      deferredTiles?.has(tile) ?? false,
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

const isKnownFloorRegion = (tile: Tile): boolean => {
  const internal = tile.internal;
  if (!internal) return false;
  if (internal.hasRenderableContent) return true;
  const children = tile.children ?? [];
  return (
    children.length > 0 &&
    (!internal.hasUnrenderableContent ||
      internal.loadingState === LOADED_LOADING_STATE) &&
    children.every(isKnownFloorRegion)
  );
};

/** A fallback needs real geometry; unknown topology is never coverage. */
const classifyFallback = (
  tile: Tile,
  deferredTiles?: ReadonlySet<Tile>
): FallbackEvidence => {
  if (isLoadedMesh(tile)) return "covered";
  const internal = tile.internal;
  if (!internal) return "unknown";
  if (
    internal.loadingState === FAILED_LOADING_STATE &&
    !deferredTiles?.has(tile)
  )
    return "failed";
  const children = tile.children ?? [];
  if (internal.hasUnrenderableContent) {
    if (internal.loadingState !== LOADED_LOADING_STATE || children.length === 0)
      return "unknown";
  } else if (children.length === 0) {
    return "unknown";
  }
  const childrenEvidence = children.map((child) =>
    classifyFallback(child, deferredTiles)
  );
  if (childrenEvidence.every((evidence) => evidence === "covered"))
    return "covered";
  if (childrenEvidence.some((evidence) => evidence === "failed"))
    return "failed";
  return "unknown";
};

const emptyStatus: ThreeTilesRuntimeCoverageStatus = {
  enabled: false,
  presentationMode: "exclusive-mesh",
  sourcePendingMetadata: false,
  floorArmed: false,
  floorReady: false,
  evidence: THREE_TILES_COVERAGE_EVIDENCE.DISABLED,
  cameraCoverageCertified: false,
  visibleBaseReady: false,
  baseCoverage: {
    known: 0,
    demanded: 0,
    resident: 0,
    renderable: 0,
    covered: 0,
    totalKnown: false,
    ratio: null,
    ready: false,
  },
  seamCoverage: {
    known: 0,
    demanded: 0,
    resident: 0,
    renderable: 0,
    covered: 0,
    totalKnown: false,
    ratio: null,
    ready: false,
  },
  closureCoverage: {
    known: 0,
    covered: 0,
    totalKnown: false,
    ratio: null,
    ready: false,
  },
  waitingForBase: false,
  floorLoaded: 0,
  floorTotal: 0,
  uncoveredFallbackRoots: 0,
  failedFallbackRoots: 0,
  unknownFallbackRoots: 0,
  displayed: 0,
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
        const evidence = classifyFallback(root, input.deferredTiles);
        if (evidence === "failed") failedFallbackRoots += 1;
        else if (evidence === "unknown") unknownFallbackRoots += 1;
      }
    }
    const uncoveredFallbackRoots = failedFallbackRoots + unknownFallbackRoots;
    const resident = input.isResident ?? isLoadedMesh;
    const renderable = input.isRenderable ?? isLoadedMesh;
    const readyTile = (tile: Tile) => resident(tile) && renderable(tile);
    const reserveCoverage = (
      roots: readonly Tile[],
      totalKnown: boolean,
      includeDescendants: boolean
    ): ThreeTilesReserveCoverage => {
      const covered = roots.filter(
        (tile) =>
          readyTile(tile) ||
          (includeDescendants &&
            isMeshCoverageRemovalSafe(tile, { has: readyTile }, () => false))
      ).length;
      return {
        known: roots.length,
        demanded: roots.filter(input.isDemanded ?? (() => false)).length,
        resident: roots.filter(resident).length,
        renderable: roots.filter(readyTile).length,
        covered,
        totalKnown,
        ratio: totalKnown && roots.length > 0 ? covered / roots.length : null,
        ready: totalKnown && roots.length > 0 && covered === roots.length,
      };
    };
    // collectTilesetFloorRoots retains unopened routing pages as placeholders.
    // Those are known branches, never the final payload denominator.
    const floorTotalKnown =
      input.enabled &&
      !input.sourcePendingMetadata &&
      input.floorRoots.length > 0 &&
      input.floorRoots.every(isKnownFloorRegion);
    const baseCoverage = reserveCoverage(
      input.floorRoots,
      floorTotalKnown,
      true
    );
    const seamCoverage = reserveCoverage(input.seamTiles ?? [], false, false);
    const closure = input.closureCoverage ?? baseCoverage;
    const closureCoverage = {
      known: closure.known,
      covered: closure.covered,
      totalKnown: closure.totalKnown,
      ready: input.enabled && !input.sourcePendingMetadata && closure.ready,
      ratio:
        closure.totalKnown && closure.known > 0
          ? closure.covered / closure.known
          : null,
    };
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
      presentationMode: input.closureCoverage
        ? "exclusive-shadow"
        : "exclusive-mesh",
      sourcePendingMetadata: input.sourcePendingMetadata,
      floorArmed: input.floorArmed,
      floorReady,
      evidence,
      cameraCoverageCertified: false,
      visibleBaseReady: input.visibleBaseReady,
      baseCoverage,
      seamCoverage,
      closureCoverage,
      waitingForBase:
        input.enabled && (!input.floorArmed || !closureCoverage.ready),
      floorLoaded,
      floorTotal,
      uncoveredFallbackRoots,
      failedFallbackRoots,
      unknownFallbackRoots,
      displayed: input.displayed.size,
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
