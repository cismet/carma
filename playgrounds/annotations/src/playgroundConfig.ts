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
import type { PlaygroundRuntime } from "./playground.types";
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
export const ACTIVE_TOOL_STORAGE_KEY = "annotations-playground-active-tool";
export const ANNOTATIONS_RUNTIME_STORAGE_KEY =
  "annotations-playground-annotations";
export const ANNOTATIONS_PROTOTYPE_STORAGE_KEY =
  "annotations-playground-annotations-prototype";
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

const VALID_PLAYGROUND_RUNTIMES = new Set<PlaygroundRuntime>([
  "prototype",
  "runtime",
]);
const PLAYGROUND_RUNTIME_URL_ALIASES = {
  prototype: "prototype",
  runtime: "runtime",
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
    return "runtime";
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

  return "runtime";
};
