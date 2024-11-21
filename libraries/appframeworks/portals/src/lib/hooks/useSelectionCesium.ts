import {
  CesiumOptions,
  EntityData,
  removeCesiumMarker,
  removeGroundPrimitiveById,
  useCesiumContext,
} from "@carma-mapping/cesium-engine";
import { Viewer } from "cesium";
import { MutableRefObject, useEffect, useState } from "react";
import { useSelection } from "../components/SelectionProvider";
import { carmaHitTrigger } from "../utils/carmaHitTrigger";

export const SELECTED_POLYGON_ID = "searchgaz-highlight-polygon";
export const INVERTED_SELECTED_POLYGON_ID = "searchgaz-inverted-polygon";

const cleanUpCesium = (
  viewerRef: MutableRefObject<Viewer | null>,
  selectedCesiumEntityData: EntityData | null,
  setSelectedCesiumEntityData: (data: EntityData | null) => void
) => {
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
  const { selection, setSelection } = useSelection();

  const [selectedCesiumEntityData, setSelectedCesiumEntityData] =
    useState<EntityData | null>(null);

  const options = {
    cesiumOptions,
    selectedCesiumEntityData,
    setSelectedCesiumEntityData,
    selectedPolygonId: SELECTED_POLYGON_ID,
    invertedSelectedPolygonId: INVERTED_SELECTED_POLYGON_ID,
  };

  useEffect(() => {
    console.debug("HOOK: useSelectionCesium", selection, isActive);
    if (selection && isActive) {
      carmaHitTrigger([selection], [viewerRef], options);
    } else {
      cleanUpCesium(
        viewerRef,
        selectedCesiumEntityData,
        setSelectedCesiumEntityData
      );
    }

    return () =>
      cleanUpCesium(
        viewerRef,
        selectedCesiumEntityData,
        setSelectedCesiumEntityData
      );
  }, [
    selection,
    viewerRef,
    isActive,
    cesiumOptions,
    setSelectedCesiumEntityData,
  ]);
};
