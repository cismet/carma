import { useEffect } from "react";
import type * as L from "leaflet";

export const useLeafletZoomEndFlag = (
  getTopicMap: () => L.Map | undefined,
  setShouldUpdateFeatureInfo: (v: boolean) => void
) => {
  useEffect(() => {
    const map = getTopicMap();
    if (!map) return;
    const handleZoomEnd = () => setShouldUpdateFeatureInfo(true);
    map.on("zoomend", handleZoomEnd);
    return () => {
      const m = getTopicMap();
      if (!m) return;
      m.off("zoomend", handleZoomEnd);
    };
  }, [getTopicMap, setShouldUpdateFeatureInfo]);
};

export const useUpdateFeatureInfoOnLayersChange = (
  isModeFeatureInfo: boolean,
  pos: [number, number] | null,
  layers: unknown[],
  updateFeatureInfoLeaflet: () => void
) => {
  useEffect(() => {
    if (isModeFeatureInfo && pos) updateFeatureInfoLeaflet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers]);
};

export const useUpdateFeatureInfoOnFlag = (
  shouldUpdateFeatureInfo: boolean,
  updateFeatureInfoLeaflet: () => void
) => {
  useEffect(() => {
    if (shouldUpdateFeatureInfo) {
      updateFeatureInfoLeaflet();
    }
  }, [shouldUpdateFeatureInfo, updateFeatureInfoLeaflet]);
};

export const useCleanupFeatureInfoOnModeChange = (opts: {
  shouldCleanup: boolean;
  getTopicMap: () => L.Map | undefined;
  marker?: L.Marker;
  markerAccent?: L.Marker;
  onCleanup: () => void;
}) => {
  const { shouldCleanup, getTopicMap, marker, markerAccent, onCleanup } = opts;
  useEffect(() => {
    const map = getTopicMap();
    if (shouldCleanup && marker && map) {
      map.removeLayer(marker);
      if (markerAccent) map.removeLayer(markerAccent);
      onCleanup();
    }
  }, [shouldCleanup, marker, markerAccent, getTopicMap, onCleanup]);
};
