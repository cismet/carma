import { useEffect, useRef, useState } from "react";
import { ClassificationType, GroundPrimitive, Scene } from "cesium";

import {
  MarkerPrimitiveData,
  MarkerModelAsset,
  removeCesiumMarker,
  removeGroundPrimitiveById,
  useCesiumContext,
  isValidScene,
  tryWithValidScene,
  sceneRequestRender,
} from "@carma-mapping/engines/cesium";

import {
  SelectionMapMode,
  useSelection,
} from "../components/SelectionProvider";
import { cesiumHitTrigger } from "../utils/cesiumHitTrigger";

export const SELECTED_POLYGON_ID = "searchgaz-highlight-polygon";
export const INVERTED_SELECTED_POLYGON_ID = "searchgaz-inverted-polygon";

const cleanUpCesium = (
  scene: Scene,
  selectedMarkerData: MarkerPrimitiveData | null,
  setSelectedMarkerData: (data: MarkerPrimitiveData | null) => void
) => {
  console.debug("HOOK: cleanUpCesium", selectedMarkerData);

  if (selectedMarkerData) {
    removeCesiumMarker(scene, selectedMarkerData);
    setSelectedMarkerData(null);
  }
  tryWithValidScene(scene, (scene) => {
    removeGroundPrimitiveById(scene, SELECTED_POLYGON_ID);
    removeGroundPrimitiveById(scene, INVERTED_SELECTED_POLYGON_ID);
    sceneRequestRender(scene);
  });
};

const isMarkerPrimitivePresent = (
  scene: Scene,
  markerData: MarkerPrimitiveData | null,
  selectionKey: number | string | null
) => {
  if (!markerData) {
    return false;
  }

  if (markerData.selectionKey !== selectionKey) {
    return false;
  }

  let isPresent = false;

  if (!isValidScene(scene)) return;

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

  return isPresent;
};

const areSelectionPolygonsPresent = (
  scene: Scene,
  selectedId: string,
  invertedId: string
) => {
  let hasSelected = false;
  let hasInverted = false;

  if (!isValidScene(scene)) return;

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

  return hasSelected && hasInverted;
};

export const useSelectionCesium = (
  isActive: boolean,
  markerAsset?: MarkerModelAsset,
  markerAnchorHeight?: number,
  classificationType: ClassificationType = ClassificationType.BOTH,
  useCameraHeight: boolean = false,
  duration: number = 3,
  durationFactor: number = 0.2
) => {
  const { sceneRef } = useCesiumContext();

  const { selection } = useSelection();
  const lastSelectionKeyRef = useRef<number | null>(null);
  const lastSelectionTimestampRef = useRef<number | null>(null);
  const [selectedMarkerData, setSelectedMarkerData] =
    useState<MarkerPrimitiveData | null>(null);

  useEffect(() => {
    if (!isValidScene(sceneRef.current)) {
      return;
    }
    const scene = sceneRef.current;

    if (selection && isActive) {
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
        scene,
        selectedMarkerData,
        selectionKey
      );

      const isReselectionWithMarker =
        isMarkerPresent && selectedMarkerData?.selectionKey === selectionKey;

      const isReselectionArea =
        selection.isAreaSelection === true &&
        lastSelectionKeyRef.current === selectionKey &&
        areSelectionPolygonsPresent(
          scene,
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
        markerAsset,
        markerAnchorHeight,
        classificationType,
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
          data.selectionKey = selectionKey;
          data.selectionTimestamp = selectionTimestamp ?? undefined;
          if (data.model && selectionKey != null) {
            data.model.id = String(selectionKey);
          }
        }
        setSelectedMarkerData(data);
      };

      cesiumHitTrigger(
        [selection],
        selectedMarkerData,
        setMarkerDataWithMeta,
        options
      );
    } else if (!selection && isActive) {
      // Only cleanup when selection is cleared AND we're in 3D mode
      // Don't cleanup when transitioning to 2D (isActive=false)
      lastSelectionKeyRef.current = null;
      cleanUpCesium(scene, selectedMarkerData, setSelectedMarkerData);
    }
  }, [
    selection,
    useCameraHeight,
    isActive,
    markerAsset,
    markerAnchorHeight,
    classificationType,
    duration,
    durationFactor,
    selectedMarkerData,
    sceneRef,
  ]);
};
