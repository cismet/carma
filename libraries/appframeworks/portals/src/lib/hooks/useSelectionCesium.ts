import { Viewer } from "cesium";
import { MutableRefObject, useEffect, useRef, useState } from "react";

import {
  CesiumOptions,
  EntityData,
  removeCesiumMarker,
  removeGroundPrimitiveById,
  useCesiumContext,
} from "@carma-mapping/cesium-engine";

import { useSelection } from "../components/SelectionProvider";
import { carmaHitTrigger } from "../utils/carmaHitTrigger";

export const SELECTED_POLYGON_ID = "searchgaz-highlight-polygon";
export const INVERTED_SELECTED_POLYGON_ID = "searchgaz-inverted-polygon";

const NEW_SELECTION_TIMEOUT = 100;

const cleanUpCesium = (
  viewerRef: MutableRefObject<Viewer | null>,
  selectedCesiumEntityData: EntityData | null,
  setSelectedCesiumEntityData: (data: EntityData | null) => void
) => {
  console.debug("HOOK: cleanUpCesium", selectedCesiumEntityData);
  const viewer = viewerRef.current;
  if (!viewer) return;
  if (selectedCesiumEntityData) {
    removeCesiumMarker(viewer, selectedCesiumEntityData);
    setSelectedCesiumEntityData(null);
  }
  viewer.entities.removeById(SELECTED_POLYGON_ID);
  removeGroundPrimitiveById(viewer, INVERTED_SELECTED_POLYGON_ID);
  viewer.scene.requestRender(); // explicit render for requestRenderMode;
};

export const useSelectionCesium = (
  isActive: boolean,
  cesiumOptions: CesiumOptions
) => {
  const { viewerRef } = useCesiumContext();
  const { selection } = useSelection();
  const lastSelectionKey = useRef<number | null>(null);
  const lastSelectionTimestamp = useRef<number | null>(null);
  const [selectedCesiumEntityData, setSelectedCesiumEntityData] =
    useState<EntityData | null>(null);

  // Ref to store the previous selection

  useEffect(() => {
    if (!isActive || !viewerRef) {
      return;
    }

    if (selection) {
      if (
        lastSelectionKey.current === selection.sorter &&
        lastSelectionTimestamp.current === selection.selectionTimestamp
      ) {
        console.debug("HOOK: useSelectionTopicMap - same selection, skipping");
        return;
      }
      lastSelectionKey.current = selection.sorter;
      lastSelectionTimestamp.current = selection.selectionTimestamp;

      const isNewSelection = Boolean(
        selection?.selectionTimestamp &&
          Date.now() - selection.selectionTimestamp < NEW_SELECTION_TIMEOUT
      );

      console.debug("HOOK: useSelectionCesium", selection, isActive);

      const options = {
        mapOptions: cesiumOptions,
        doFlyTo: isNewSelection,
        selectedCesiumEntityData,
        setSelectedCesiumEntityData,
        selectedPolygonId: SELECTED_POLYGON_ID,
        invertedSelectedPolygonId: INVERTED_SELECTED_POLYGON_ID,
      };

      carmaHitTrigger([selection], viewerRef, options);
    } else {
      lastSelectionKey.current = null;
      cleanUpCesium(
        viewerRef,
        selectedCesiumEntityData,
        setSelectedCesiumEntityData
      );
    }
  }, [
    selection,
    viewerRef,
    isActive,
    cesiumOptions,
    setSelectedCesiumEntityData,
    selectedCesiumEntityData,
  ]);
};
