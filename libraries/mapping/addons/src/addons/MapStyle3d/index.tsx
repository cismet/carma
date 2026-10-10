import { useEffect } from "react";
import { useFeatureFlags } from "@carma-providers/feature-flag";
import { useObliqueViewerActions } from "../ObliqueViewer/oblique-actions";

import { acquireSharedThreeScene } from "@carma-mapping/engines/maplibre";

import type { AddonComponentProps } from "../../lib/registry";

export type MapStyle3dConfig = {
  /** Follow the NG viewer option; standalone and Classic presentation stay independent. */
  controlledBy?: "obliqueViewer";
  /** Host chooses a vector Karte source for separate mesh labels. Luftbild is retained. */
  vectorBaseMap?: boolean;
  /** Floating place names, POIs and point symbols above the 3D scene. */
  pointLabels?: boolean;
  elevationLines?: boolean;
  elevationLabels?: boolean;
};

/** Opt-in MapLibre style draping and floating labels on the shared 3D scene. */
export const MapStyle3d = ({
  config,
  libreMap,
}: AddonComponentProps<"mapStyle3d">) => {
  const nextInterface = Boolean(useFeatureFlags().featureFlagObliqueNextUi);
  const { isOn, mapStyle3dEnabled, previewBasemapLabels } =
    useObliqueViewerActions();
  const controlled = nextInterface && config?.controlledBy === "obliqueViewer";
  const enabled = !controlled || (isOn === true && mapStyle3dEnabled === true);
  const {
    pointLabels = true,
    elevationLines = false,
    elevationLabels = false,
  } = config ?? {};

  const labels = pointLabels && (!controlled || previewBasemapLabels === true);
  useEffect(() => {
    if (!libreMap || !enabled) return;
    const lease = acquireSharedThreeScene(libreMap, {
      mapStylePresentation: true,
    });
    lease.setPointLabelOverlayVisible(labels);
    lease.setMapStyleElevationVisibility(elevationLines, elevationLabels);
    return () => lease.release();
  }, [libreMap, enabled, labels, elevationLines, elevationLabels]);

  return null;
};
