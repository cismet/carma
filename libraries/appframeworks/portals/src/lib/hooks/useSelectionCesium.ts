import { useEffect, useRef, useState } from "react";
import { GroundPrimitive, Scene } from "@carma/cesium";

import {
  CesiumOptions,
  MarkerPrimitiveData,
  removeCesiumMarker,
  removeGroundPrimitiveById,
  useCesiumContext,
} from "@carma-mapping/engines/cesium";

import {
  SelectionMapMode,
  useSelection,
} from "../components/SelectionProvider";
import { cesiumHandleAreaSelection } from "../utils/cesium-handle-area-selection";
import { cesiumHandlePointSelection } from "../utils/cesium-handle-point-selection";
import { getDerivedGeometries } from "../utils/getDerivedGeometries";
import type { HitTriggerOptions } from "../utils/cesium-selection-types";

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
  const shouldAddSelectionInCesiumRef = useRef<boolean>(false);
  const wasActiveRef = useRef<boolean>(false);
  const [selectedMarkerData, setSelectedMarkerData] =
    useState<MarkerPrimitiveData | null>(null);

  // need rerender here!
  const isActive = getIsActive();

  useEffect(() => {
    if (!isActive && wasActiveRef.current) {
      console.debug(
        "[CESIUM-SELECTION] Cesium becoming inactive - keeping selection refs to prevent re-animation"
      );
      // DON'T clear lastSelectionKeyRef - we need it to detect duplicates when re-activating
      shouldAddSelectionInCesiumRef.current = false;
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
      const selectionMapMode = selection.selectedFromMapMode ?? null;

      const isDuplicateSelection =
        lastSelectionKeyRef.current === selectionKey &&
        lastSelectionTimestampRef.current === selectionTimestamp;

      console.debug("[CESIUM-SELECTION] Processing selection", {
        selectionKey,
        lastKey: lastSelectionKeyRef.current,
        isDuplicate: isDuplicateSelection,
        selectionMapMode,
        shouldAddInCesium: shouldAddSelectionInCesiumRef.current,
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

      // Check for reselections BEFORE skip logic
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

      const isReselection = isReselectionWithMarker || isReselectionArea;

      // Skip if this selection doesn't need to be added (already handled or made in Cesium)
      // BUT allow re-selections to fly to the area again
      const shouldSkipSelectionHandling =
        !shouldAddSelectionInCesiumRef.current &&
        lastSelectionKeyRef.current === selectionKey &&
        !isReselection;

      if (shouldSkipSelectionHandling) {
        console.debug(
          "HOOK: useSelectionCesium - selection not pending, skipping"
        );
        return;
      }

      const shouldSkipBecauseMarkerAlreadyPresent =
        isMarkerPresent &&
        !isReselection &&
        selection.selectedFromMapMode !== SelectionMapMode.MODE_3D;

      if (shouldSkipBecauseMarkerAlreadyPresent) {
        console.debug(
          "HOOK: useSelectionCesium - marker already present, skipping"
        );
        return;
      }

      lastSelectionKeyRef.current = selectionKey;
      lastSelectionTimestampRef.current = selectionTimestamp;

      // Set flag for selections from Leaflet (2D mode) - they need to be added when Cesium becomes active
      // Clear flag for selections from Cesium (3D mode) - they're already in Cesium
      shouldAddSelectionInCesiumRef.current =
        selectionMapMode === SelectionMapMode.MODE_2D;

      console.debug(
        "[CESIUM-SELECTION] Should add selection in Cesium:",
        shouldAddSelectionInCesiumRef.current,
        "for mode",
        selectionMapMode
      );

      const skipMarkerUpdate = isReselection;

      // Skip flyTo only for selections from Leaflet that are NOT re-selections
      // Re-selections in Cesium should always fly to show the area again
      const skipFlyTo =
        selection.selectedFromMapMode === SelectionMapMode.MODE_2D &&
        !isReselection;

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

      const derivedGeometries = getDerivedGeometries(selection);
      const { polygon } = derivedGeometries;

      const commonOptions: HitTriggerOptions = {
        mapOptions: cesiumOptions,
        selectedPolygonId: SELECTED_POLYGON_ID,
        invertedSelectedPolygonId: INVERTED_SELECTED_POLYGON_ID,
        duration,
        durationFactor,
        skipFlyTo,
        skipMarkerUpdate,
      };

      if (polygon) {
        // Area selection - clean up marker first
        if (!skipMarkerUpdate && selectedMarkerData) {
          removeCesiumMarker(scene, selectedMarkerData);
          scene.requestRender();
        }

        cesiumHandleAreaSelection(
          scene,
          getTerrainProvider(),
          getSurfaceProvider(),
          derivedGeometries,
          commonOptions
        );

        // Clear flag after adding selection
        shouldAddSelectionInCesiumRef.current = false;
      } else {
        // Point selection - clean up area primitives first
        if (!skipMarkerUpdate) {
          removeGroundPrimitiveById(scene, SELECTED_POLYGON_ID);
          removeGroundPrimitiveById(scene, INVERTED_SELECTED_POLYGON_ID);
          scene.requestRender();
        }

        cesiumHandlePointSelection(
          scene,
          getTerrainProvider(),
          getSurfaceProvider(),
          selectedMarkerData,
          setMarkerDataWithMeta,
          derivedGeometries,
          commonOptions
        );

        // Clear flag after adding selection
        shouldAddSelectionInCesiumRef.current = false;
      }
    } else {
      lastSelectionKeyRef.current = null;
      shouldAddSelectionInCesiumRef.current = false;
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
