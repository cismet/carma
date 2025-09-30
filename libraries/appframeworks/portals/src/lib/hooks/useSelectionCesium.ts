import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";

import {
  CesiumOptions,
  MarkerPrimitiveData,
  removeCesiumMarker,
  removeGroundPrimitiveById,
  useCesiumContext,
} from "@carma-mapping/engines/cesium";
import type { CesiumContextType } from "@carma-mapping/engines/cesium";

import {
  SelectionMapMode,
  useSelection,
} from "../components/SelectionProvider";
import { cesiumHitTrigger } from "../utils/cesiumHitTrigger";

export const SELECTED_POLYGON_ID = "searchgaz-highlight-polygon";
export const INVERTED_SELECTED_POLYGON_ID = "searchgaz-inverted-polygon";

const cleanUpCesium = (
  ctx: CesiumContextType,
  selectedMarkerData: MarkerPrimitiveData | null,
  setSelectedMarkerData: (data: MarkerPrimitiveData | null) => void
) => {
  console.debug("HOOK: cleanUpCesium", selectedMarkerData);
  ctx.withScene((scene) => {
    if (selectedMarkerData) {
      removeCesiumMarker(ctx, selectedMarkerData);
      setSelectedMarkerData(null);
    }
    removeGroundPrimitiveById(scene, SELECTED_POLYGON_ID);
    removeGroundPrimitiveById(scene, INVERTED_SELECTED_POLYGON_ID);
    ctx.requestRender();
  });
};

export const useSelectionCesium = (
  isActive: boolean,
  cesiumOptions: CesiumOptions,
  useCameraHeight: boolean = false,
  duration: number = 3,
  durationFactor: number = 0.2
) => {
  const ctx = useCesiumContext();

  const { selection } = useSelection();
  const lastSelectionKeyRef = useRef<number | null>(null);
  const lastSelectionTimestampRef = useRef<number | null>(null);
  const [selectedMarkerData, setSelectedMarkerData] =
    useState<MarkerPrimitiveData | null>(null);

  useEffect(() => {
    if (!isActive || !ctx.isValidViewer()) {
      return;
    }

    if (selection) {
      const isDuplicateSelection =
        lastSelectionKeyRef.current === selection.sorter &&
        lastSelectionTimestampRef.current === selection.selectionTimestamp;

      const wasAddedFrom2D =
        selection.selectedFromMapMode === SelectionMapMode.MODE_2D;

      if (isDuplicateSelection) {
        console.debug("HOOK: useSelectionCesium - same selection, skipping");
        return;
      }

      lastSelectionKeyRef.current = selection.sorter;
      lastSelectionTimestampRef.current = selection.selectionTimestamp;

      console.debug("HOOK: useSelectionCesium", selection, isActive);

      const skipFlyTo = wasAddedFrom2D || isDuplicateSelection;

      const options = {
        mapOptions: cesiumOptions,
        selectedPolygonId: SELECTED_POLYGON_ID,
        invertedSelectedPolygonId: INVERTED_SELECTED_POLYGON_ID,
        useCameraHeight,
        duration,
        durationFactor,
        skipFlyTo,
      };

      cesiumHitTrigger(
        [selection],
        ctx,
        selectedMarkerData,
        setSelectedMarkerData,
        options
      );
    } else {
      lastSelectionKeyRef.current = null;
      cleanUpCesium(ctx, selectedMarkerData, setSelectedMarkerData);
    }
  }, [
    selection,
    useCameraHeight,
    isActive,
    cesiumOptions,
    duration,
    durationFactor,
    selectedMarkerData,
    ctx,
  ]);
};
