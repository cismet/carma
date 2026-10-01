import type {
  NearestObliqueImageRecord,
  ObliqueSelectionData,
  ObliqueViewQuery,
} from "../../core/types";
import { createImageSelectionIndex } from "../../core/utils/image-selection-index";
import { rankImagesForView } from "../../core/utils/selection";
import {
  IMAGE_SELECTION_MESSAGE,
  type ImageSelectionRequest,
  type ImageSelectionResponse,
} from "./image-selection-messages";

export type ImageSelectionSearch = {
  query: (
    query: ObliqueViewQuery
  ) => Promise<NearestObliqueImageRecord[] | undefined>;
  dispose: () => void;
};

type PendingQuery = {
  requestId: number;
  query: ObliqueViewQuery;
  resolve: (result: NearestObliqueImageRecord[] | undefined) => void;
};

/** One catalog copy per revision; one active query and only the latest queued request. */
export const createImageSelectionSearch = (
  data: ObliqueSelectionData
): ImageSelectionSearch => {
  let disposed = false;
  if (typeof Worker === "undefined") {
    const index = createImageSelectionIndex(data);
    return {
      query: async (query) =>
        disposed
          ? undefined
          : rankImagesForView(data, query, index.candidates(query)),
      dispose: () => {
        disposed = true;
      },
    };
  }
  let worker: Worker;
  try {
    worker = new Worker(
      new URL("./image-selection.worker.ts", import.meta.url),
      { type: "module" }
    );
  } catch {
    return { query: async () => undefined, dispose: () => {} };
  }
  let requestId = 0;
  let active: PendingQuery | undefined;
  let queued: PendingQuery | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(timer);
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
    active?.resolve(undefined);
    queued?.resolve(undefined);
    active = queued = undefined;
  };
  const start = (pending: PendingQuery) => {
    active = pending;
    timer = setTimeout(dispose, 10000);
    try {
      worker.postMessage({
        type: IMAGE_SELECTION_MESSAGE.QUERY,
        requestId: pending.requestId,
        query: pending.query,
      } satisfies ImageSelectionRequest);
    } catch {
      dispose();
    }
  };
  worker.onmessage = (event: MessageEvent<ImageSelectionResponse>) => {
    const response = event.data;
    if (!active || response.requestId !== active.requestId || disposed) return;
    clearTimeout(timer);
    const result =
      response.type === IMAGE_SELECTION_MESSAGE.RESULT
        ? response.candidates.flatMap(({ imageId, ...candidate }) => {
            const record = data.imageRecords.get(imageId);
            return record ? [{ ...candidate, record }] : [];
          })
        : undefined;
    active.resolve(result);
    active = undefined;
    if (queued) {
      const next = queued;
      queued = undefined;
      start(next);
    }
  };
  worker.onerror = dispose;
  worker.onmessageerror = dispose;
  try {
    worker.postMessage({
      type: IMAGE_SELECTION_MESSAGE.INIT,
      data: {
        ...data,
        datasets: new Map(
          [...data.datasets].map(([id, dataset]) => [
            id,
            { ...dataset, animations: {} },
          ])
        ),
      },
    } satisfies ImageSelectionRequest);
  } catch {
    dispose();
  }
  return {
    query: (query) =>
      new Promise<NearestObliqueImageRecord[] | undefined>((resolve) => {
        if (disposed) {
          resolve(undefined);
          return;
        }
        const pending = { requestId: ++requestId, query, resolve };
        if (!active) start(pending);
        else {
          queued?.resolve(undefined);
          queued = pending;
        }
      }),
    dispose,
  };
};
