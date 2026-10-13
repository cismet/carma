import type {
  NearestObliqueImageRecord,
  ObliqueSelectionData,
  ObliqueViewQuery,
} from "../../core/types";

export const IMAGE_SELECTION_MESSAGE = {
  INIT: "init",
  QUERY: "query",
  QUERY_BATCH: "query-batch",
  RESULT: "result",
  RESULT_BATCH: "result-batch",
  ERROR: "error",
} as const;

export const MAX_IMAGE_SELECTION_BATCH_SIZE = 12;
export type ImageSelectionBatchResult = (
  | NearestObliqueImageRecord[]
  | undefined
)[];
export type ImageSelectionCandidate = Omit<
  NearestObliqueImageRecord,
  "record"
> & {
  imageId: string;
};
export type ImageSelectionRequest =
  | {
      type: typeof IMAGE_SELECTION_MESSAGE.INIT;
      data: ObliqueSelectionData;
      append?: boolean;
      complete?: boolean;
      revision?: number;
    }
  | {
      type: typeof IMAGE_SELECTION_MESSAGE.QUERY;
      requestId: number;
      query: ObliqueViewQuery;
    }
  | {
      type: typeof IMAGE_SELECTION_MESSAGE.QUERY_BATCH;
      requestId: number;
      queries: ObliqueViewQuery[];
    };
export type ImageSelectionResponse =
  | {
      type: typeof IMAGE_SELECTION_MESSAGE.RESULT;
      requestId: number;
      candidates: ImageSelectionCandidate[];
    }
  | {
      type: typeof IMAGE_SELECTION_MESSAGE.RESULT_BATCH;
      requestId: number;
      candidates: (ImageSelectionCandidate[] | undefined)[];
    }
  | { type: typeof IMAGE_SELECTION_MESSAGE.ERROR; requestId: number };
