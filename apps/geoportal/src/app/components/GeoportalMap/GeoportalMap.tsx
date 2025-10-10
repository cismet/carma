import { useRef } from "react";
import type { CesiumConfig } from "@carma-mapping/engines/cesium";
import type { LeafletConfig } from "@carma/types";

import { useGeoportalOverlays } from "./hooks/useGeoportalOverlays";
// no UI mode handling here; wrapper handles 2D-specific UI flows
import { TopicMapComponentWrapper } from "./components/TopicMapComponentWrapper";
import { CesiumMapComponentWrapper } from "./components/CesiumMapComponentWrapper";
import { CESIUM_CONFIG, LEAFLET_CONFIG } from "../../config/app.config";

interface MapProps {
  height: number;
  width: number;
  allow3d?: boolean;
  options?: {
    topicmap?: Partial<LeafletConfig>;
    cesium?: Partial<CesiumConfig>;
  };
}

export const GeoportalMap = ({ height, width, allow3d, options }: MapProps) => {
  const cesiumOptions = options?.cesium ?? CESIUM_CONFIG;
  const leafletOptions = options?.topicmap ?? LEAFLET_CONFIG;

  const rerenderCountRef = useRef(0);
  const lastRenderTimeStampRef = useRef(Date.now());
  const lastRenderIntervalRef = useRef(0);
  // 3D container is handled inside CesiumMapComponentWrapper

  useGeoportalOverlays();

  const now = Date.now();
  const intervalMs = now - lastRenderTimeStampRef.current;
  const nextCount = rerenderCountRef.current + 1;
  console.debug("RENDER: [GEOPORTAL] MAP", { count: nextCount, intervalMs });
  rerenderCountRef.current = nextCount;
  lastRenderIntervalRef.current = intervalMs;
  lastRenderTimeStampRef.current = now;

  return (
    <>
      <TopicMapComponentWrapper
        height={height}
        width={width}
        leafletOptions={leafletOptions}
      />
      {allow3d && (
        <CesiumMapComponentWrapper
          allow3d={allow3d}
          cesiumOptions={cesiumOptions}
        />
      )}
    </>
  );
};

export default GeoportalMap;
