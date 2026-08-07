import { useMemo, type ReactNode } from "react";
import { useSelector } from "react-redux";

import { ANNOTATION_SELECT_TOOL_ID } from "@carma-mapping/annotations/core";
import { useAnnotationsRuntime } from "@carma-mapping/annotations/runtime";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import type { FeatureInfo } from "@carma-mapping/utils";

import AnnotationInfoBox from "../../annotations/AnnotationInfoBox.tsx";
import FeatureInfoBox from "../../feature-info/FeatureInfoBox.tsx";
import { isVisible3dAnnotationAdhocLayer } from "../../../helper/adhoc-feature-utils.ts";
import { getSelectedFeature } from "../../../store/slices/features.ts";
import { getLayers } from "../../../store/slices/mapping.ts";
import {
  getUIMode,
  getUIVisibleControls,
  UIMode,
} from "../../../store/slices/ui.ts";

type UseGeoportalCesiumInfoBoxOptions = {
  isOrbiting: boolean;
  onOrbitToggle: () => void;
  onZoomToFeature: (feature: FeatureInfo) => void;
};

/**
 * Info box for the 3D map, shared by the leaflet and maplibre variants: the
 * annotation UI in annotation/measurement mode and for visible saved annotation
 * layers, the feature info box with orbit controls for a 3D selection.
 * Returns null when 2D is active or nothing applies, so each variant can fall
 * back to its own 2D info box.
 */
export const useGeoportalCesiumInfoBox = ({
  isOrbiting,
  onOrbitToggle,
  onZoomToFeature,
}: UseGeoportalCesiumInfoBoxOptions): ReactNode | null => {
  const { isCesium } = useMapFrameworkSwitcherContext();
  const { activeToolType } = useAnnotationsRuntime();
  const uiMode = useSelector(getUIMode);
  const layers = useSelector(getLayers);
  const selectedFeature = useSelector(getSelectedFeature);
  const visibleControls = useSelector(getUIVisibleControls);

  return useMemo(() => {
    if (!isCesium || !visibleControls.infoBox) {
      return null;
    }

    const isModeMeasurement = uiMode === UIMode.MEASUREMENT;
    const isAnnotationSelectToolActive =
      activeToolType === ANNOTATION_SELECT_TOOL_ID;
    const hasVisibleSavedAnnotationLayer = layers.some(
      isVisible3dAnnotationAdhocLayer
    );

    const featureInfoBox = (
      <FeatureInfoBox
        onZoomToFeature={onZoomToFeature}
        displayOrbit={true}
        isOrbiting={isOrbiting}
        onOrbitToggle={onOrbitToggle}
      />
    );

    if (isModeMeasurement && isAnnotationSelectToolActive && selectedFeature) {
      return featureInfoBox;
    }

    if (
      isModeMeasurement ||
      (!selectedFeature && hasVisibleSavedAnnotationLayer)
    ) {
      return <AnnotationInfoBox />;
    }

    if (selectedFeature) {
      return featureInfoBox;
    }

    return null;
  }, [
    activeToolType,
    isCesium,
    isOrbiting,
    layers,
    onOrbitToggle,
    onZoomToFeature,
    selectedFeature,
    uiMode,
    visibleControls.infoBox,
  ]);
};
