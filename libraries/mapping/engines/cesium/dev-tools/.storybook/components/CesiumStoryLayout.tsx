import { type ReactNode } from "react";
import { CesiumSceneComponent } from "@carma-mapping/engines/cesium/core";
import { CesiumLevaControls } from "@carma-mapping/engines/cesium/dev-tools";

interface CesiumStoryLayoutProps {
  children?: ReactNode;
}

/**
 * Reusable storybook layout for Cesium core lib
 * Includes Leva controls for interactive debugging
 */
export function CesiumStoryLayout({
  children,
}: CesiumStoryLayoutProps) {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        position: "relative",
        overflow: "hidden",
        margin: 0,
        padding: 0,
      }}
    >
      <CesiumSceneComponent />
      <CesiumLevaControls />
      {children}
    </div>
  );
}

