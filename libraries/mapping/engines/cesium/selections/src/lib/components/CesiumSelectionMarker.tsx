import { useEffect, useRef } from "react";
import { useCesiumContext } from "@carma/cesium/core";
import { useSelection } from "@carma-appframeworks/portals";
import type { Cartographic } from "@carma/cesium";

import type {
  MarkerPrimitiveData,
  MarkerModelAsset,
  PolylineConfig,
} from "../markers/types";
import { addCesiumMarker, removeCesiumMarker } from "../markers/manager";

export interface MarkerConfig {
  position: Cartographic;
  groundPosition: Cartographic;
  modelConfig: MarkerModelAsset;
  stemline?: PolylineConfig;
}

export interface CesiumSelectionMarkerProps {
  enabled?: boolean;
  markerConfig: MarkerConfig;
}

export const CesiumSelectionMarker: React.FC<CesiumSelectionMarkerProps> = ({
  enabled = true,
  markerConfig,
}) => {
  const { sceneRef } = useCesiumContext();
  const { selection, modelSelection } = useSelection();
  const markerRef = useRef<MarkerPrimitiveData | null>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !enabled) return;

    const activeSelection = selection || modelSelection;

    if (markerRef.current) {
      removeCesiumMarker(scene, markerRef.current);
      markerRef.current = null;
    }

    if (activeSelection) {
      const markerId =
        "id" in activeSelection
          ? String(activeSelection.id)
          : String(
              activeSelection.sorter || activeSelection.selectionTimestamp
            );

      addCesiumMarker(
        scene,
        markerConfig.position,
        markerConfig.groundPosition,
        markerConfig.modelConfig,
        {
          id: markerId,
          stemline: markerConfig.stemline,
        }
      ).then((markerData) => {
        if (markerData) {
          markerRef.current = markerData;
        }
      });
    }
  }, [selection, modelSelection, enabled, markerConfig, sceneRef]);

  useEffect(() => {
    return () => {
      const scene = sceneRef.current;
      if (scene && markerRef.current) {
        removeCesiumMarker(scene, markerRef.current);
      }
      markerRef.current = null;
    };
  }, [sceneRef]);

  return null;
};
