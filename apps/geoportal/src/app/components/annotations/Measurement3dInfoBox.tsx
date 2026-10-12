import { CismapRuntimeAnnotationInfoBox } from "@carma-appframeworks/portals";
import type { Measurement3dInfoBoxProps } from "@carma-mapping/addons";
import { ANNOTATION_INFO_BOX_HELP_LAYOUTS } from "@carma-mapping/annotations/ui";
import { useRuntimeAnnotationInfoBoxSlots } from "@carma-mapping/annotations/runtime";
import { useFeatureFlags } from "@carma-providers/feature-flag";

import { CESIUM_ANNOTATION_CONFIG } from "../../config/app.config";
import {
  EXTERNAL_ANNOTATION_INFO_BOX_HEADER_BACKGROUND_COLOR,
  EXTERNAL_ANNOTATION_INFO_BOX_TITLE,
  GEOPORTAL_ANNOTATION_HELP_LOCALE,
  isExternalAnnotationInfoBoxState,
  resolveGeoportalInfoBoxState,
} from "../../helper/annotation-info-box";
import { resolveGeoportalAnnotationInfoBoxVisualOptions } from "../../helper/annotation-info-box-visual-options";

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
  const flags = useFeatureFlags();
  const annotationToolIds =
    flags.featureFlagCesiumAnnotationAllTools === true
      ? CESIUM_ANNOTATION_CONFIG.tools.allToolIds
      : CESIUM_ANNOTATION_CONFIG.tools.stableToolIds;
  const infoBoxState = useRuntimeAnnotationInfoBoxSlots({
    authoringInstructionHelpLayout: ANNOTATION_INFO_BOX_HELP_LAYOUTS.COMPACT,
    helpLocale: GEOPORTAL_ANNOTATION_HELP_LOCALE,
    includeAuthoringInstruction: authoring,
    visualOptions: resolveGeoportalAnnotationInfoBoxVisualOptions,
  });
  const resolvedInfoBoxState = resolveGeoportalInfoBoxState(infoBoxState);
  if (!resolvedInfoBoxState) return null;
  const external = isExternalAnnotationInfoBoxState(infoBoxState);
  return (
    <CismapRuntimeAnnotationInfoBox
      infoBoxState={resolvedInfoBoxState}
      isCesium
      annotationToolIds={annotationToolIds}
      headerBackgroundColor={
        external
          ? EXTERNAL_ANNOTATION_INFO_BOX_HEADER_BACKGROUND_COLOR
          : undefined
      }
      headerTitle={external ? EXTERNAL_ANNOTATION_INFO_BOX_TITLE : undefined}
      layoutProps={{ controlOrder, pixelWidth }}
    />
  );
};
