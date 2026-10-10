import { preparePhysicalImageQuery } from "./image-selection-ecef";
import type {
  NearestObliqueImageRecord,
  ObliqueSelectionData,
  ObliqueViewQuery,
} from "../../core/types";
import { createImageSelectionIndex } from "../../core/utils/image-selection-index";
import { rankImagesForViewWithDirectionalFallback } from "../../core/utils/selection";
import {
  IMAGE_SELECTION_MESSAGE,
  MAX_IMAGE_SELECTION_BATCH_SIZE,
  type ImageSelectionBatchResult,
  type ImageSelectionCandidate,
  type ImageSelectionRequest,
  type ImageSelectionResponse,
} from "./image-selection-messages";

export type ImageSelectionSearch = {
  /** Append new cardinal catalog shards without recreating the worker or its indexes. */
  update: (data: ObliqueSelectionData) => void;
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
  let currentData = data;
  if (typeof Worker === "undefined") {
    let index = createImageSelectionIndex(data, { groundCenters: true });
    let datasetKey = [...data.datasets.keys()].sort().join("|");
    let recordCount = data.imageRecords.size;
    const rank = async (query: ObliqueViewQuery) => {
      query = await preparePhysicalImageQuery(query, currentData);
      return rankImagesForViewWithDirectionalFallback(
        currentData,
        query,
        (allDirections, candidateQuery) =>
          index.candidates(candidateQuery, {
            allDirections,
            limitPerDirection: 256,
          })
      );
    };
    return {
      update: (nextData) => {
        if (disposed) return;
        currentData = nextData;
        const nextDatasetKey = [...nextData.datasets.keys()].sort().join("|");
        if (
          nextDatasetKey !== datasetKey ||
          nextData.imageRecords.size < recordCount
        ) {
          datasetKey = nextDatasetKey;
          index = createImageSelectionIndex(nextData, { groundCenters: true });
        } else index.append(nextData);
        recordCount = nextData.imageRecords.size;
      },
      query: async (query) => (disposed ? undefined : rank(query)),
      queryBatch: async (queries) => {
        assertBatchBound(queries);
        return disposed
          ? emptyBatch(queries)
          : Promise.all(
              queries.map(async (query) => {
                try {
                  return await rank(query);
                } catch {
                  return undefined;
                }
              })
            );
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
      update: () => {},
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
  let catalogTimer: ReturnType<typeof setTimeout> | undefined;
  let catalogReady = false;
  let pumpingCatalog = false;
  let indexedRecordCount = 0;
  let firstChunk = true;
  let catalogRevision = 0;
  let datasetKey = [...data.datasets.keys()].sort().join("|");
  let catalogRecordCount = 0;
  let catalogEntries: ReturnType<
    ObliqueSelectionData["imageRecords"]["entries"]
  >;
  let nextCatalogRecord: ReturnType<typeof catalogEntries.next>;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(timer);
    clearTimeout(catalogTimer);
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
  const startNext = () => {
    if (disposed || !catalogReady || active) return;
    const next =
      queuedQuery &&
      (!queuedBatch || queuedQuery.requestId < queuedBatch.requestId)
        ? queuedQuery
        : queuedBatch;
    if (next?.type === IMAGE_SELECTION_MESSAGE.QUERY) queuedQuery = undefined;
    else if (next) queuedBatch = undefined;
    if (next) start(next);
  };
  const hydrate = (candidates: ImageSelectionCandidate[]) =>
    candidates.flatMap(({ imageId, ...candidate }) => {
      const record = currentData.imageRecords.get(imageId);
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
    startNext();
  };
  worker.onerror = dispose;
  worker.onmessageerror = dispose;
  // Transfer only newly added records. Map insertion order is stable across catalog
  // publications, so skipping the already-indexed prefix is cheap and avoids a second
  // structured clone of all previously loaded cardinal shards.
  const sendCatalog = () => {
    if (disposed || pumpingCatalog) return;
    pumpingCatalog = true;
    const target = currentData;
    const imageRecords: ObliqueSelectionData["imageRecords"] = new Map();
    const centers: ObliqueSelectionData["centers"] = new Map();
    for (let i = 0; i < 512 && !nextCatalogRecord.done; i++) {
      const [id, sourceRecord] = nextCatalogRecord.value;
      const record =
        sourceRecord.footprintApproximate && sourceRecord.footprint
          ? (({ footprint: _footprint, ...metadata }) => metadata)(sourceRecord)
          : sourceRecord;
      imageRecords.set(id, record);
      const center = target.centers.get(id);
      if (center) centers.set(id, center);
      nextCatalogRecord = catalogEntries.next();
    }
    const done = nextCatalogRecord.done;
    const sentCount = imageRecords.size;
    const revision = catalogRevision;
    try {
      worker.postMessage({
        type: IMAGE_SELECTION_MESSAGE.INIT,
        append: !firstChunk,
        complete: done,
        revision: done ? revision : undefined,
        data: {
          imageRecords,
          centers,
          datasets:
            sentCount > 0 || firstChunk
              ? new Map(
                  [...target.datasets].map(([id, dataset]) => [
                    id,
                    { ...dataset, animations: {} },
                  ])
                )
              : new Map(),
        },
      } satisfies ImageSelectionRequest);
      indexedRecordCount += sentCount;
      firstChunk = false;
      if (done) {
        catalogReady = true;
        pumpingCatalog = false;
        startNext();
        if (currentData.imageRecords.size > indexedRecordCount)
          catalogTimer = setTimeout(sendCatalog, 0);
      } else {
        pumpingCatalog = false;
        catalogTimer = setTimeout(sendCatalog, 0);
      }
    } catch {
      pumpingCatalog = false;
      dispose();
    }
  };
  const enqueue = (pending: Pending) => {
    if (disposed) {
      cancel(pending);
      return;
    }
    if (catalogReady && !active) start(pending);
    else if (pending.type === IMAGE_SELECTION_MESSAGE.QUERY) {
      cancel(queuedQuery);
      queuedQuery = pending;
    } else {
      cancel(queuedBatch);
      queuedBatch = pending;
    }
  };
  const update = (nextData: ObliqueSelectionData) => {
    if (disposed) return;
    currentData = nextData;
    const nextDatasetKey = [...nextData.datasets.keys()].sort().join("|");
    const needsTransfer =
      firstChunk ||
      nextDatasetKey !== datasetKey ||
      nextData.imageRecords.size !== catalogRecordCount;
    if (!needsTransfer) return;
    if (
      nextDatasetKey !== datasetKey ||
      nextData.imageRecords.size < indexedRecordCount
    ) {
      datasetKey = nextDatasetKey;
      indexedRecordCount = 0;
      firstChunk = true;
      catalogReady = false;
    }
    catalogRecordCount = nextData.imageRecords.size;
    catalogRevision++;
    // Keep this cursor between chunks. Skip the existing prefix only when a new
    // catalog publication replaces the map, rather than once per 512 records.
    catalogEntries = nextData.imageRecords.entries();
    nextCatalogRecord = catalogEntries.next();
    for (let i = 0; i < indexedRecordCount && !nextCatalogRecord.done; i++)
      nextCatalogRecord = catalogEntries.next();
    if (nextData.imageRecords.size > indexedRecordCount || firstChunk) {
      catalogReady = false;
      clearTimeout(catalogTimer);
      catalogTimer = setTimeout(sendCatalog, 0);
    }
  };
  const search: ImageSelectionSearch = {
    update,
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
  update(data);
  return search;
};
