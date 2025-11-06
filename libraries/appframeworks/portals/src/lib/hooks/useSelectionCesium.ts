import { useEffect, useRef, useState } from "react";
import { GroundPrimitive, Scene } from "cesium";

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
  scene: Scene,
  selectedMarkerData: MarkerPrimitiveData | null,
  setSelectedMarkerData: (data: MarkerPrimitiveData | null) => void
) => {
  console.debug("HOOK: cleanUpCesium", selectedMarkerData);
  if (selectedMarkerData) {
    removeCesiumMarker(scene, selectedMarkerData);
    setSelectedMarkerData(null);
  }
  removeGroundPrimitiveById(scene, SELECTED_POLYGON_ID);
  removeGroundPrimitiveById(scene, INVERTED_SELECTED_POLYGON_ID);
  scene.requestRender();
};

const isMarkerPrimitivePresent = (
  scene: Scene,
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
  getIsActive: () => boolean,
  cesiumOptions: CesiumOptions,
  useCameraHeight: boolean = false,
  duration: number = 3,
  durationFactor: number = 0.2
) => {
  const { isValidViewer, getScene, getSurfaceProvider, getTerrainProvider } =
    useCesiumContext();

  const { selection } = useSelection();
  const lastSelectionKeyRef = useRef<number | null>(null);
  const lastSelectionTimestampRef = useRef<number | null>(null);
  const wasActiveRef = useRef<boolean>(false);
  const [selectedMarkerData, setSelectedMarkerData] =
    useState<MarkerPrimitiveData | null>(null);

  // need rerender here!
  const isActive = getIsActive();

  useEffect(() => {
    if (!isActive && wasActiveRef.current) {
      console.debug(
        "[CESIUM-SELECTION] Cesium becoming inactive - resetting refs"
      );
      lastSelectionKeyRef.current = null;
      lastSelectionTimestampRef.current = null;
      wasActiveRef.current = false;
      return;
    }

    wasActiveRef.current = isActive;

    if (!isActive || !isValidViewer()) {
      console.debug("[CESIUM-SELECTION] Early return", {
        isActive,
        isValidViewer: isValidViewer(),
      });
      return;
    }

    if (selection) {
      const selectionKey = selection.sorter ?? null;
      const selectionTimestamp = selection.selectionTimestamp ?? null;

      const isDuplicateSelection =
        lastSelectionKeyRef.current === selectionKey &&
        lastSelectionTimestampRef.current === selectionTimestamp;

      console.debug("[CESIUM-SELECTION] Processing selection", {
        selectionKey,
        lastKey: lastSelectionKeyRef.current,
        isDuplicate: isDuplicateSelection,
      });

      if (isDuplicateSelection) {
        console.debug("HOOK: useSelectionCesium - same selection, skipping");
        return;
      }

      const scene = getScene();
      if (!scene) {
        console.warn(
          "HOOK: useSelectionCesium - no valid scene, cannot process selection"
        );
        return;
      }

      const isMarkerPresent = isMarkerPrimitivePresent(
        scene,
        selectedMarkerData,
        selectionKey
      );

      const isReselectionWithMarker =
        isMarkerPresent && selectedMarkerData?.selectionId === selectionKey;

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
        scene,
        getTerrainProvider(),
        getSurfaceProvider(),
        selectedMarkerData,
        setMarkerDataWithMeta,
        options
      );
    } else {
      lastSelectionKeyRef.current = null;
      const scene = getScene();
      if (!scene) {
        console.warn(
          "HOOK: useSelectionCesium - no valid scene, cannot process selection cleanup"
        );
        return;
      }
      cleanUpCesium(scene, selectedMarkerData, setSelectedMarkerData);
    }
  }, [
    isActive,
    getScene,
    isValidViewer,
    getSurfaceProvider,
    getTerrainProvider,
    selection,
    useCameraHeight,
    cesiumOptions,
    duration,
    durationFactor,
    selectedMarkerData,
  ]);
};
