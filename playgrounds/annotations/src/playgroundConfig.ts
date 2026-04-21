import {
  type AnnotationToolType,
  ANNOTATION_TOOL_TYPES,
} from "@carma-mapping/annotations/core";
import type { AnnotationInfoBoxVisualOptions } from "@carma-mapping/annotations/ui";
import {
  type AnnotationsRuntimeFormatOptions,
  type PreviewLineLabelVisualOptions,
} from "@carma-mapping/annotations/runtime";
import { LENGTH_UNIT_MODE } from "@carma-units";
const {
  AREA_GROUND: ANNOTATION_TYPE_AREA_GROUND,
  AREA_PLANAR: ANNOTATION_TYPE_AREA_PLANAR,
  AREA_VERTICAL: ANNOTATION_TYPE_AREA_VERTICAL,
  DISTANCE: ANNOTATION_TYPE_DISTANCE,
  LABEL: ANNOTATION_TYPE_LABEL,
  POINT: ANNOTATION_TYPE_POINT,
  POLYLINE: ANNOTATION_TYPE_POLYLINE,
  SELECT: SELECT_TOOL_TYPE,
} = ANNOTATION_TOOL_TYPES;

export const INFOBOX_WIDTH_PX = 430;
export const PLAYGROUND_FLOATING_OVERLAY_WINDOW_MARGIN_PX = 12;
// The playground UI stays above the runtime-managed overlay roots.
export const PLAYGROUND_UI_Z_INDEX = 200;
export const ACTIVE_TOOL_STORAGE_KEY = "annotations-playground-active-tool.v1";
export const ANNOTATIONS_RUNTIME_STORAGE_KEY =
  "annotations-playground-annotations.v2";
export const PLAYGROUND_RUNTIME_TOOLSET_URL_PARAM = "runtimeToolset";
export const PLAYGROUND_RUNTIME_TOOLSETS = {
  ALL: "all",
  STABLE: "stable",
} as const;
export type PlaygroundRuntimeToolset =
  (typeof PLAYGROUND_RUNTIME_TOOLSETS)[keyof typeof PLAYGROUND_RUNTIME_TOOLSETS];
export const PLAYGROUND_RUNTIME_FORMAT_OPTIONS: AnnotationsRuntimeFormatOptions =
  {
    lengthMeters: {
      locale: "de-DE",
      unitMode: LENGTH_UNIT_MODE.METERS,
      maximumFractionDigitsMeters: 2,
    },
    areaSquareMeters: {
      locale: "de-DE",
    },
    degrees: {
      locale: "de-DE",
    },
    geographicCoordinate: {
      locale: "de-DE",
      fractionDigits: 6,
    },
    decimalNumber: {
      locale: "de-DE",
      fractionDigits: 2,
      useGrouping: false,
    },
  };
export const PLAYGROUND_PREVIEW_LINE_LABEL_VISUAL_OPTIONS: Partial<PreviewLineLabelVisualOptions> =
  {};
export const PLAYGROUND_RUNTIME_INFO_BOX_VISUAL_OPTIONS: Partial<AnnotationInfoBoxVisualOptions> =
  {};

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

const VALID_PLAYGROUND_RUNTIME_TOOLSETS = new Set<PlaygroundRuntimeToolset>([
  PLAYGROUND_RUNTIME_TOOLSETS.ALL,
  PLAYGROUND_RUNTIME_TOOLSETS.STABLE,
]);

const isPlaygroundLocalhost = () => {
  if (typeof window === "undefined") {
    return true;
  }

  const { hostname } = window.location;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
};

export const readInitialRuntimeToolset = (): PlaygroundRuntimeToolset => {
  if (typeof window === "undefined") {
    return PLAYGROUND_RUNTIME_TOOLSETS.ALL;
  }

  try {
    const searchParams = new URLSearchParams(window.location.search);
    const requestedToolset = searchParams.get(
      PLAYGROUND_RUNTIME_TOOLSET_URL_PARAM
    );
    if (
      requestedToolset &&
      VALID_PLAYGROUND_RUNTIME_TOOLSETS.has(
        requestedToolset as PlaygroundRuntimeToolset
      )
    ) {
      return requestedToolset as PlaygroundRuntimeToolset;
    }
  } catch {
    // ignore URL parsing errors
  }

  return isPlaygroundLocalhost()
    ? PLAYGROUND_RUNTIME_TOOLSETS.ALL
    : PLAYGROUND_RUNTIME_TOOLSETS.STABLE;
};
