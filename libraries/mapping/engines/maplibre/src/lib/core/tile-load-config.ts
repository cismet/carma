const MIB = 1024 ** 2;

export const TILES_LOAD_POLICY = {
  /** First visible complete cut; coarser payloads are resident reserves only. */
  firstImageMaxErrorPixels: 64,
  /** Coarse visible improvements precede sub-threshold detail within a camera lane. */
  coarseRefinementErrorPixels: 20,
  memoryCheckIntervalMs: 1_000,
  heapPauseFraction: 0.8,
  heapResumeFraction: 0.65,
  /** Fov multiplier for non-terrain prefetch. Mesh reserve uses full rings. */
  prefetchMarginFovFactor: 1.25,
  /** Nested camera footprints; the region beyond the final ring uses the floor.
   * Ring k permits anchor error × 2^k, producing progressively coarser coverage
   * around the view without independently narrowing each child's footprint.
   */
  idleRingTanMultipliers: [2.25, 4.3, 8.2, 17, 43],
  /** Bounded idle passes refining the reserve's error anchor. */
  idleRingRefinePassLimit: 5,
  /**
   * Each full ring stops one level coarser than the previous ring. The
   * anchor is the base error target (the level the view itself falls back
   * to while it moves) unless idleRingAnchorPixels sets another.
   */
  idleRingLevelStep: 1,
  idleRingAnchorPixels: null as number | null,
  /**
   * Ancestors of the extent floor report at least this multiple of the
   * error target so the traversal reaches the floor tiles every frame,
   * whatever the target: a visited tile is used, and a used tile is never
   * an eviction candidate.
   */
  extentFloorAncestorErrorFactor: 4,
  /**
   * The rings admit new tiles only while the cache stays under this share of
   * the LRU retention floor, so loaded ring tiles are never the ones the LRU
   * has to evict; loaded ones stay pinned regardless.
   */
  idleRingBudgetFraction: 0.9,
  /**
   * Once every ring is loaded and the queues are idle, the cascade refines
   * one level per pass while memory stays within the budget and a traversal
   * costs less than this many milliseconds; a camera move restarts from the
   * coarse cascade so the inner rings always come first.
   */
  idleRingRefineTraversalBudgetMs: 6,
  idleRingRefineIntervalMs: 1_500,
  /**
   * Whole-extent residency from an entry hint: the deepest level whose
   * cumulative payload bytes × this resident factor (decoded textures and
   * geometry, measured ≈7.6× the transfer size) stays within this share of
   * the cache ceiling, never above the hinted level.
   */
  extentResidentBytesPerTransferByte: 7.6,
  extentMemoryShare: 0.1,
  extentMemoryShareMin: 0.05,
  extentMemoryShareMax: 0.15,
  /**
   * Memory-adaptive error target: at the admission ceiling with an
   * unconverged view the effective target rises by this factor (never above
   * the base error target) after the raise delay; it relaxes one step once
   * the cache is below this share of the ceiling for the relax delay.
   */
  memoryTargetStep: 1.5,
  memoryTargetRaiseAfterMs: 2_000,
  memoryTargetRelaxAfterMs: 6_000,
  memoryTargetRelaxBelow: 0.6,
  /** Settled quality probes need this free share and a predicted family slot. */
  memoryTargetProbeHeadroom: 0.1,
  /** CPU copies of textures/geometry stay alive next to the GPU upload. */
  residentOverhead: 1.5,
  /** Drift slack above the ceiling before the over-max abort loop may run. */
  cacheDriftSlackMinBytes: 64 * MIB,
  cacheDriftSlackEstimates: 8,
  /** Fraction of the ceiling retained by the asynchronous eviction. */
  cacheRetentionFraction: 0.75,
  cacheUnloadPercent: 0.05,
  /** Cache bound change that warrants re-applying the cache configuration. */
  cacheBoundsReapplyBytes: 8 * MIB,
  minimumRequestConcurrency: 4,
  maximumRequestConcurrency: 64,
} as const;
