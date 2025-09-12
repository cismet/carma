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

const NEW_SELECTION_TIMEOUT = 100;

const cleanUpCesium = (
  ctx: CesiumContextType,
  selectedCesiumEntityData: EntityData | null,
  setSelectedCesiumEntityData: (data: EntityData | null) => void
) => {
  console.debug("HOOK: cleanUpCesium", selectedCesiumEntityData);
  const viewer = ctx.viewerRef.current;
  if (viewer && !viewer.isDestroyed() && !viewer.scene.isDestroyed()) {
    if (selectedCesiumEntityData) {
      removeCesiumMarker(ctx, selectedCesiumEntityData);
      setSelectedCesiumEntityData(null);
    }
    viewer.entities.removeById(SELECTED_POLYGON_ID);
    removeGroundPrimitiveById(viewer.scene, INVERTED_SELECTED_POLYGON_ID);
    ctx.requestRender();
  }
};

export const useSelectionCesium = (
  isActive: boolean,
  cesiumOptions: CesiumOptions,
  useCameraHeight: boolean = false,
  duration: number = 3,
  durationFactor: number = 0.2
) => {
  const ctx = useCesiumContext();
  const { viewerRef } = ctx;

  const { selection } = useSelection();
  const shouldFlyToRef = useRef<boolean>(false);
  const lastSelectionKey = useRef<number | null>(null);
  const lastSelectionTimestamp = useRef<number | null>(null);
  const [selectedCesiumEntityData, setSelectedCesiumEntityData] =
    useState<EntityData | null>(null);

  // Ref to store the previous selection

  useEffect(() => {
    if (!isActive || !viewerRef.current) {
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

      if (isNewSelection) {
        shouldFlyToRef.current = true;
      } else {
        shouldFlyToRef.current = false;
      }

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
        shouldFlyToRef,
        selectedCesiumEntityData,
        setSelectedCesiumEntityData,
        options
      );
    } else {
      lastSelectionKey.current = null;
      shouldFlyToRef.current = false;
      cleanUpCesium(ctx, selectedCesiumEntityData, setSelectedCesiumEntityData);
    }
  }, [
    selection,
    useCameraHeight,
    viewerRef,
    isActive,
    cesiumOptions,
    duration,
    durationFactor,
    setSelectedCesiumEntityData,
    selectedCesiumEntityData,
    ctx,
  ]);
};
