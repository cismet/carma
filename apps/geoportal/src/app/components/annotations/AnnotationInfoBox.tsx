import { useSelector } from "react-redux";
import type { ReactNode } from "react";

import { CismapRuntimeAnnotationInfoBox } from "@carma-appframeworks/portals";
import { ANNOTATION_INFO_BOX_HELP_LAYOUTS } from "@carma-mapping/annotations/ui";
import { useRuntimeAnnotationInfoBoxSlots } from "@carma-mapping/annotations/runtime";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { useFeatureFlags } from "@carma-providers/feature-flag";

import { CESIUM_ANNOTATION_CONFIG } from "../../config/app.config";
import { shouldShowAnnotationInfoBox } from "../../helper/annotation-info-box";
import { resolveGeoportalAnnotationInfoBoxVisualOptions } from "../../helper/annotation-info-box-visual-options";
import { getLayers } from "../../store/slices/mapping";
import { getUIMode } from "../../store/slices/ui";

const GEOPORTAL_ANNOTATION_HELP_LOCALE = "de-DE";

type AnnotationInfoBoxProps = {
  secondaryInfoBoxElements?: ReactNode[];
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
  const infoBoxState = useRuntimeAnnotationInfoBoxSlots({
    fallbackHelpLayout: isCesium
      ? ANNOTATION_INFO_BOX_HELP_LAYOUTS.COMPACT
      : undefined,
    helpLocale: GEOPORTAL_ANNOTATION_HELP_LOCALE,
    includeFallback: true,
    visualOptions: resolveGeoportalAnnotationInfoBoxVisualOptions,
  });
  const annotationsVisible = shouldShowAnnotationInfoBox({
    isCesium,
    layers,
    uiMode,
  });

  if (!annotationsVisible || !infoBoxState) {
    return null;
  }

  return (
    <CismapRuntimeAnnotationInfoBox
      infoBoxState={infoBoxState}
      isCesium={isCesium}
      annotationToolIds={activeAnnotationToolIds}
      layoutProps={CESIUM_ANNOTATION_CONFIG.infoBox}
      secondaryInfoBoxElements={secondaryInfoBoxElements}
    />
  );
};

export default AnnotationInfoBox;
