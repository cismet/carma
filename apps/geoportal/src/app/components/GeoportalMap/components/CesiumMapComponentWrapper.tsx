// Simple wrapper around the portals library component
// Oblique mode initialization now happens inside CesiumObliqueMode component

import { CesiumMapComponentWrapper as PortalsCesiumWrapper } from "@carma-appframeworks/portals";

// Config type for Cesium options
type CesiumConfig = {
  models?: unknown[];
  markerKey?: string;
  markerAnchorHeight?: number;
  transitions?: {
    mapMode?: {
      duration?: number;
    };
  };
  camera?: unknown;
};

type CesiumMapComponentWrapperProps = {
  allow3d?: boolean;
  cesiumOptions: Partial<CesiumConfig>;
};

export const CesiumMapComponentWrapper = ({
  allow3d,
  cesiumOptions,
}: CesiumMapComponentWrapperProps) => {
  // Delegate to portals library component
  return (
    <PortalsCesiumWrapper allow3d={allow3d} cesiumOptions={cesiumOptions} />
  );
};

export default CesiumMapComponentWrapper;
