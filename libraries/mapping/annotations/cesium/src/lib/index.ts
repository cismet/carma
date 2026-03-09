// Types
export * from "./types/AnnotationTypes";

// Utils
export * from "./utils/occlusionDetection";
export * from "./utils/sceneVisibilityIndex";
export {
  upsertCollectionEntry,
  replaceLastEntryOfType,
  clearTemporaryEntries,
  makeTemporaryEntriesPermanent,
  buildScreenRectangle,
  getScreenRectangleSize,
  isPointInsideScreenRectangle,
  selectPointIdsInScreenRectangle,
  type ScreenRectangle,
} from "@carma-mapping/annotations/core";

// Hooks
export * from "./hooks";
