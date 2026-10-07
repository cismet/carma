import type {
  NearestObliqueImageRecord,
  ObliqueSelectionData,
  ObliqueViewQuery,
} from "../../core/types";
import { createImageSelectionIndex } from "../../core/utils/image-selection-index";
import { rankImagesForView } from "../../core/utils/selection";
import {
  IMAGE_SELECTION_MESSAGE,
  MAX_IMAGE_SELECTION_BATCH_SIZE,
  type ImageSelectionBatchResult,
  type ImageSelectionCandidate,
  type ImageSelectionRequest,
  type ImageSelectionResponse,
} from "./image-selection-messages";

export type ImageSelectionSearch = {
  query: (
    query: ObliqueViewQuery
  ) => Promise<NearestObliqueImageRecord[] | undefined>;
  queryBatch: (
    queries: ObliqueViewQuery[]
  ) => Promise<ImageSelectionBatchResult>;
  dispose: () => void;
};
type PendingQuery = {
  type: typeof IMAGE_SELECTION_MESSAGE.QUERY;
  requestId: number;
  query: ObliqueViewQuery;
  resolve: (result: NearestObliqueImageRecord[] | undefined) => void;
};
type PendingBatch = {
  type: typeof IMAGE_SELECTION_MESSAGE.QUERY_BATCH;
  requestId: number;
  queries: ObliqueViewQuery[];
  resolve: (result: ImageSelectionBatchResult) => void;
};
type Pending = PendingQuery | PendingBatch;
const assertBatchBound = (queries: ObliqueViewQuery[]) => {
  if (queries.length > MAX_IMAGE_SELECTION_BATCH_SIZE)
    throw new RangeError("Image navigation batch exceeds twelve queries.");
};
const emptyBatch = (queries: ObliqueViewQuery[]): ImageSelectionBatchResult =>
  queries.map(() => undefined);
const cancel = (pending?: Pending) => {
  if (pending?.type === IMAGE_SELECTION_MESSAGE.QUERY)
    pending.resolve(undefined);
  else if (pending) pending.resolve(emptyBatch(pending.queries));
};

/** One catalog copy, one active RPC, and independent latest queued scalar/navigation lanes. */
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
      queryBatch: async (queries) => {
        assertBatchBound(queries);
        return disposed
          ? emptyBatch(queries)
          : queries.map((query) => {
              try {
                return rankImagesForView(data, query, index.candidates(query));
              } catch {
                return undefined;
              }
            });
      },
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
    return {
      query: async () => undefined,
      queryBatch: async (queries) => {
        assertBatchBound(queries);
        return emptyBatch(queries);
      },
      dispose: () => {},
    };
  }
  let requestId = 0;
  let active: Pending | undefined;
  let queuedQuery: PendingQuery | undefined;
  let queuedBatch: PendingBatch | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(timer);
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
    cancel(active);
    cancel(queuedQuery);
    cancel(queuedBatch);
    active = queuedQuery = queuedBatch = undefined;
  };
  const start = (pending: Pending) => {
    active = pending;
    timer = setTimeout(dispose, 10000);
    try {
      worker.postMessage(
        pending.type === IMAGE_SELECTION_MESSAGE.QUERY
          ? ({
              type: pending.type,
              requestId: pending.requestId,
              query: pending.query,
            } satisfies ImageSelectionRequest)
          : ({
              type: pending.type,
              requestId: pending.requestId,
              queries: pending.queries,
            } satisfies ImageSelectionRequest)
      );
    } catch {
      dispose();
    }
  };
  const hydrate = (candidates: ImageSelectionCandidate[]) =>
    candidates.flatMap(({ imageId, ...candidate }) => {
      const record = data.imageRecords.get(imageId);
      return record ? [{ ...candidate, record }] : [];
    });
  worker.onmessage = (event: MessageEvent<ImageSelectionResponse>) => {
    const response = event.data;
    if (!active || response.requestId !== active.requestId || disposed) return;
    clearTimeout(timer);
    if (active.type === IMAGE_SELECTION_MESSAGE.QUERY)
      active.resolve(
        response.type === IMAGE_SELECTION_MESSAGE.RESULT
          ? hydrate(response.candidates)
          : undefined
      );
    else
      active.resolve(
        response.type === IMAGE_SELECTION_MESSAGE.RESULT_BATCH
          ? active.queries.map((_, i) =>
              response.candidates[i]
                ? hydrate(response.candidates[i]!)
                : undefined
            )
          : emptyBatch(active.queries)
      );
    active = undefined;
    const next =
      queuedQuery &&
      (!queuedBatch || queuedQuery.requestId < queuedBatch.requestId)
        ? queuedQuery
        : queuedBatch;
    if (next?.type === IMAGE_SELECTION_MESSAGE.QUERY) queuedQuery = undefined;
    else if (next) queuedBatch = undefined;
    if (next) start(next);
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
  const enqueue = (pending: Pending) => {
    if (disposed) {
      cancel(pending);
      return;
    }
    if (!active) start(pending);
    else if (pending.type === IMAGE_SELECTION_MESSAGE.QUERY) {
      cancel(queuedQuery);
      queuedQuery = pending;
    } else {
      cancel(queuedBatch);
      queuedBatch = pending;
    }
  };
  return {
    query: (query) =>
      new Promise((resolve) =>
        enqueue({
          type: IMAGE_SELECTION_MESSAGE.QUERY,
          requestId: ++requestId,
          query,
          resolve,
        })
      ),
    queryBatch: (queries) => {
      assertBatchBound(queries);
      return new Promise((resolve) =>
        enqueue({
          type: IMAGE_SELECTION_MESSAGE.QUERY_BATCH,
          requestId: ++requestId,
          queries,
          resolve,
        })
      );
    },
    dispose,
  };
};
