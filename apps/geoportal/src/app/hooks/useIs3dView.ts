import { useSelector } from "react-redux";

import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

import { getLibre3d } from "../store/slices/ui";

/**
 * Whether the map shows the 3D view, in either engine: Cesium or the maplibre
 * 3D mode. UI that only cares about "3D" (labels, disabled 2D tools) reads
 * this; `isCesium` stays for what needs the Cesium engine itself.
 */
export const useIs3dView = (): boolean => {
  const { isCesium } = useMapFrameworkSwitcherContext();
  const libre3d = useSelector(getLibre3d);

  return isCesium || libre3d;
};
