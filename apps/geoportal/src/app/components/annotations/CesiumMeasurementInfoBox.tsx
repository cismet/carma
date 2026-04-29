import { useSelector } from "react-redux";

import {
  CISMAP_MEASUREMENT_INFO_BOX_VISUAL_OPTIONS,
  CismapAnnotationInfoBox,
  CismapAnnotationInstructionInfoBox,
} from "@carma-appframeworks/portals";
import { AnnotationInfoBoxContainer } from "@carma-mapping/annotations/ui";
import {
  RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS,
  type AnnotationToolId,
  type RuntimeAnnotationInfoBoxVisualOptionsContext,
  type StoredAnnotation,
  useRuntimeAnnotationInfoBoxSlots,
} from "@carma-mapping/annotations/runtime";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

import { CESIUM_ANNOTATION_CONFIG } from "../../config/app.config";
import { shouldShowCesiumMeasurementInfoBox } from "../../helper/cesium-measurement-info-box";
import { getLayers } from "../../store/slices/mapping";
import { getUIMode } from "../../store/slices/ui";

const CISMAP_INFO_BOX_INSTRUCTION_TOOL_IDS = new Set<AnnotationToolId>([
  "select",
  "point",
  "distance",
]);

const CISMAP_INFO_BOX_MEASUREMENT_TOOL_TYPES = new Set<
  StoredAnnotation["toolType"]
>(["point", "distance"]);

const resolveGeoportalCismapInfoBoxVisualOptions = (
  context: RuntimeAnnotationInfoBoxVisualOptionsContext
) => ({
  ...CISMAP_MEASUREMENT_INFO_BOX_VISUAL_OPTIONS,
  showSubtitleMetaText:
    context.kind !== RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION ||
    context.annotation.toolType !== "distance",
});

const CesiumMeasurementInfoBox = () => {
  const { isCesium } = useMapFrameworkSwitcherContext();
  const uiMode = useSelector(getUIMode);
  const layers = useSelector(getLayers);
  const infoBoxState = useRuntimeAnnotationInfoBoxSlots({
    includeFallback: true,
    visualOptions: resolveGeoportalCismapInfoBoxVisualOptions,
  });
  const annotationsVisible = shouldShowCesiumMeasurementInfoBox({
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
    CISMAP_INFO_BOX_MEASUREMENT_TOOL_TYPES.has(infoBoxState.annotation.toolType)
  ) {
    return (
      <CismapAnnotationInfoBox
        pixelWidth={CESIUM_ANNOTATION_CONFIG.infoBox.pixelWidth}
        slots={infoBoxState.slots}
        visualOptions={infoBoxState.visualOptions}
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

export default CesiumMeasurementInfoBox;
