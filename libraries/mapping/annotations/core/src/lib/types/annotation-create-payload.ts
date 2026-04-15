import type { BaseAnnotationEntry } from "./annotation-entry";

export type AnnotationCreatePayload<
  TMeasurement extends BaseAnnotationEntry = BaseAnnotationEntry
> = Omit<TMeasurement, "id" | "timestamp"> & {
  id?: string;
  timestamp?: number;
};
