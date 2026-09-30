import { useEffect } from "react";

import { acquireSharedThreeScene } from "@carma-mapping/engines/maplibre";

import type { AddonComponentProps } from "../../lib/registry";

export type MapStyle3dConfig = {
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
  const {
    pointLabels = true,
    elevationLines = false,
    elevationLabels = false,
  } = config ?? {};

  useEffect(() => {
    if (!libreMap) return;
    const lease = acquireSharedThreeScene(libreMap, {
      mapStylePresentation: true,
    });
    lease.setPointLabelOverlayVisible(pointLabels);
    lease.setMapStyleElevationVisibility(elevationLines, elevationLabels);
    return () => lease.release();
  }, [libreMap, pointLabels, elevationLines, elevationLabels]);

  return null;
};
