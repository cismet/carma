import { useRef } from "react";
import { useSelector } from "react-redux";

import type { CesiumConfig } from "@carma-mapping/engines/cesium";
import { selectViewerIsMode2d } from "@carma-mapping/engines/cesium";
import type { LeafletConfig } from "@carma/types";

import { useGeoportalOverlays } from "./hooks/useGeoportalOverlays";
import { useDispatchSachdatenInfoText } from "../../hooks/useDispatchSachdatenInfoText.ts";
// no UI mode handling here; wrapper handles 2D-specific UI flows
import { TopicMapComponentWrapper } from "./components/TopicMapComponentWrapper";
import { CesiumMapComponentWrapper } from "./components/CesiumMapComponentWrapper";
import { CESIUM_CONFIG, LEAFLET_CONFIG } from "../../config/app.config";

import "../leaflet.css";

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

  const isMode2d = useSelector(selectViewerIsMode2d) || !allow3d;

  useGeoportalOverlays();

  useDispatchSachdatenInfoText();

  const now = Date.now();
  const intervalMs = now - lastRenderTimeStampRef.current;
  const nextCount = rerenderCountRef.current + 1;
  console.debug("RENDER: [GEOPORTAL] MAP", {
    isMode2d,
    count: nextCount,
    intervalMs,
  });
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
      <CesiumMapComponentWrapper
        allow3d={allow3d}
        cesiumOptions={cesiumOptions}
      />
    </>
  );
};

export default GeoportalMap;
