import { lazy, Suspense } from "react";
import { Spin } from "antd";
import { useObliqueLoader } from "../contexts/ObliqueLoaderContext";

// Lazy load the entire oblique mode wrapper that includes data checking
const ObliqueControlsWithDataCheck = lazy(() =>
  import("@carma-mapping/cesium-oblique-mode").then((module) => {
    // Create a wrapper component that checks data readiness
    const Wrapper = () => {
      const { isAllDataReady } = module.useOblique();

      if (!isAllDataReady) {
        return (
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 9999,
            }}
          >
            <Spin size="large" tip="Lade Schrägluftbilddaten..." />
          </div>
        );
      }

      return <module.ObliqueControls />;
    };

    return { default: Wrapper };
  })
);

/**
 * Cesium Oblique Mode component
 * Lazy-loads the oblique mode controls and functionality
 *
 * Two-stage loading:
 * 1. Lazy load the oblique library code
 * 2. Wait for oblique data to be ready (exterior orientations, footprints)
 *
 * Note: On Cesium suspension, the oblique mode should:
 * - Leave preview mode (hide image preview)
 * - Keep controls active
 * This is handled internally by ObliqueProvider, not here
 */
export const CesiumObliqueMode = () => {
  const { isObliqueLoaded } = useObliqueLoader();

  // Gate 1: Check if oblique library is loaded
  if (!isObliqueLoaded) {
    return null;
  }

  return (
    <Suspense
      fallback={
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 9999,
          }}
        >
          <Spin size="large" tip="Lade Schrägluftbild-Modus..." />
        </div>
      }
    >
      <ObliqueControlsWithDataCheck />
    </Suspense>
  );
};
