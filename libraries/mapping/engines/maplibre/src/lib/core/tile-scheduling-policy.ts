import { TILE_CAMERA_PRIORITY } from "./tile-camera-demand";

/** Pure decisions: callers collect current facts and retain ownership of effects.
 * Decision: ../../../TILES_COVERAGE.md#functional-decision-pipelines
 */
export const resolveTileRequestPriority = (
  input: Readonly<{
    replacementSupport: boolean;
    cameraPriority: number;
    motionPrefetch: boolean;
    observerVisible: boolean;
    selectedShadowReceiver: boolean;
    shadowWithoutSelection: boolean;
  }>
): number => {
  if (input.replacementSupport) return TILE_CAMERA_PRIORITY.COVERAGE_REPAIR;
  return Math.max(
    input.cameraPriority,
    input.motionPrefetch
      ? TILE_CAMERA_PRIORITY.PREFETCH
      : Number.NEGATIVE_INFINITY,
    // Decision: ../../../TILES_COVERAGE.md#progressive-shadow-families-and-wait-telemetry
    // Visible refinement owns the foreground lane. Offscreen siblings needed
    // for its atomic replacement already inherit replacementSupport above.
    input.observerVisible
      ? TILE_CAMERA_PRIORITY.PRIMARY
      : Number.NEGATIVE_INFINITY,
    input.selectedShadowReceiver || input.shadowWithoutSelection
      ? TILE_CAMERA_PRIORITY.SECONDARY
      : Number.NEGATIVE_INFINITY
  );
};

export const TILE_QUEUE_STAGE = {
  DOWNLOAD: "download",
  PARSE: "parse",
} as const;
export const TILE_QUEUE_ACTION = {
  RUN: "run",
  PARK: "park",
  DISCARD: "discard",
} as const;
export const TILE_QUEUE_REASON = {
  CURRENT_DEMAND: "current-demand",
  NO_CURRENT_DEMAND: "no-current-demand",
  VIEWPORT_FILL_FIRST: "viewport-fill-first",
  COVERAGE_CAPACITY: "coverage-capacity",
  FOREGROUND: "foreground",
  IDLE_RESERVE: "idle-reserve",
  MOTION: "camera-motion",
  HIGHER_PRIORITY: "higher-priority-work",
  REFINEMENT: "refinement-deferred",
} as const;

/** Need is independent of admission: parked work retains its native promise. */
export const resolveTileRequestAdmission = (
  input: Readonly<{
    needed: boolean;
    coverageRecovery: boolean;
    coverageFill: boolean;
    stage: (typeof TILE_QUEUE_STAGE)[keyof typeof TILE_QUEUE_STAGE];
  }>
) => {
  if (!input.needed) return TILE_QUEUE_REASON.NO_CURRENT_DEMAND;
  if (
    input.coverageRecovery &&
    !input.coverageFill &&
    input.stage === TILE_QUEUE_STAGE.DOWNLOAD
  )
    return TILE_QUEUE_REASON.VIEWPORT_FILL_FIRST;
  return TILE_QUEUE_REASON.CURRENT_DEMAND;
};

export const resolveTileQueueDecision = (
  input: Readonly<{
    admission: ReturnType<typeof resolveTileRequestAdmission>;
    foregroundEligible: boolean;
    priority: number;
    motionPrefetch: boolean;
    highestPendingPriority: number;
    moving: boolean;
  }>
) => {
  if (input.admission === TILE_QUEUE_REASON.NO_CURRENT_DEMAND)
    return { action: TILE_QUEUE_ACTION.DISCARD, reason: input.admission };
  // Hard admission rules precede the idle fallback, even if every finite-rank
  // request is currently waiting on metadata, retry or an active download.
  if (input.admission === TILE_QUEUE_REASON.VIEWPORT_FILL_FIRST)
    return { action: TILE_QUEUE_ACTION.PARK, reason: input.admission };
  if (
    input.foregroundEligible &&
    (!input.motionPrefetch ||
      input.priority >= 0 ||
      input.highestPendingPriority < 0)
  )
    return {
      action: TILE_QUEUE_ACTION.RUN,
      reason: TILE_QUEUE_REASON.FOREGROUND,
    };
  if (
    !Number.isFinite(input.priority) &&
    !input.moving &&
    !Number.isFinite(input.highestPendingPriority)
  )
    return {
      action: TILE_QUEUE_ACTION.RUN,
      reason: TILE_QUEUE_REASON.IDLE_RESERVE,
    };
  return {
    action: TILE_QUEUE_ACTION.PARK,
    reason:
      !Number.isFinite(input.priority) && input.moving
        ? TILE_QUEUE_REASON.MOTION
        : input.foregroundEligible || !Number.isFinite(input.priority)
        ? TILE_QUEUE_REASON.HIGHER_PRIORITY
        : TILE_QUEUE_REASON.REFINEMENT,
  };
};

export const resolveTileParseConcurrency = (
  input: Readonly<{
    paused: boolean;
    moving: boolean;
    zooming: boolean;
    providesTerrain: boolean;
    normal: number;
    motionLimit: number;
  }>
): number => {
  if (input.paused) return 0;
  if (!input.moving || !input.providesTerrain) return input.normal;
  return Math.min(
    input.normal,
    input.zooming ? Math.min(1, input.motionLimit) : input.motionLimit
  );
};

export const resolveTileDownloadConcurrency = (
  input: Readonly<{
    active: number;
    providesTerrain: boolean;
    moving: boolean;
    baseCoverageReady: boolean;
    parseBacklog: number;
    foregroundBacklog: number;
    sharedTerrainLoading: boolean;
  }>,
  limits: Readonly<{
    mesh: number;
    motion: number;
    backlogSoft: number;
    backlogHard: number;
    backgroundBacklog: number;
    terrainBootstrap: number;
  }>
): number => {
  if (!input.providesTerrain) {
    return input.sharedTerrainLoading
      ? Math.min(limits.terrainBootstrap, input.active)
      : input.active;
  }
  const pipeline = !input.baseCoverageReady
    ? limits.mesh
    : input.foregroundBacklog >= limits.backlogHard
    ? 0
    : input.parseBacklog >= limits.backlogSoft
    ? limits.backgroundBacklog
    : limits.mesh;
  return Math.min(
    input.active,
    input.moving ? Math.min(limits.motion, pipeline) : pipeline
  );
};

export const resolveMeshStageTarget = (
  input: Readonly<{
    shadowView: boolean;
    minimumTarget: number;
    initialTarget: number;
    handoverTarget?: number;
    handoverReady: boolean;
    firstImageReady: boolean;
  }>
): number => {
  // Decision: ../../../TILES_COVERAGE.md#independent-refinement-after-observer-handover
  // Handover releases local replacement families, not a global reserve or
  // intermediate pixel-error wave. Their ready parents remain the fallback.
  if (input.handoverReady) return input.minimumTarget;
  if (input.handoverTarget !== undefined)
    return input.firstImageReady
      ? Math.max(input.minimumTarget, input.handoverTarget)
      : input.initialTarget;
  return input.shadowView ? input.minimumTarget : input.initialTarget;
};

/** Ordered preemption consumes one waiting slot only when it aborts a useful
 * lower-priority download. Obsolete jobs never consume that slot.
 */
export const TILE_REQUEST_ACTION = {
  KEEP: "keep",
  OBSOLETE: "obsolete",
  PREEMPT: "preempt",
} as const;
export const decideTileRequestAction = (
  input: Readonly<{
    needed: boolean;
    downloading: boolean;
    metadata: boolean;
    priority: number;
    highestWaitingPriority: number | undefined;
  }>
): (typeof TILE_REQUEST_ACTION)[keyof typeof TILE_REQUEST_ACTION] => {
  if (!input.needed) return TILE_REQUEST_ACTION.OBSOLETE;
  if (
    input.downloading &&
    !input.metadata &&
    input.highestWaitingPriority !== undefined &&
    input.priority < input.highestWaitingPriority
  )
    return TILE_REQUEST_ACTION.PREEMPT;
  return TILE_REQUEST_ACTION.KEEP;
};
