import { useEffect, useRef, useState } from "react";

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

const isMarkerPrimitivePresent = (
  ctx: CesiumContextType,
  markerData: MarkerPrimitiveData | null,
  selectionKey: number | string | null
) => {
  if (!markerData) {
    return false;
  }

  if (markerData.selectionId !== selectionKey) {
    return false;
  }

  let isPresent = false;

  ctx.withScene((scene) => {
    if (!scene || scene.isDestroyed()) return;

    const { primitives } = scene;

    if (!primitives || primitives.isDestroyed()) return;

    if (
      markerData.model &&
      typeof markerData.model.isDestroyed === "function" &&
      !markerData.model.isDestroyed() &&
      primitives.contains(markerData.model)
    ) {
      isPresent = true;
      return;
    }

    if (
      markerData.stemline &&
      typeof markerData.stemline.isDestroyed === "function" &&
      !markerData.stemline.isDestroyed() &&
      primitives.contains(markerData.stemline)
    ) {
      isPresent = true;
    }
  });

  return isPresent;
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

      const selectionKey = selection.sorter ?? null;
      const selectionTimestamp = selection.selectionTimestamp ?? null;

      if (isDuplicateSelection) {
        console.debug("HOOK: useSelectionCesium - same selection, skipping");
        return;
      }

      const isMarkerPresent = isMarkerPrimitivePresent(
        ctx,
        selectedMarkerData,
        selectionKey
      );

      if (isMarkerPresent) {
        console.debug(
          "HOOK: useSelectionCesium - marker already present, skipping"
        );
        return;
      }

      lastSelectionKeyRef.current = selectionKey;
      lastSelectionTimestampRef.current = selectionTimestamp;

      const wasAddedFrom2D =
        selection.selectedFromMapMode === SelectionMapMode.MODE_2D;

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

      const setMarkerDataWithMeta = (data: MarkerPrimitiveData | null) => {
        if (data) {
          data.selectionId = selectionKey;
          data.selectionTimestamp = selectionTimestamp;
          if (data.model && selectionKey != null) {
            data.model.id = String(selectionKey);
          }
        }
        setSelectedMarkerData(data);
      };

      cesiumHitTrigger(
        [selection],
        ctx,
        selectedMarkerData,
        setMarkerDataWithMeta,
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
