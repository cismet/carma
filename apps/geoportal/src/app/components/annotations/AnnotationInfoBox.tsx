import { useSelector } from "react-redux";
import type { ReactNode } from "react";

import { CismapRuntimeAnnotationInfoBox } from "@carma-appframeworks/portals";
import { ANNOTATION_INFO_BOX_HELP_LAYOUTS } from "@carma-mapping/annotations/ui";
import {
  useRuntimeAnnotationInfoBoxSlots,
  type RuntimeAnnotationInfoBoxSlotsState,
} from "@carma-mapping/annotations/runtime";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { useFeatureFlags } from "@carma-providers/feature-flag";

import { CESIUM_ANNOTATION_CONFIG } from "../../config/app.config";
import {
  isExternalAnnotationInfoBoxState,
  shouldShowAnnotationInfoBox,
} from "../../helper/annotation-info-box";
import { resolveGeoportalAnnotationInfoBoxVisualOptions } from "../../helper/annotation-info-box-visual-options";
import { getLayers } from "../../store/slices/mapping";
import { getUIMode, UIMode } from "../../store/slices/ui";

const GEOPORTAL_ANNOTATION_HELP_LOCALE = "de-DE";
const EXTERNAL_ANNOTATION_INFO_BOX_HEADER_BACKGROUND_COLOR = "#3b82f6";
const EXTERNAL_ANNOTATION_INFO_BOX_HEADER_TEXT_COLOR = "white";
const EXTERNAL_ANNOTATION_INFO_BOX_TITLE = "Informationen";

type AnnotationInfoBoxProps = {
  secondaryInfoBoxElements?: ReactNode[];
};

const resolveGeoportalInfoBoxState = (
  infoBoxState: RuntimeAnnotationInfoBoxSlotsState | null
): RuntimeAnnotationInfoBoxSlotsState | null => {
  if (!isExternalAnnotationInfoBoxState(infoBoxState)) {
    return infoBoxState;
  }

  return {
    ...infoBoxState,
    slots: {
      ...infoBoxState.slots,
      headingTitle: EXTERNAL_ANNOTATION_INFO_BOX_TITLE,
    },
  };
};

const AnnotationInfoBox = ({
  secondaryInfoBoxElements = [],
}: AnnotationInfoBoxProps) => {
  const { isCesium } = useMapFrameworkSwitcherContext();
  const flags = useFeatureFlags();
  const uiMode = useSelector(getUIMode);
  const layers = useSelector(getLayers);
  const showAllAnnotationTools =
    flags.featureFlagCesiumAnnotationAllTools === true;
  const activeAnnotationToolIds = showAllAnnotationTools
    ? CESIUM_ANNOTATION_CONFIG.tools.allToolIds
    : CESIUM_ANNOTATION_CONFIG.tools.stableToolIds;
  const isMeasurementMode = uiMode === UIMode.MEASUREMENT;
  const infoBoxState = useRuntimeAnnotationInfoBoxSlots({
    authoringInstructionHelpLayout: isCesium
      ? ANNOTATION_INFO_BOX_HELP_LAYOUTS.COMPACT
      : undefined,
    helpLocale: GEOPORTAL_ANNOTATION_HELP_LOCALE,
    includeAuthoringInstruction: isMeasurementMode,
    visualOptions: resolveGeoportalAnnotationInfoBoxVisualOptions,
  });
  const resolvedInfoBoxState = resolveGeoportalInfoBoxState(infoBoxState);
  const useExternalAnnotationInfoBoxHeader =
    isExternalAnnotationInfoBoxState(infoBoxState);
  const headerTitle = useExternalAnnotationInfoBoxHeader
    ? EXTERNAL_ANNOTATION_INFO_BOX_TITLE
    : undefined;
  const headerBackgroundColor = useExternalAnnotationInfoBoxHeader
    ? EXTERNAL_ANNOTATION_INFO_BOX_HEADER_BACKGROUND_COLOR
    : undefined;
  const headerTextColor = useExternalAnnotationInfoBoxHeader
    ? EXTERNAL_ANNOTATION_INFO_BOX_HEADER_TEXT_COLOR
    : undefined;
  const annotationsVisible = shouldShowAnnotationInfoBox({
    infoBoxState,
    isCesium,
    layers,
    uiMode,
  });

  if (!annotationsVisible || !resolvedInfoBoxState) {
    return null;
  }

  return (
    <CismapRuntimeAnnotationInfoBox
      infoBoxState={resolvedInfoBoxState}
      isCesium={isCesium}
      annotationToolIds={activeAnnotationToolIds}
      headerBackgroundColor={headerBackgroundColor}
      headerTextColor={headerTextColor}
      headerTitle={headerTitle}
      layoutProps={CESIUM_ANNOTATION_CONFIG.infoBox}
      secondaryInfoBoxElements={secondaryInfoBoxElements}
    />
  );
};

export default AnnotationInfoBox;
