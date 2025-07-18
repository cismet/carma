import React, { useEffect, useRef, ReactNode } from "react";

import { useCesiumViewer } from "../../contexts/CesiumViewerContext";
import { OverlayProvider } from "./OverlayContext";

interface CesiumOverlayAdapterProps {
  children: ReactNode;
}

export const CesiumOverlayAdapter: React.FC<CesiumOverlayAdapterProps> = ({
  children,
}) => {
  const { viewer } = useCesiumViewer();
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Get the Cesium container reference
  useEffect(() => {
    if (viewer && !viewer.isDestroyed()) {
      containerRef.current = viewer.container;
    }
  }, [viewer]);

  // Create frame update callback that syncs with Cesium's render loop
  const onFrameUpdate = () => {
    // This will be called on every Cesium frame update
    // The overlay position updates happen here automatically
  };

  return (
    <OverlayProvider containerRef={containerRef} onFrameUpdate={onFrameUpdate}>
      {children}
    </OverlayProvider>
  );
};
