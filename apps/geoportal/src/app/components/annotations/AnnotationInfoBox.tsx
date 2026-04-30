import { useSelector } from "react-redux";
import type { ReactNode } from "react";

import {
  CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS,
  CismapAnnotationInfoBox,
  CismapAnnotationInstructionInfoBox,
} from "@carma-appframeworks/portals";
import {
  ANNOTATION_INFO_BOX_ACTION_IDS,
  AnnotationInfoBoxContainer,
} from "@carma-mapping/annotations/ui";
import {
  RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS,
  type AnnotationToolId,
  type RuntimeAnnotationInfoBoxVisualOptionsContext,
  type StoredAnnotation,
  useRuntimeAnnotationInfoBoxSlots,
} from "@carma-mapping/annotations/runtime";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

import { CESIUM_ANNOTATION_CONFIG } from "../../config/app.config";
import { shouldShowAnnotationInfoBox } from "../../helper/annotation-info-box";
import { getLayers } from "../../store/slices/mapping";
import { getUIMode } from "../../store/slices/ui";

const CISMAP_INFO_BOX_INSTRUCTION_TOOL_IDS = new Set<AnnotationToolId>([
  "select",
  "point",
  "distance",
]);

const CISMAP_INFO_BOX_ANNOTATION_TOOL_TYPES = new Set<
  StoredAnnotation["toolType"]
>(["point", "distance"]);

const resolveGeoportalCismapInfoBoxVisualOptions = (
  context: RuntimeAnnotationInfoBoxVisualOptionsContext
) => {
  const hiddenActionIds =
    context.kind === RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION &&
    context.annotation.toolType === "point"
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
      context.annotation.toolType !== "distance",
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
    if (CISMAP_INFO_BOX_INSTRUCTION_TOOL_IDS.has(infoBoxState.plugin.id)) {
      return (
        <CismapAnnotationInstructionInfoBox
          content={infoBoxState.slots.content}
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
  }

  if (
    CISMAP_INFO_BOX_ANNOTATION_TOOL_TYPES.has(infoBoxState.annotation.toolType)
  ) {
    return (
      <CismapAnnotationInfoBox
        pixelWidth={CESIUM_ANNOTATION_CONFIG.infoBox.pixelWidth}
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
