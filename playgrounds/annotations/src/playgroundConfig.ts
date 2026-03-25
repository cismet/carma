import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  SELECT_TOOL_TYPE,
  type AnnotationToolType,
} from "@carma-mapping/annotations/core";
import type { PlaygroundRuntime } from "./playground.types";

export const INFOBOX_WIDTH_PX = 430;
export const ACTIVE_TOOL_STORAGE_KEY = "annotations-playground-active-tool.v1";
export const RUNTIME_VERSION_STORAGE_KEY =
  "annotations-playground-runtime-version.v1";

export const VALID_TOOL_TYPES = new Set<AnnotationToolType>([
  SELECT_TOOL_TYPE,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POLYLINE,
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
]);

export const readInitialToolType = (): AnnotationToolType => {
  if (typeof window === "undefined") {
    return ANNOTATION_TYPE_POINT;
  }

  try {
    const storedToolType = window.localStorage.getItem(ACTIVE_TOOL_STORAGE_KEY);
    if (
      storedToolType &&
      VALID_TOOL_TYPES.has(storedToolType as AnnotationToolType)
    ) {
      return storedToolType as AnnotationToolType;
    }
  } catch {
    // ignore storage read errors
  }

  return ANNOTATION_TYPE_POINT;
};

const VALID_PLAYGROUND_RUNTIMES = new Set<PlaygroundRuntime>(["v1", "v2"]);

export const readInitialRuntimeVersion = (): PlaygroundRuntime => {
  if (typeof window === "undefined") {
    return "v1";
  }

  try {
    const storedRuntimeVersion = window.localStorage.getItem(
      RUNTIME_VERSION_STORAGE_KEY
    );
    if (
      storedRuntimeVersion &&
      VALID_PLAYGROUND_RUNTIMES.has(storedRuntimeVersion as PlaygroundRuntime)
    ) {
      return storedRuntimeVersion as PlaygroundRuntime;
    }
  } catch {
    // ignore storage read errors
  }

  return "v1";
};

export const persistRuntimeVersion = (runtimeVersion: PlaygroundRuntime) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(RUNTIME_VERSION_STORAGE_KEY, runtimeVersion);
  } catch {
    // ignore storage write errors
  }
};
