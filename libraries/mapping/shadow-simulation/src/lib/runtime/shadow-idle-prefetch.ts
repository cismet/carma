type ShadowIdlePrefetchRequest = Readonly<{
  key: string;
  run: (signal: AbortSignal) => Promise<unknown>;
}>;

type BackgroundScheduler = {
  postTask: (
    callback: () => void | Promise<void>,
    options: { priority: "background"; delay: number; signal: AbortSignal }
  ) => Promise<void>;
};

export const yieldShadowIdleTask = (signal: AbortSignal): Promise<void> => {
  const scheduler = (
    globalThis as typeof globalThis & { scheduler?: BackgroundScheduler }
  ).scheduler;
  // Called only inside a supported native idle job; absence never falls back
  // to synchronous work or a self-sustaining animation/timer loop.
  if (!scheduler?.postTask)
    return Promise.reject(new Error("Background scheduler unavailable"));
  return scheduler.postTask(() => undefined, {
    priority: "background",
    delay: 0,
    signal,
  });
};

/** A settled shadow frame may offer one bounded terrain-cache job to the native
 * background scheduler. No timer fallback, retries or foreground repaints.
 */
export const createShadowIdleTerrainPrefetch = ({
  getRequest,
}: {
  getRequest: () => ShadowIdlePrefetchRequest | null;
}) => {
  let disposed = false;
  let lastScheduledKey: string | null = null;
  let controller: AbortController | null = null;
  let pendingSettled = false;
  const cancel = () => {
    pendingSettled = false;
    controller?.abort();
  };

  const onSettled = () => {
    if (disposed) return;
    if (controller) {
      // A shared fetch may outlive cancellation. Remember one fresh settled
      // event, even while the terrain runtime still reports itself as busy.
      pendingSettled = true;
      return;
    }
    try {
      const scheduler = (
        globalThis as typeof globalThis & { scheduler?: BackgroundScheduler }
      ).scheduler;
      if (typeof scheduler?.postTask !== "function") return;
      const request = getRequest();
      if (!request || request.key === lastScheduledKey) return;
      lastScheduledKey = request.key;
      const taskController = new AbortController();
      controller = taskController;
      let callbackRunning = false;
      const complete = () => {
        // Even an early scheduler rejection must not release an asynchronous
        // preparation that still owns the runtime's shared in-flight fetch.
        if (controller !== taskController || callbackRunning) return;
        controller = null;
        const offerLatest = pendingSettled;
        pendingSettled = false;
        // Only an explicit newer settled event permits this one recheck. A
        // missing request or failed task never starts a polling/retry loop.
        if (offerLatest) onSettled();
      };
      try {
        void scheduler
          .postTask(
            async () => {
              if (disposed || taskController.signal.aborted) return;
              const current = getRequest();
              if (!current || current.key !== request.key) return;
              callbackRunning = true;
              try {
                await current.run(taskController.signal);
              } finally {
                callbackRunning = false;
                complete();
              }
            },
            {
              priority: "background",
              delay: 150,
              signal: taskController.signal,
            }
          )
          .then(complete, complete);
      } catch {
        complete();
      }
    } catch {
      // Optional availability/scheduler failures never affect the foreground.
    }
  };

  return {
    onSettled,
    cancel,
    dispose() {
      disposed = true;
      cancel();
    },
  };
};
