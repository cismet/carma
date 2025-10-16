// TODO: Remove this file when oblique initialization is moved to portals
// This is now just a wrapper around the portals library component
// The only app-specific part is useObliqueInitializer

import { CesiumMapComponentWrapper as PortalsCesiumWrapper } from "@carma-appframeworks/portals";
import { useFeatureFlags } from "@carma/providers/feature-flag";
import { useObliqueInitializer } from "@carma-mapping/cesium-oblique-mode";

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
  const flags = useFeatureFlags();

  // App-specific: Initialize oblique mode - this sets up event listeners internally
  useObliqueInitializer(flags?.isDebugMode);

  // Delegate to portals library component
  return (
    <PortalsCesiumWrapper allow3d={allow3d} cesiumOptions={cesiumOptions} />
  );
};

export default CesiumMapComponentWrapper;
