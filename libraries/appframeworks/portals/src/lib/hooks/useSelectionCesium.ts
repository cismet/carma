import {
  CesiumOptions,
  EntityData,
  removeCesiumMarker,
  removeGroundPrimitiveById,
  useCesiumContext,
} from "@carma-mapping/cesium-engine";
import { Viewer } from "cesium";
import { MutableRefObject, useEffect, useMemo, useState, useRef } from "react";
import { useSelection } from "../components/SelectionProvider";
import { carmaHitTrigger } from "../utils/carmaHitTrigger";
import { SearchResultItem } from "../../../../../mapping/fuzzy-search/src/index";

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
  const { selection, setSelection, isNewSelection, setIsNewSelection } =
    useSelection();

  const [selectedCesiumEntityData, setSelectedCesiumEntityData] =
    useState<EntityData | null>(null);

  // Ref to store the previous selection
  const previousSelectionRef = useRef<SearchResultItem | null>(null);

  useEffect(() => {
    // Check if the current selection is the same as the previous one
    if (areSelectionsEqual(previousSelectionRef.current, selection)) {
      // If same, do not retrigger the effect
      return;
    }

    // Update the previous selection ref
    //previousSelectionRef.current = selection;

    const options = {
      cesiumOptions,
      flyTo: isNewSelection,
      selectedCesiumEntityData,
      setSelectedCesiumEntityData,
      selectedPolygonId: SELECTED_POLYGON_ID,
      invertedSelectedPolygonId: INVERTED_SELECTED_POLYGON_ID,
    };

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
    selectedCesiumEntityData,
  ]);
};

// Utility function to compare two selections
const areSelectionsEqual = (
  prevSelection: SearchResultItem | null,
  currentSelection: SearchResultItem | null
): boolean => {
  // Implement your comparison logic here
  // For example, if EntityData has an 'id' field:
  if (prevSelection === currentSelection) return true;
  if (!prevSelection || !currentSelection) return false;
  console.debug("HOOK: areSelectionsEqual", prevSelection, currentSelection);
  return prevSelection.more === currentSelection.more;
};
