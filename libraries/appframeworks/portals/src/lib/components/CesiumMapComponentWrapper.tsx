/* eslint-disable @nx/enforce-module-boundaries */
/* Lazy loading disabled for transition wiring - cesium/core imported directly */

import { ReactNode, useEffect, useRef } from "react";
// eslint-disable-next-line carma/no-direct-cesium
import { CesiumSceneComponent, useCesiumContext } from "@carma/cesium/core";
import { usePortalCesiumInstance } from "../contexts";

/**
 * CesiumMapComponentWrapper - Portal-level wrapper for Cesium 3D scene
 *
 * RESPONSIBILITIES:
 * - Provide container element for Cesium scene
 * - Bridge portal's ready callback to cesium context (has access to both)
 *
 * STATE MANAGEMENT:
 * - Scene handles its own activation/suspension via CesiumContext
 * - PortalContext manages all state (currentMapStyle, camera, etc.)
 * - Wrapper bridges callback between portal and cesium contexts
 * - Camera initialization handled by CesiumContext from portal config
 */
export const CesiumMapComponentWrapper = ({
  children,
}: {
  children?: ReactNode;
}) => {
  const cesiumContainerRef = useRef<HTMLDivElement | null>(null);
  
  // Bridge portal callback to cesium context
  const { readyCallbackRef: portalCallbackRef } = usePortalCesiumInstance();
  const { onSceneReadyCallbackRef: cesiumCallbackRef } = useCesiumContext();
  
  // Pass portal's callback to cesium when available
  useEffect(() => {
    if (portalCallbackRef.current && !cesiumCallbackRef.current) {
      console.log("[CesiumMapComponentWrapper] Bridging portal callback to cesium context");
      cesiumCallbackRef.current = portalCallbackRef.current;
    }
  }, [portalCallbackRef, cesiumCallbackRef]);

  return (
    <div
      className={"map-container-3d"}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 400,
      }}
    >
      <div
        ref={cesiumContainerRef}
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <CesiumSceneComponent
          key="cesium-scene"
          containerRef={cesiumContainerRef}
        >
          {children}
        </CesiumSceneComponent>
      </div>
    </div>
  );
};

export default CesiumMapComponentWrapper;
