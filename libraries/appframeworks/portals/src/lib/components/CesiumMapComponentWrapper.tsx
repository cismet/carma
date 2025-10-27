import { ReactNode, useRef, Suspense, lazy } from "react";

// Lazy load the heavy Cesium scene component
// This ensures Cesium is only loaded when the scene is actually supposed to render
const CesiumSceneComponentLazy = lazy(() =>
  import("@carma/cesium/core").then((module) => ({
    default: module.CesiumSceneComponent,
  }))
);

// TODO collect configurable text strings for component in own file provider or method
const TEXT_LOADING_3D_SCENE = "Laden der 3D-Szene...";

/**
 * CesiumMapComponentWrapper - Portal-level wrapper for Cesium 3D scene
 *
 * RESPONSIBILITIES:
 * - Lazy load Cesium scene component
 * - Provide container element for Cesium scene
 *
 * STATE MANAGEMENT:
 * - Scene handles its own activation/suspension via CesiumContext
 * - PortalContext manages all state (currentMapStyle, camera, etc.)
 * - This wrapper just handles rendering - no portal or cesium context dependencies
 */
export const CesiumMapComponentWrapper = ({
  children,
}: {
  children?: ReactNode;
}) => {
  const cesiumContainerRef = useRef<HTMLDivElement | null>(null);

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
        <Suspense
          fallback={
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(255, 255, 255, 0.2)",
                backdropFilter: "blur(10px)",
                color: "white",
                fontSize: "14px",
              }}
            >
              {TEXT_LOADING_3D_SCENE}
            </div>
          }
        >
          <CesiumSceneComponentLazy
            key="cesium-scene"
            containerRef={cesiumContainerRef}
          >
            {children}
          </CesiumSceneComponentLazy>
        </Suspense>
      </div>
    </div>
  );
};

export default CesiumMapComponentWrapper;
