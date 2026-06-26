import { useMemo } from "react";

import {
  SelectionMetaData,
  useSelection,
  useSelectionCesium,
  useSelectionTopicMap,
} from "@carma-appframeworks/portals";
import { ENDPOINT, isAreaTypeWithGEP } from "@carma-commons/resources";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import {
  type CesiumOptions,
  useCesiumContext,
} from "@carma-mapping/engines/cesium/react/runtime";
import { type SearchResultItem } from "@carma-mapping/fuzzy-search";

import { CESIUM_CONFIG } from "../config/cesium/cesium.config";

/**
 * Gazetteer/selection wiring: drive the topic-map + Cesium selection adapters
 * and expose the gazetteer onSelection handler for the search control.
 */
export const useFloodingSelection = () => {
  const ctx = useCesiumContext();
  const { getIsCesium } = useMapFrameworkSwitcherContext();
  const { setSelection } = useSelection();

  const models = ctx.models;
  const markerAsset = models![CESIUM_CONFIG.markerKey!];
  const markerAnchorHeight = CESIUM_CONFIG.markerAnchorHeight ?? 10;

  const onGazetteerSelection = (selection: SearchResultItem | null) => {
    if (!selection) {
      setSelection(null);
      return;
    }
    const selectionMetaData: SelectionMetaData = {
      selectedFrom: "gazetteer",
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaTypeWithGEP(selection.type as ENDPOINT),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));
  };

  useSelectionTopicMap();
  useSelectionCesium(
    getIsCesium,
    useMemo<CesiumOptions>(
      () => ({
        markerAsset,
        markerAnchorHeight,
        selectionClassification: "tileset",
        withTerrainProvider: (cb) => ctx.withTerrainProvider(cb),
        withSurfaceProvider: (cb) => ctx.withSurfaceProvider(cb),
      }),
      [markerAsset, markerAnchorHeight, ctx]
    )
  );

  return { onGazetteerSelection };
};
