/// <reference lib="webworker" />
import type { ObliqueSelectionData, ObliqueViewQuery } from "../../core/types";
import { createImageSelectionIndex } from "../../core/utils/image-selection-index";
import { rankImagesForView } from "../../core/utils/selection";
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
  return rankImagesForView(data, query, index.candidates(query)).map(
    ({ record, ...candidate }) => ({ ...candidate, imageId: record.id })
  );
};
self.onmessage = (event: MessageEvent<ImageSelectionRequest>) => {
  const request = event.data;
  if (request.type === IMAGE_SELECTION_MESSAGE.INIT) {
    data = request.data;
    index = createImageSelectionIndex(data);
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
