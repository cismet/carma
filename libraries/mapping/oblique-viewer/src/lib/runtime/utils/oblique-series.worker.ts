/// <reference lib="webworker" />
import { loadWithOptionalCatalogCache } from "./optional-catalog-cache";
import type { ObliqueDataset } from "../../core/types";
import type { ObliqueData } from "./load-oblique-series";

type CatalogEntries = Pick<ObliqueData, "imageRecords" | "centers">;
/** Leading `chunk` messages, then one `data` (remaining entries) or `error` message. */
export type ObliqueSeriesWorkerMessage = {
  chunk?: CatalogEntries;
  data?: ObliqueData;
  error?: string;
};

/**
 * The main thread deserializes every message in one task; a 34k-image catalog in one
 * message blocks it for ~100 ms. Chunks keep each task short without changing the data.
 */
const CHUNK_ENTRIES = 4096;

const post = (message: ObliqueSeriesWorkerMessage) => self.postMessage(message);

self.onmessage = async (
  event: MessageEvent<{
    dataset: ObliqueDataset;
    fetchPriority?: RequestPriority;
  }>
) => {
  try {
    const data = await loadWithOptionalCatalogCache(
      event.data.dataset,
      undefined,
      { fetchPriority: event.data.fetchPriority }
    );
    const records = [...data.imageRecords];
    const centers = [...data.centers];
    const total = Math.max(records.length, centers.length);
    let offset = 0;
    for (; total - offset > CHUNK_ENTRIES; offset += CHUNK_ENTRIES)
      post({
        chunk: {
          imageRecords: new Map(records.slice(offset, offset + CHUNK_ENTRIES)),
          centers: new Map(centers.slice(offset, offset + CHUNK_ENTRIES)),
        },
      });
    post({
      data: offset
        ? {
            ...data,
            imageRecords: new Map(records.slice(offset)),
            centers: new Map(centers.slice(offset)),
          }
        : data,
    });
  } catch (error) {
    post({
      error:
        error instanceof Error
          ? error.message
          : "Metadaten konnten nicht geladen werden.",
    });
  }
};
