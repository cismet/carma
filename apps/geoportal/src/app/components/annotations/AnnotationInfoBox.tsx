import { useSelector } from "react-redux";
import type { ReactNode } from "react";

import { CismapRuntimeAnnotationInfoBox } from "@carma-appframeworks/portals";

import { CESIUM_ANNOTATION_CONFIG } from "../../config/app.config";
import { shouldShowAnnotationInfoBox } from "../../helper/annotation-info-box";
import { useGeoportalAnnotationInfoBox } from "../../hooks/use-geoportal-annotation-info-box";
import { getLayers } from "../../store/slices/mapping";
import { getUIMode, UIMode } from "../../store/slices/ui";
import { useGeoportalAnnotationHost } from "./GeoportalAnnotationHostContext";

type AnnotationInfoBoxProps = {
  secondaryInfoBoxElements?: ReactNode[];
};

const AnnotationInfoBox = ({
  secondaryInfoBoxElements = [],
}: AnnotationInfoBoxProps) => {
  const { is3dAnnotationHost } = useGeoportalAnnotationHost();
  const uiMode = useSelector(getUIMode);
  const layers = useSelector(getLayers);
  const {
    infoBoxState,
    resolvedInfoBoxState,
    annotationToolIds,
    headerTitle,
    headerBackgroundColor,
  } = useGeoportalAnnotationInfoBox({
    includeAuthoringInstruction: uiMode === UIMode.MEASUREMENT,
    compactHelp: is3dAnnotationHost,
  });
  const annotationsVisible = shouldShowAnnotationInfoBox({
    infoBoxState,
    is3dAnnotationHost,
    layers,
    uiMode,
  });

  if (!annotationsVisible || !resolvedInfoBoxState) {
    return null;
  }

  return (
    <CismapRuntimeAnnotationInfoBox
      infoBoxState={resolvedInfoBoxState}
      showInstructionContent={is3dAnnotationHost}
      annotationToolIds={annotationToolIds}
      headerBackgroundColor={headerBackgroundColor}
      headerTitle={headerTitle}
      layoutProps={CESIUM_ANNOTATION_CONFIG.infoBox}
      secondaryInfoBoxElements={secondaryInfoBoxElements}
    />
  );
};

export default AnnotationInfoBox;
