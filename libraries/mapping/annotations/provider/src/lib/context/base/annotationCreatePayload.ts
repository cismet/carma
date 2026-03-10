import type { BaseAnnotationEntry } from "@carma-mapping/annotations/core";

export type AnnotationCreatePayload<
  TMeasurement extends BaseAnnotationEntry = BaseAnnotationEntry
> = Omit<TMeasurement, "id" | "timestamp"> & {
  id?: string;
  timestamp?: number;
};
