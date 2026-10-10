import { useEffect } from "react";

import { CismapRuntimeAnnotationInfoBox } from "@carma-appframeworks/portals";
import {
  registerMeasurement3dInfoBox,
  type Measurement3dInfoBoxProps,
} from "@carma-mapping/addons";
import { ANNOTATION_INFO_BOX_HELP_LAYOUTS } from "@carma-mapping/annotations/ui";
import {
  RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS,
  useRuntimeAnnotationInfoBoxSlots,
} from "@carma-mapping/annotations/runtime";
import { useFeatureFlags } from "@carma-providers/feature-flag";

import { CESIUM_ANNOTATION_CONFIG } from "../../config/app.config";
import { isExternalAnnotationInfoBoxState } from "../../helper/annotation-info-box";
import { resolveGeoportalAnnotationInfoBoxVisualOptions } from "../../helper/annotation-info-box-visual-options";

const GEOPORTAL_ANNOTATION_HELP_LOCALE = "de-DE";
const EXTERNAL_ANNOTATION_INFO_BOX_HEADER_BACKGROUND_COLOR = "#3b82f6";
const EXTERNAL_ANNOTATION_INFO_BOX_TITLE = "Informationen";

/**
 * The info box of the 3D measurement in the MapLibre view, the same one the
 * Cesium view shows: its actions, the compact drawing and editing help while
 * the tool is on, and the blue "Informationen" header of saved sets.
 */
const Measurement3dInfoBox = ({
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
  if (!infoBoxState) return null;
  const external = isExternalAnnotationInfoBoxState(infoBoxState);
  const resolvedInfoBoxState =
    external &&
    infoBoxState.kind === RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION
      ? {
          ...infoBoxState,
          slots: {
            ...infoBoxState.slots,
            headingTitle: EXTERNAL_ANNOTATION_INFO_BOX_TITLE,
          },
        }
      : infoBoxState;
  return (
    <CismapRuntimeAnnotationInfoBox
      infoBoxState={resolvedInfoBoxState}
      isCesium
      annotationToolIds={annotationToolIds}
      headerBackgroundColor={
        external ? EXTERNAL_ANNOTATION_INFO_BOX_HEADER_BACKGROUND_COLOR : undefined
      }
      headerTitle={external ? EXTERNAL_ANNOTATION_INFO_BOX_TITLE : undefined}
      layoutProps={{ controlOrder, pixelWidth }}
    />
  );
};

/** Hands the Geoportal info box to the 3D measurement addon while mounted. */
export const useMeasurement3dGeoportalInfoBox = () => {
  useEffect(() => registerMeasurement3dInfoBox(Measurement3dInfoBox), []);
};
