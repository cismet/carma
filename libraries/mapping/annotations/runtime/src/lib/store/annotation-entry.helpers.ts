import {
  RUNTIME_ELEVATION_DISPLAY_MODE,
  type RuntimeAnnotationEntry,
} from "./annotations-store.types";

export const findAnnotationEntryById = (
  annotationEntries: readonly RuntimeAnnotationEntry[],
  annotationId: string | null
): RuntimeAnnotationEntry | null =>
  annotationId
    ? annotationEntries.find((entry) => entry.id === annotationId) ?? null
    : null;

export const resolveNextElevationDisplayMode = (
  currentMode: RuntimeAnnotationEntry["elevationDisplayMode"]
) =>
  currentMode === RUNTIME_ELEVATION_DISPLAY_MODE.ABSOLUTE
    ? RUNTIME_ELEVATION_DISPLAY_MODE.RELATIVE
    : RUNTIME_ELEVATION_DISPLAY_MODE.ABSOLUTE;
