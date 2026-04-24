import { useMemo } from "react";

import {
  resolveVisibleMeasurementAnnotationToolPlugins,
  type AnnotationToolPlugin,
} from "@carma-mapping/annotations/runtime";
import { useFeatureFlags } from "@carma-providers/feature-flag";

import { CESIUM_ANNOTATION_CONFIG } from "../config/app.config";

export const useGeoportalCesiumAnnotationToolPlugins = (
  plugins: readonly AnnotationToolPlugin[]
): readonly AnnotationToolPlugin[] => {
  const flags = useFeatureFlags();
  const showAllTools = flags.featureFlagCesiumAnnotationAllTools;

  return useMemo(
    () =>
      resolveVisibleMeasurementAnnotationToolPlugins(plugins, {
        toolIds: showAllTools
          ? undefined
          : CESIUM_ANNOTATION_CONFIG.toolbar.stableToolIds,
      }),
    [plugins, showAllTools]
  );
};
