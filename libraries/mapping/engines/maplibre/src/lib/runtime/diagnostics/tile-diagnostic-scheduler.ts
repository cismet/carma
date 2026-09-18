/** Defer work outside rendering; frame-driven diagnostics bypass idle scheduling. */
export const scheduleTileDiagnosticTask = (
  callback: () => void,
  afterRender = false
): (() => void) => {
  let cancelled = false;
  const host = globalThis as typeof globalThis & {
    scheduler?: {
      postTask: (
        callback: () => void,
        options: { priority: "background" | "user-visible" }
      ) => Promise<void>;
    };
  };
  if (host.scheduler) {
    void host.scheduler.postTask(
      () => {
        if (!cancelled) callback();
      },
      { priority: afterRender ? "user-visible" : "background" }
    );
    return () => {
      cancelled = true;
    };
  }
  const run = () => {
    if (!cancelled) callback();
  };
  if (!afterRender && typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(run, { timeout: 300 });
    return () => {
      cancelled = true;
      cancelIdleCallback(id);
    };
  }
  const id = setTimeout(run, afterRender ? 0 : 16);
  return () => {
    cancelled = true;
    clearTimeout(id);
  };
};
export const yieldTileDiagnosticTask = () =>
  new Promise<void>((resolve) => scheduleTileDiagnosticTask(resolve));
