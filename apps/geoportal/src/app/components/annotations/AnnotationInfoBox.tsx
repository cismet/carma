import { useSelector } from "react-redux";
import type { ReactNode } from "react";

import {
  CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS,
  CismapAnnotationInfoBox,
  CismapAnnotationInstructionInfoBox,
} from "@carma-appframeworks/portals";
import {
  ANNOTATION_INFO_BOX_ACTION_IDS,
  ANNOTATION_INFO_BOX_HELP_LAYOUTS,
  AnnotationInfoBoxContainer,
} from "@carma-mapping/annotations/ui";
import {
  ANNOTATION_SELECT_TOOL_ID,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";
import {
  RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS,
  type RuntimeAnnotationInfoBoxVisualOptionsContext,
  useRuntimeAnnotationInfoBoxSlots,
} from "@carma-mapping/annotations/runtime";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

import { CESIUM_ANNOTATION_CONFIG } from "../../config/app.config";
import { shouldShowAnnotationInfoBox } from "../../helper/annotation-info-box";
import { getLayers } from "../../store/slices/mapping";
import { getUIMode } from "../../store/slices/ui";

const CISMAP_INFO_BOX_TOOL_IDS = new Set<string>([
  ANNOTATION_SELECT_TOOL_ID,
  ANNOTATION_TYPES.POINT,
  ANNOTATION_TYPES.DISTANCE,
  ANNOTATION_TYPES.POLYLINE,
  ANNOTATION_TYPES.AREA_GROUND,
  ANNOTATION_TYPES.AREA_PLANAR,
  ANNOTATION_TYPES.AREA_VERTICAL,
  ANNOTATION_TYPES.LABEL,
]);

const GEOPORTAL_ANNOTATION_HELP_COLLAPSED_STORAGE_KEY_PREFIX =
  "geoportal:annotation-help-collapsed:";
const GEOPORTAL_ANNOTATION_HELP_LOCALE = "de-DE";

const buildGeoportalAnnotationHelpCollapsedStorageKey = (
  toolId: string | undefined
): string | undefined =>
  toolId
    ? `${GEOPORTAL_ANNOTATION_HELP_COLLAPSED_STORAGE_KEY_PREFIX}${toolId}`
    : undefined;

const resolveGeoportalCismapInfoBoxVisualOptions = (
  context: RuntimeAnnotationInfoBoxVisualOptionsContext
) => {
  const hiddenActionIds =
    context.kind === RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION &&
    context.annotation.toolType === ANNOTATION_TYPES.POINT
      ? CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.hiddenActionIds.filter(
          (actionId) => actionId !== ANNOTATION_INFO_BOX_ACTION_IDS.REFERENCE
        )
      : CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.hiddenActionIds;

  return {
    ...CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS,
    hiddenActionIds,
    showSubtitleMetaText:
      context.kind !==
        RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION ||
      context.annotation.toolType !== ANNOTATION_TYPES.DISTANCE,
  };
};

type AnnotationInfoBoxProps = {
  secondaryInfoBoxElements?: ReactNode[];
};

const AnnotationInfoBox = ({
  secondaryInfoBoxElements = [],
}: AnnotationInfoBoxProps) => {
  const { isCesium } = useMapFrameworkSwitcherContext();
  const uiMode = useSelector(getUIMode);
  const layers = useSelector(getLayers);
  const infoBoxState = useRuntimeAnnotationInfoBoxSlots({
    fallbackHelpLayout: isCesium
      ? ANNOTATION_INFO_BOX_HELP_LAYOUTS.COMPACT
      : undefined,
    helpLocale: GEOPORTAL_ANNOTATION_HELP_LOCALE,
    includeFallback: true,
    visualOptions: resolveGeoportalCismapInfoBoxVisualOptions,
  });
  const annotationsVisible = shouldShowAnnotationInfoBox({
    isCesium,
    layers,
    uiMode,
  });

  if (!annotationsVisible || !infoBoxState) {
    return null;
  }

  if (
    infoBoxState.kind === RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.FALLBACK
  ) {
    return (
      <CismapAnnotationInstructionInfoBox
        content={infoBoxState.slots.content}
        shrinkToContent={isCesium}
        instructionSlotClosable={isCesium}
        instructionSlotStorageKey={
          isCesium
            ? buildGeoportalAnnotationHelpCollapsedStorageKey(
                infoBoxState.plugin.id
              )
            : undefined
        }
        controlOrder={CESIUM_ANNOTATION_CONFIG.infoBox.controlOrder}
        secondaryInfoBoxElements={secondaryInfoBoxElements}
      />
    );
  }

  if (CISMAP_INFO_BOX_TOOL_IDS.has(infoBoxState.annotation.toolType)) {
    return (
      <CismapAnnotationInfoBox
        pixelWidth={CESIUM_ANNOTATION_CONFIG.infoBox.pixelWidth}
        instructionContent={
          isCesium ? infoBoxState.instructionContent : undefined
        }
        instructionSlotClosable={isCesium}
        instructionSlotStorageKey={
          isCesium
            ? buildGeoportalAnnotationHelpCollapsedStorageKey(
                infoBoxState.instructionToolId
              )
            : undefined
        }
        slots={infoBoxState.slots}
        visualOptions={infoBoxState.visualOptions}
        controlOrder={CESIUM_ANNOTATION_CONFIG.infoBox.controlOrder}
        secondaryInfoBoxElements={secondaryInfoBoxElements}
      />
    );
  }

  return (
    <AnnotationInfoBoxContainer
      {...CESIUM_ANNOTATION_CONFIG.infoBox}
      slots={infoBoxState.slots}
      visualOptions={infoBoxState.visualOptions}
    />
  );
};

export default AnnotationInfoBox;
