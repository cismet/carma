import type {
  ImageLevelStack,
  ImageLevelStackPool,
} from "@carma-commons/image-pyramid";

/** Wait until foreground views settle before the pool applies a new forecast group.
 * A cached coarse view may already be ready while its new forecast view is not yet applied.
 */
export const prewarmNavigationGroup = (
  pool: ImageLevelStackPool,
  forecasts: Parameters<ImageLevelStackPool["prewarmGroup"]>[0],
  ready: () => boolean = () => true
): (() => void) => {
  let cancelled = false;
  let queued = false;
  let started = false;
  let releaseGroup: (() => void) | undefined;
  let unsubscribe: (() => void) | undefined;
  const configured = new WeakMap<ImageLevelStack, number>();
  let configuring = false;
  const retainForecasts = () => {
    if (cancelled || configuring) return;
    configuring = true;
    try {
      for (const forecast of forecasts) {
        const stack = pool.peek(forecast.source);
        if (!stack) continue;
        const pixels = Number.isFinite(forecast.viewportPixels)
          ? Math.max(0, forecast.viewportPixels)
          : 0;
        let essentialBytes = 0;
        if (stack.metrics.visibleReady) {
          const seen = new Set<string>();
          let lastEssentialPriority = -Infinity;
          for (const want of stack.plan?.wants ?? []) {
            if (
              !want.decode ||
              seen.has(want.key) ||
              (want.role !== "floor" &&
                want.role !== "underlay" &&
                want.role !== "target" &&
                want.role !== "target-periphery")
            )
              continue;
            seen.add(want.key);
            // Native tile buffers include boundary padding and all complete
            // display underlays, which can exceed a flat RGBA viewport estimate.
            const bitmap = stack.tile(want.level, want.col, want.row);
            if (bitmap) {
              essentialBytes += bitmap.width * bitmap.height * 4;
              lastEssentialPriority = Math.max(
                lastEssentialPriority,
                want.priority
              );
            }
          }
          // park() keeps resident tiles in planner-priority order. Previously
          // displayed rings can precede target-periphery; include only that
          // unavoidable resident prefix, never finer/idle tail data.
          for (const want of stack.plan?.wants ?? []) {
            if (
              !want.decode ||
              seen.has(want.key) ||
              want.priority > lastEssentialPriority
            )
              continue;
            seen.add(want.key);
            const bitmap = stack.tile(want.level, want.col, want.row);
            if (bitmap) essentialBytes += bitmap.width * bitmap.height * 4;
          }
        }
        const bytes = Math.min(
          Number.MAX_SAFE_INTEGER,
          Math.max(8 * 1024 * 1024, Math.ceil(pixels) * 4 * 4, essentialBytes)
        );
        if ((configured.get(stack) ?? 0) >= bytes) continue;
        // configure replans synchronously and can emit another pool event.
        configured.set(stack, bytes);
        stack.configure({ parkedBudgetBytes: bytes });
      }
    } finally {
      configuring = false;
    }
  };
  const schedule = () => {
    if (cancelled || started || queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (cancelled || started || !ready()) return;
      const pending = pool.metrics.images.some(
        (image) => image.active && !image.visibleReady
      );
      // Errors do not block the core pool either. Avoid the heavier diagnostic
      // snapshot entirely when the cheap readiness metrics already suffice.
      if (
        pending &&
        pool
          .diagnostics()
          .some(
            (image) =>
              image.active && !image.metrics.visibleReady && !image.error
          )
      )
        return;
      started = true;
      releaseGroup = pool.prewarmGroup(forecasts);
      if (cancelled) releaseGroup();
    });
  };
  // Register before prewarmGroup: newly created stacks receive their retention
  // budget before its readiness listener releases and parks the completed view.
  unsubscribe = pool.subscribe(() => {
    retainForecasts();
    schedule();
  });
  retainForecasts();
  schedule();
  return () => {
    if (cancelled) return;
    cancelled = true;
    unsubscribe?.();
    unsubscribe = undefined;
    releaseGroup?.();
  };
};
