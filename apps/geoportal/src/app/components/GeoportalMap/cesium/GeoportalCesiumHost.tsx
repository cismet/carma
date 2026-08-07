import type { CSSProperties } from "react";

import {
  CesiumHost,
  type CesiumHostState,
} from "@carma-mapping/engines/cesium/react/runtime";

import { CESIUM_CONFIG } from "../../../config/app.config.ts";
import { useGeoportalInitialValues } from "../../../hooks/useGeoportalInitialValues.ts";
import { GEOPORTAL_CESIUM_CONTAINER_ID } from "../../annotations/cesium-annotations.constants.ts";

const MAP_CONTAINER_STYLE: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 400,
};

type GeoportalCesiumHostProps = {
  allow3d?: boolean;
  shouldMountCesium: boolean;
  onHostChange: (state: CesiumHostState) => void;
};

/** The geoportal 3D container, mounted the same way by both map variants. */
export const GeoportalCesiumHost = ({
  allow3d,
  shouldMountCesium,
  onHostChange,
}: GeoportalCesiumHostProps) => {
  const { homeValidationCenter, initialCameraView, isInitialCameraResolved } =
    useGeoportalInitialValues();

  if (!allow3d || !isInitialCameraResolved || !shouldMountCesium) {
    return null;
  }

  return (
    <CesiumHost
      id={GEOPORTAL_CESIUM_CONTAINER_ID}
      className={"map-container-3d"}
      style={MAP_CONTAINER_STYLE}
      onHostChange={onHostChange}
      cameraLimiterOptions={CESIUM_CONFIG.camera}
      homeValidationCenter={homeValidationCenter}
      initialCameraView={initialCameraView}
    />
  );
};
