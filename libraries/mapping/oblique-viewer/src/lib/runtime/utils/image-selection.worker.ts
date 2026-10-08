/// <reference lib="webworker" />
import type { ObliqueSelectionData, ObliqueViewQuery } from "../../core/types";
import { createImageSelectionIndex } from "../../core/utils/image-selection-index";
import { rankImagesForViewWithDirectionalFallback } from "../../core/utils/selection";
import {
  IMAGE_SELECTION_MESSAGE,
  MAX_IMAGE_SELECTION_BATCH_SIZE,
  type ImageSelectionRequest,
  type ImageSelectionResponse,
} from "./image-selection-messages";

let data: ObliqueSelectionData | null = null;
let index: ReturnType<typeof createImageSelectionIndex> | null = null;
const rank = (query: ObliqueViewQuery) => {
  if (!data || !index) throw new Error("Image catalog is not initialized.");
  return rankImagesForViewWithDirectionalFallback(
    data,
    query,
    (allDirections, candidateQuery) =>
      index!.candidates(candidateQuery, {
        allDirections,
        limitPerDirection: 256,
      })
  ).map(({ record, ...candidate }) => ({ ...candidate, imageId: record.id }));
};
self.onmessage = (event: MessageEvent<ImageSelectionRequest>) => {
  const request = event.data;
  if (request.type === IMAGE_SELECTION_MESSAGE.INIT) {
    if (request.append && data) {
      for (const [id, record] of request.data.imageRecords)
        data.imageRecords.set(id, record);
      for (const [id, center] of request.data.centers)
        data.centers.set(id, center);
      for (const [id, dataset] of request.data.datasets)
        data.datasets.set(id, dataset);
      index?.append(request.data);
    } else {
      data = {
        imageRecords: new Map(),
        centers: new Map(),
        datasets: new Map(),
      };
      index = createImageSelectionIndex(data, { groundCenters: true });
      for (const [id, record] of request.data.imageRecords)
        data.imageRecords.set(id, record);
      for (const [id, center] of request.data.centers)
        data.centers.set(id, center);
      for (const [id, dataset] of request.data.datasets)
        data.datasets.set(id, dataset);
      index.append(request.data);
    }
    return;
  }
  let response: ImageSelectionResponse;
  try {
    if (request.type === IMAGE_SELECTION_MESSAGE.QUERY_BATCH) {
      if (request.queries.length > MAX_IMAGE_SELECTION_BATCH_SIZE)
        throw new Error("Image navigation batch exceeds its bound.");
      response = {
        type: IMAGE_SELECTION_MESSAGE.RESULT_BATCH,
        requestId: request.requestId,
        candidates: request.queries.map((query) => {
          try {
            return rank(query);
          } catch {
            return undefined;
          }
        }),
      };
    } else
      response = {
        type: IMAGE_SELECTION_MESSAGE.RESULT,
        requestId: request.requestId,
        candidates: rank(request.query),
      };
  } catch {
    response = {
      type: IMAGE_SELECTION_MESSAGE.ERROR,
      requestId: request.requestId,
    };
  }
  self.postMessage(response);
};
