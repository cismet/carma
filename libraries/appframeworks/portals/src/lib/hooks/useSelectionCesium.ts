import { useEffect, useRef, useState } from "react";

import {
  CesiumOptions,
  EntityData,
  removeCesiumMarker,
  removeGroundPrimitiveById,
  useCesiumContext,
} from "@carma-mapping/engines/cesium";
import type { CesiumContextType } from "@carma-mapping/engines/cesium";

import { useSelection } from "../components/SelectionProvider";
import { cesiumHitTrigger } from "../utils/cesiumHitTrigger";

export const SELECTED_POLYGON_ID = "searchgaz-highlight-polygon";
export const INVERTED_SELECTED_POLYGON_ID = "searchgaz-inverted-polygon";

const cleanUpCesium = (
  ctx: CesiumContextType,
  selectedCesiumEntityData: EntityData | null,
  setSelectedCesiumEntityData: (data: EntityData | null) => void
) => {
  console.debug("HOOK: cleanUpCesium", selectedCesiumEntityData);
  ctx.withEntities((entities, viewer) => {
    if (selectedCesiumEntityData) {
      removeCesiumMarker(ctx, selectedCesiumEntityData);
      setSelectedCesiumEntityData(null);
    }
    entities.removeById(SELECTED_POLYGON_ID);
    removeGroundPrimitiveById(viewer.scene, INVERTED_SELECTED_POLYGON_ID);
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
  const [selectedCesiumEntityData, setSelectedCesiumEntityData] =
    useState<EntityData | null>(null);

  useEffect(() => {
    if (!isActive || !ctx.isValidViewer()) {
      return;
    }

    if (selection) {
      const isDuplicateSelection =
        lastSelectionKeyRef.current === selection.sorter &&
        lastSelectionTimestampRef.current === selection.selectionTimestamp;

      if (isDuplicateSelection) {
        console.debug("HOOK: useSelectionTopicMap - same selection, skipping");
        return;
      }

      lastSelectionKeyRef.current = selection.sorter;
      lastSelectionTimestampRef.current = selection.selectionTimestamp;

      console.debug("HOOK: useSelectionCesium", selection, isActive);

      const options = {
        mapOptions: cesiumOptions,
        selectedPolygonId: SELECTED_POLYGON_ID,
        invertedSelectedPolygonId: INVERTED_SELECTED_POLYGON_ID,
        useCameraHeight,
        duration,
        durationFactor,
      };

      cesiumHitTrigger(
        [selection],
        ctx,
        selectedCesiumEntityData,
        setSelectedCesiumEntityData,
        options
      );
    } else {
      lastSelectionKeyRef.current = null;
      cleanUpCesium(ctx, selectedCesiumEntityData, setSelectedCesiumEntityData);
    }
  }, [
    selection,
    useCameraHeight,
    isActive,
    cesiumOptions,
    duration,
    durationFactor,
    setSelectedCesiumEntityData,
    selectedCesiumEntityData,
    ctx,
  ]);
};
