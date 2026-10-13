type FrameBitmapRequest = {
  id: number;
  frame: VideoFrame;
  options?: ImageBitmapOptions;
};

type FrameBitmapResponse =
  | { id: number; bitmap: ImageBitmap }
  | { id: number; error: string }
  | { id: number; cancelled: true };

type PendingRequest = {
  frame: VideoFrame;
  options?: ImageBitmapOptions;
  resolve: (bitmap: ImageBitmap) => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
  abort?: () => void;
  settled: boolean;
};

const IDLE_WORKER_TIMEOUT_MS = 5000;
let worker: Worker | null = null;
let nextRequestId = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
const pending = new Map<number, PendingRequest>();

const abortError = () =>
  new DOMException("The operation was aborted", "AbortError");

const createDirect = (
  frame: VideoFrame,
  options?: ImageBitmapOptions
): Promise<ImageBitmap> => {
  try {
    return Promise.resolve(createImageBitmap(frame, options));
  } catch (error) {
    return Promise.reject(error);
  }
};

const createDirectAbortable = (
  frame: VideoFrame,
  options: ImageBitmapOptions | undefined,
  signal?: AbortSignal
) => {
  if (!signal) return createDirect(frame, options);
  return new Promise<ImageBitmap>((resolve, reject) => {
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true;
      reject(abortError());
    };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    void createDirect(frame, options).then(
      (bitmap) => {
        cleanup();
        if (settled || signal.aborted) {
          bitmap.close();
          if (!settled) reject(abortError());
          return;
        }
        settled = true;
        resolve(bitmap);
      },
      (error) => {
        cleanup();
        if (settled) return;
        settled = true;
        reject(error);
      }
    );
  });
};

const fallbackToOriginal = (request: PendingRequest, error: unknown) => {
  if (request.signal?.aborted) return request.reject(abortError());
  void createDirectAbortable(
    request.frame,
    request.options,
    request.signal
  ).then(request.resolve, (fallbackError) =>
    request.reject(fallbackError ?? error)
  );
};

const settle = (
  id: number,
  result: { bitmap: ImageBitmap } | { error: unknown } | { cancelled: true },
  fallback: boolean
) => {
  const request = pending.get(id);
  if (!request) {
    if ("bitmap" in result) result.bitmap.close();
    return;
  }
  pending.delete(id);
  request.signal?.removeEventListener("abort", request.abort!);
  if (request.settled) {
    if ("bitmap" in result) result.bitmap.close();
    scheduleIdleTermination();
    return;
  }
  request.settled = true;
  if ("bitmap" in result) {
    request.resolve(result.bitmap);
  } else if ("cancelled" in result) {
    request.reject(abortError());
  } else if (fallback && !request.signal?.aborted) {
    fallbackToOriginal(request, result.error);
  } else {
    request.reject(result.error);
  }
  scheduleIdleTermination();
};

const scheduleIdleTermination = () => {
  if (pending.size || !worker) return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = undefined;
    if (pending.size || !worker) return;
    worker.terminate();
    worker = null;
  }, IDLE_WORKER_TIMEOUT_MS);
};

const failWorker = (error: unknown) => {
  const failedWorker = worker;
  worker = null;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = undefined;
  failedWorker?.terminate();
  for (const id of [...pending.keys()]) settle(id, { error }, true);
};

const getWorker = () => {
  if (worker) return worker;
  const created = new Worker(
    new URL("./frame-image-bitmap.worker.ts", import.meta.url),
    { type: "module" }
  );
  created.onmessage = (event: MessageEvent<FrameBitmapResponse>) => {
    const response = event.data;
    if (worker !== created) {
      if ("bitmap" in response) response.bitmap.close();
      return;
    }
    if ("bitmap" in response) settle(response.id, response, false);
    else if ("cancelled" in response)
      settle(response.id, { cancelled: true }, false);
    else settle(response.id, { error: new Error(response.error) }, true);
  };
  created.onerror = (event) =>
    worker === created && failWorker(event.error ?? new Error(event.message));
  created.onmessageerror = () =>
    worker === created &&
    failWorker(new Error("Invalid bitmap worker response"));
  worker = created;
  return created;
};

/** Convert a decoded frame off the UI thread when a transferable clone is available. */
export const createFrameImageBitmap = (
  frame: VideoFrame,
  options?: ImageBitmapOptions,
  signal?: AbortSignal
): Promise<ImageBitmap> => {
  if (signal?.aborted) return Promise.reject(abortError());
  if (typeof window === "undefined" || typeof document === "undefined")
    return createDirectAbortable(frame, options, signal);
  if (typeof Worker === "undefined" || typeof frame.clone !== "function")
    return createDirectAbortable(frame, options, signal);

  let clone: VideoFrame;
  try {
    clone = frame.clone();
  } catch {
    return createDirectAbortable(frame, options, signal);
  }

  return new Promise<ImageBitmap>((resolve, reject) => {
    const id = ++nextRequestId;
    const request: PendingRequest = {
      frame,
      options,
      resolve,
      reject,
      signal,
      settled: false,
    };
    request.abort = () => {
      if (request.settled) return;
      request.settled = true;
      try {
        worker?.postMessage({ id, cancel: true });
      } catch (error) {
        failWorker(error);
      }
      request.reject(abortError());
    };
    signal?.addEventListener("abort", request.abort, { once: true });
    pending.set(id, request);
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = undefined;
    try {
      getWorker().postMessage(
        {
          id,
          frame: clone,
          options,
        } satisfies FrameBitmapRequest,
        [clone]
      );
    } catch (error) {
      clone.close();
      settle(id, { error }, true);
    }
  });
};
