import type { AnnotationInfoBoxVisualOptions } from "@carma-mapping/annotations/ui";
import type { AnnotationToolId } from "@carma-mapping/annotations/core";
import {
  defaultAnnotationToolPlugins,
  distanceToolPlugin,
  pointToolPlugin,
  selectToolPlugin,
} from "@carma-mapping/annotations/builtin-tools";
import {
  type AnnotationsRuntimeFormatOptions,
  type PartialAnnotationLineLabelOptions,
} from "@carma-mapping/annotations/runtime";
import { LENGTH_UNIT_MODE } from "@carma-units";

export const INFOBOX_WIDTH_PX = 430;
export const PLAYGROUND_FLOATING_OVERLAY_WINDOW_MARGIN_PX = 12;
// The playground UI stays above the runtime-managed overlay roots.
export const PLAYGROUND_UI_Z_INDEX = 200;
export const ACTIVE_TOOL_STORAGE_KEY = "annotations-playground-active-tool.v1";
export const ANNOTATIONS_RUNTIME_STORAGE_KEY =
  "annotations-playground-annotations.v2";
export const PLAYGROUND_TOOLSET_URL_PARAM = "tools";
const LEGACY_PLAYGROUND_TOOLSET_URL_PARAM = "runtimeToolset";
export const PLAYGROUND_TOOLSETS = {
  ALL: "all",
  STABLE: "stable",
} as const;
export type PlaygroundToolset =
  (typeof PLAYGROUND_TOOLSETS)[keyof typeof PLAYGROUND_TOOLSETS];
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
export const PLAYGROUND_ANNOTATION_LINE_LABEL_OPTIONS: PartialAnnotationLineLabelOptions =
  {};
export const PLAYGROUND_RUNTIME_INFO_BOX_VISUAL_OPTIONS: Partial<AnnotationInfoBoxVisualOptions> =
  {};
export const PLAYGROUND_STABLE_RUNTIME_TOOL_PLUGINS = [
  selectToolPlugin,
  pointToolPlugin,
  distanceToolPlugin,
] as const;
export const PLAYGROUND_ALL_RUNTIME_TOOL_PLUGINS = defaultAnnotationToolPlugins;

export const VALID_TOOL_TYPES = new Set<AnnotationToolId>(
  PLAYGROUND_ALL_RUNTIME_TOOL_PLUGINS.map((plugin) => plugin.id)
);

export const readInitialToolType = (): AnnotationToolId => {
  if (typeof window === "undefined") {
    return pointToolPlugin.id;
  }

  try {
    const storedToolType = window.localStorage.getItem(ACTIVE_TOOL_STORAGE_KEY);
    if (
      storedToolType &&
      VALID_TOOL_TYPES.has(storedToolType as AnnotationToolId)
    ) {
      return storedToolType as AnnotationToolId;
    }
  } catch {
    // ignore storage read errors
  }

  return pointToolPlugin.id;
};

const isPlaygroundToolset = (value: string): value is PlaygroundToolset =>
  value === PLAYGROUND_TOOLSETS.ALL || value === PLAYGROUND_TOOLSETS.STABLE;

const isPlaygroundLocalhost = () => {
  if (typeof window === "undefined") {
    return true;
  }

  const { hostname } = window.location;
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  );
};

export const readInitialToolset = (): PlaygroundToolset => {
  if (typeof window === "undefined") {
    return PLAYGROUND_TOOLSETS.ALL;
  }

  try {
    const searchParams = new URLSearchParams(window.location.search);
    const requestedToolset =
      searchParams.get(PLAYGROUND_TOOLSET_URL_PARAM) ??
      searchParams.get(LEGACY_PLAYGROUND_TOOLSET_URL_PARAM);
    if (requestedToolset && isPlaygroundToolset(requestedToolset)) {
      return requestedToolset;
    }
  } catch {
    // ignore URL parsing errors
  }

  return isPlaygroundLocalhost()
    ? PLAYGROUND_TOOLSETS.ALL
    : PLAYGROUND_TOOLSETS.STABLE;
};
