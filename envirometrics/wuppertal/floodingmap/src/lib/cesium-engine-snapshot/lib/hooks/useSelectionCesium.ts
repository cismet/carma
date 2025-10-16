import { useEffect, useRef, useState } from "react";
import { GroundPrimitive } from "cesium";

import {
  CesiumOptions,
  MarkerPrimitiveData,
  removeCesiumMarker,
  removeGroundPrimitiveById,
  useCesiumContext,
} from "../../index";
import type { CesiumContextType } from "../../index";

import { SelectionMapMode, useSelection } from "@carma-appframeworks/portals";
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

const areSelectionPolygonsPresent = (
  ctx: CesiumContextType,
  selectedId: string,
  invertedId: string
) => {
  let hasSelected = false;
  let hasInverted = false;

  ctx.withScene((scene) => {
    if (!scene || scene.isDestroyed()) return;

    const { groundPrimitives } = scene;

    if (!groundPrimitives || groundPrimitives.isDestroyed()) return;

    for (let i = 0; i < groundPrimitives.length; i++) {
      const primitive = groundPrimitives.get(i);
      if (!(primitive instanceof GroundPrimitive)) continue;

      const instances = primitive.geometryInstances;

      if (Array.isArray(instances)) {
        for (const instance of instances) {
          if (!instance) continue;
          if (instance.id === selectedId) hasSelected = true;
          if (instance.id === invertedId) hasInverted = true;
        }
      } else if (instances) {
        if (instances.id === selectedId) hasSelected = true;
        if (instances.id === invertedId) hasInverted = true;
      }

      if (hasSelected && hasInverted) {
        break;
      }
    }
  });

  return hasSelected && hasInverted;
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
      const selectionKey = selection.sorter ?? null;
      const selectionTimestamp = selection.selectionTimestamp ?? null;

      const isDuplicateSelection =
        lastSelectionKeyRef.current === selectionKey &&
        lastSelectionTimestampRef.current === selectionTimestamp;

      if (isDuplicateSelection) {
        console.debug("HOOK: useSelectionCesium - same selection, skipping");
        return;
      }

      const isMarkerPresent = isMarkerPrimitivePresent(
        ctx,
        selectedMarkerData,
        selectionKey
      );

      const isReselectionWithMarker =
        isMarkerPresent && selectedMarkerData?.selectionId === selectionKey;

      const isReselectionArea =
        selection.isAreaSelection === true &&
        lastSelectionKeyRef.current === selectionKey &&
        areSelectionPolygonsPresent(
          ctx,
          SELECTED_POLYGON_ID,
          INVERTED_SELECTED_POLYGON_ID
        );

      const shouldSkipBecauseMarkerAlreadyPresent =
        isMarkerPresent &&
        !isReselectionWithMarker &&
        selection.selectedFromMapMode !== SelectionMapMode.MODE_3D;

      if (shouldSkipBecauseMarkerAlreadyPresent) {
        console.debug(
          "HOOK: useSelectionCesium - marker already present, skipping"
        );
        return;
      }

      lastSelectionKeyRef.current = selectionKey;
      lastSelectionTimestampRef.current = selectionTimestamp;

      const skipFlyTo =
        selection.selectedFromMapMode === SelectionMapMode.MODE_2D;

      const skipMarkerUpdate = isReselectionWithMarker || isReselectionArea;

      const options = {
        mapOptions: cesiumOptions,
        selectedPolygonId: SELECTED_POLYGON_ID,
        invertedSelectedPolygonId: INVERTED_SELECTED_POLYGON_ID,
        useCameraHeight,
        duration,
        durationFactor,
        skipFlyTo,
        skipMarkerUpdate,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, isActive]);
};
