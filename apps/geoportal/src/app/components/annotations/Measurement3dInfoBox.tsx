import { CismapRuntimeAnnotationInfoBox } from "@carma-appframeworks/portals";
import type { Measurement3dInfoBoxProps } from "@carma-mapping/addons";

import { useGeoportalAnnotationInfoBox } from "../../hooks/use-geoportal-annotation-info-box";

/**
 * The 3D measurement info box of the MapLibre view as the Cesium view shows it:
 * compact drawing and editing help while the tool is on, the blue
 * "Informationen" header for saved sets.
 */
export const Measurement3dInfoBox = ({
  authoring,
  controlOrder,
  pixelWidth,
}: Measurement3dInfoBoxProps) => {
  const {
    resolvedInfoBoxState,
    annotationToolIds,
    headerTitle,
    headerBackgroundColor,
  } = useGeoportalAnnotationInfoBox({
    includeAuthoringInstruction: authoring,
    compactHelp: true,
  });
  if (!resolvedInfoBoxState) return null;
  return (
    <CismapRuntimeAnnotationInfoBox
      infoBoxState={resolvedInfoBoxState}
      showInstructionContent
      annotationToolIds={annotationToolIds}
      headerBackgroundColor={headerBackgroundColor}
      headerTitle={headerTitle}
      layoutProps={{ controlOrder, pixelWidth }}
    />
  );
};
