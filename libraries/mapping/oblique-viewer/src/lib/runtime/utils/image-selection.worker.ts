/// <reference lib="webworker" />
import type { ObliqueSelectionData } from "../../core/types";
import { createImageSelectionIndex } from "../../core/utils/image-selection-index";
import { rankImagesForView } from "../../core/utils/selection";
import {
  IMAGE_SELECTION_MESSAGE,
  type ImageSelectionRequest,
  type ImageSelectionResponse,
} from "./image-selection-messages";

let data: ObliqueSelectionData | null = null;
let index: ReturnType<typeof createImageSelectionIndex> | null = null;
self.onmessage = (event: MessageEvent<ImageSelectionRequest>) => {
  const request = event.data;
  if (request.type === IMAGE_SELECTION_MESSAGE.INIT) {
    data = request.data;
    index = createImageSelectionIndex(data);
    return;
  }
  let response: ImageSelectionResponse;
  try {
    if (!data) throw new Error("Image catalog is not initialized.");
    response = {
      type: IMAGE_SELECTION_MESSAGE.RESULT,
      requestId: request.requestId,
      candidates: rankImagesForView(
        data,
        request.query,
        index?.candidates(request.query)
      ).map(({ record, ...candidate }) => ({
        ...candidate,
        imageId: record.id,
      })),
    };
  } catch {
    response = {
      type: IMAGE_SELECTION_MESSAGE.ERROR,
      requestId: request.requestId,
    };
  }
  self.postMessage(response);
};
