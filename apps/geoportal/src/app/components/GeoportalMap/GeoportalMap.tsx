import { useMemo, useRef } from "react";
import type { LeafletConfig } from "@carma/types";

import { useGeoportalOverlays } from "./hooks/useGeoportalOverlays";
// no UI mode handling here; wrapper handles 2D-specific UI flows
import { TopicMapComponentWrapper } from "./components/TopicMapComponentWrapper";
import { CesiumMapComponentWrapper } from "@carma-appframeworks/portals";
import { LEAFLET_CONFIG } from "../../config/app.config";

interface MapProps {
  height: number;
  width: number;
  allow3d?: boolean;
  options?: {
    topicmap?: Partial<LeafletConfig>;
  };
}

export const GeoportalMap = ({ height, width, allow3d, options }: MapProps) => {
  // Memoize options to prevent re-renders when parent re-renders with same values
  const leafletOptions = useMemo(
    () => options?.topicmap ?? LEAFLET_CONFIG,
    [options?.topicmap]
  );
  // cesium options applied in CesiumContextProvider and CarmaProviderWrapper

  const rerenderCountRef = useRef(0);
  const lastRenderTimeStampRef = useRef(Date.now());
  const lastRenderIntervalRef = useRef(0);

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
      {allow3d && <CesiumMapComponentWrapper />}
    </>
  );
};

export default GeoportalMap;
