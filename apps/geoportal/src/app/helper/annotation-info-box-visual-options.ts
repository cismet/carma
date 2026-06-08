import { CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS } from "@carma-appframeworks/portals";
import {
  readDevelopmentOnlyUiBackdropStyle,
  type DevelopmentOnlyUiBackdropStyleOptions,
} from "@carma-commons/ui/components";
import { ANNOTATION_INFO_BOX_ACTION_IDS } from "@carma-mapping/annotations/ui";
import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import {
  RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS,
  type RuntimeAnnotationInfoBoxVisualOptionsContext,
} from "@carma-mapping/annotations/runtime";

import { CESIUM_ANNOTATION_CONFIG } from "../config/app.config";

export const GEOPORTAL_ANNOTATION_DEVELOPMENT_PREVIEW_PATTERN_OPTIONS = {
  backgroundColor: "transparent",
  primaryColor: "rgba(0, 0, 0, 0.1)",
  rotationDeg: 45,
  secondaryColor: "transparent",
  stripeGapPx: 5,
  stripeWidthPx: 5,
  textVisible: false,
} satisfies DevelopmentOnlyUiBackdropStyleOptions;

export const GEOPORTAL_ANNOTATION_DEVELOPMENT_PREVIEW_HEADER_STYLE =
  readDevelopmentOnlyUiBackdropStyle({
    ...GEOPORTAL_ANNOTATION_DEVELOPMENT_PREVIEW_PATTERN_OPTIONS,
    backgroundColor: "rgba(255, 255, 255, 0.88)",
  });

const FINALIZED_CESIUM_ANNOTATION_TOOL_IDS = new Set<string>(
  CESIUM_ANNOTATION_CONFIG.tools.stableToolIds
);

export const isGeoportalDevelopmentPreviewAnnotationToolId = (
  toolId: string
): boolean => !FINALIZED_CESIUM_ANNOTATION_TOOL_IDS.has(toolId);

const readGeoportalAnnotationInfoBoxToolId = (
  context: RuntimeAnnotationInfoBoxVisualOptionsContext
) =>
  context.kind === RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION
    ? context.annotation.toolType
    : context.plugin.id;

export const resolveGeoportalAnnotationInfoBoxVisualOptions = (
  context: RuntimeAnnotationInfoBoxVisualOptionsContext
) => {
  const isDevelopmentPreviewTool =
    isGeoportalDevelopmentPreviewAnnotationToolId(
      readGeoportalAnnotationInfoBoxToolId(context)
    );
  const hiddenActionIds =
    context.kind === RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION &&
    context.annotation.toolType === ANNOTATION_TYPES.POINT
      ? CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.hiddenActionIds.filter(
          (actionId) => actionId !== ANNOTATION_INFO_BOX_ACTION_IDS.REFERENCE
        )
      : CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.hiddenActionIds;

  return {
    ...CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS,
    ...(isDevelopmentPreviewTool
      ? {
          headerForegroundClassName: "text-[#374151]",
          headerStyle: GEOPORTAL_ANNOTATION_DEVELOPMENT_PREVIEW_HEADER_STYLE,
          headingColor: "rgba(255, 255, 255, 0.88)",
        }
      : {}),
    hiddenActionIds,
    showSubtitleMetaText:
      context.kind !==
        RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION ||
      context.annotation.toolType !== ANNOTATION_TYPES.DISTANCE,
  };
};
