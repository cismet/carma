import type {
  NearestObliqueImageRecord,
  ObliqueSelectionData,
  ObliqueViewQuery,
} from "../../core/types";

export const IMAGE_SELECTION_MESSAGE = {
  INIT: "init",
  QUERY: "query",
  RESULT: "result",
  ERROR: "error",
} as const;

export type ImageSelectionCandidate = Omit<
  NearestObliqueImageRecord,
  "record"
> & {
  imageId: string;
};

export type ImageSelectionRequest =
  | { type: typeof IMAGE_SELECTION_MESSAGE.INIT; data: ObliqueSelectionData }
  | {
      type: typeof IMAGE_SELECTION_MESSAGE.QUERY;
      requestId: number;
      query: ObliqueViewQuery;
    };

export type ImageSelectionResponse =
  | {
      type: typeof IMAGE_SELECTION_MESSAGE.RESULT;
      requestId: number;
      candidates: ImageSelectionCandidate[];
    }
  | {
      type: typeof IMAGE_SELECTION_MESSAGE.ERROR;
      requestId: number;
    };
