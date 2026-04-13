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
import {
  type AnnotationsRuntimeFormatOptions,
  type RuntimeAnnotationInfoBoxVisualOptions,
  type PreviewLineLabelVisualOptions,
} from "@carma-mapping/annotations/runtime-v2";
import { LENGTH_UNIT_MODE } from "@carma-units";

import type { PlaygroundRuntime } from "./playground.types";
export const INFOBOX_WIDTH_PX = 430;
export const PLAYGROUND_FLOATING_OVERLAY_WINDOW_MARGIN_PX = 12;
export const ACTIVE_TOOL_STORAGE_KEY = "annotations-playground-active-tool.v1";
export const ANNOTATIONS_RUNTIME_V2_STORAGE_KEY =
  "annotations-playground-annotations.v2";
export const PLAYGROUND_RUNTIME_URL_PARAM = "runtime";
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
export const PLAYGROUND_RUNTIME_INFO_BOX_VISUAL_OPTIONS: Partial<RuntimeAnnotationInfoBoxVisualOptions> =
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

const VALID_PLAYGROUND_RUNTIMES = new Set<PlaygroundRuntime>(["v1", "v2"]);
const PLAYGROUND_RUNTIME_URL_ALIASES = {
  "1": "v1",
  "2": "v2",
  v1: "v1",
  v2: "v2",
} as const;

const resolvePlaygroundRuntimeAlias = (
  value: string | null
): PlaygroundRuntime | null => {
  if (!value) {
    return null;
  }

  if (VALID_PLAYGROUND_RUNTIMES.has(value as PlaygroundRuntime)) {
    return value as PlaygroundRuntime;
  }

  return (
    PLAYGROUND_RUNTIME_URL_ALIASES[
      value as keyof typeof PLAYGROUND_RUNTIME_URL_ALIASES
    ] ?? null
  );
};

export const readInitialRuntimeVersion = (): PlaygroundRuntime => {
  if (typeof window === "undefined") {
    return "v2";
  }

  try {
    const searchParams = new URLSearchParams(window.location.search);
    const explicitRuntimeVersion = resolvePlaygroundRuntimeAlias(
      searchParams.get(PLAYGROUND_RUNTIME_URL_PARAM)
    );
    if (explicitRuntimeVersion) {
      return explicitRuntimeVersion;
    }

    for (const alias of Object.keys(PLAYGROUND_RUNTIME_URL_ALIASES)) {
      if (searchParams.has(alias)) {
        return PLAYGROUND_RUNTIME_URL_ALIASES[
          alias as keyof typeof PLAYGROUND_RUNTIME_URL_ALIASES
        ];
      }
    }
  } catch {
    // ignore URL parsing errors
  }

  return "v2";
};
