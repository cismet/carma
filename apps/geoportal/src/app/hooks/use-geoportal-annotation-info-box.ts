import { useRuntimeAnnotationInfoBoxSlots } from "@carma-mapping/annotations/runtime";
import { ANNOTATION_INFO_BOX_HELP_LAYOUTS } from "@carma-mapping/annotations/ui";
import { useFeatureFlags } from "@carma-providers/feature-flag";

import { CESIUM_ANNOTATION_CONFIG } from "../config/app.config";
import {
  EXTERNAL_ANNOTATION_INFO_BOX_HEADER_BACKGROUND_COLOR,
  EXTERNAL_ANNOTATION_INFO_BOX_TITLE,
  GEOPORTAL_ANNOTATION_HELP_LOCALE,
  isExternalAnnotationInfoBoxState,
  resolveGeoportalInfoBoxState,
} from "../helper/annotation-info-box";
import { resolveGeoportalAnnotationInfoBoxVisualOptions } from "../helper/annotation-info-box-visual-options";

type GeoportalAnnotationInfoBoxOptions = {
  /** Drafting and editing help belongs in the box. */
  includeAuthoringInstruction: boolean;
  /** The box shows the help in its compact layout, as in a 3D annotation host. */
  compactHelp: boolean;
};

/** What the Cesium and the MapLibre view's annotation info boxes share. */
export const useGeoportalAnnotationInfoBox = ({
  includeAuthoringInstruction,
  compactHelp,
}: GeoportalAnnotationInfoBoxOptions) => {
  const flags = useFeatureFlags();
  const annotationToolIds =
    flags.featureFlagCesiumAnnotationAllTools === true
      ? CESIUM_ANNOTATION_CONFIG.tools.allToolIds
      : CESIUM_ANNOTATION_CONFIG.tools.stableToolIds;
  const infoBoxState = useRuntimeAnnotationInfoBoxSlots({
    authoringInstructionHelpLayout: compactHelp
      ? ANNOTATION_INFO_BOX_HELP_LAYOUTS.COMPACT
      : undefined,
    helpLocale: GEOPORTAL_ANNOTATION_HELP_LOCALE,
    includeAuthoringInstruction,
    visualOptions: resolveGeoportalAnnotationInfoBoxVisualOptions,
  });
  const external = isExternalAnnotationInfoBoxState(infoBoxState);
  return {
    infoBoxState,
    resolvedInfoBoxState: resolveGeoportalInfoBoxState(infoBoxState),
    annotationToolIds,
    headerTitle: external ? EXTERNAL_ANNOTATION_INFO_BOX_TITLE : undefined,
    headerBackgroundColor: external
      ? EXTERNAL_ANNOTATION_INFO_BOX_HEADER_BACKGROUND_COLOR
      : undefined,
  };
};
