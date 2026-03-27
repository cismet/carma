import { useCallback } from "react";
import type { Map as LeafletMap } from "leaflet";

import { useSelection } from "@carma-appframeworks/portals";
import type { Scene } from "@carma-mapping/engines/cesium/api";
import { flyViewStateInCesium } from "@carma-mapping/engines-interop/view-state";
import type { SearchResultItem } from "@carma/types";

import { DEFAULT_HOME_VIEW_REF } from "../config/view.config";
import { buildFloodingmapGazetteerSelection } from "../utils/floodingmapSelection";
import { DEFAULT_HOME_VIEW_STATE } from "../utils/floodingmapHomeViewState";

const DEFAULT_HOME_CENTER = [
  DEFAULT_HOME_VIEW_REF.lat,
  DEFAULT_HOME_VIEW_REF.lng,
] as [number, number];
const DEFAULT_HOME_LEAFLET_ZOOM = DEFAULT_HOME_VIEW_REF.zoom ?? 18;

const DEFAULT_CESIUM_HOME_DURATION_S = 2;

type UseFloodingmapInteractionsOptions = {
  cesiumScene: Scene | null;
  leafletMap: LeafletMap | null;
  isCesiumActive?: boolean;
};

export const useFloodingmapInteractions = (
  options: UseFloodingmapInteractionsOptions
) => {
  const { cesiumScene, leafletMap, isCesiumActive = false } = options;
  const { setSelection } = useSelection();

  const onGazetteerSelection = useCallback(
    (selection: SearchResultItem | null) => {
      if (!selection) {
        setSelection(null);
        return;
      }

      setSelection(buildFloodingmapGazetteerSelection(selection, Date.now()));
    },
    [setSelection]
  );

  const onHomeClick = useCallback(() => {
    if (isCesiumActive && cesiumScene) {
      flyViewStateInCesium(cesiumScene, DEFAULT_HOME_VIEW_STATE, {
        duration: DEFAULT_CESIUM_HOME_DURATION_S,
        applyFov: false,
      });
    }

    if (leafletMap) {
      leafletMap.flyTo(DEFAULT_HOME_CENTER, DEFAULT_HOME_LEAFLET_ZOOM);
    }
  }, [cesiumScene, isCesiumActive, leafletMap]);

  return {
    homeCenter: DEFAULT_HOME_CENTER,
    onGazetteerSelection,
    onHomeClick,
  };
};
