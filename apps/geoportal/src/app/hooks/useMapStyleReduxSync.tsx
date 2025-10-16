import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

import { MapStyleKeys } from "@carma-appframeworks/portals";

import { useMapStyle } from "./useGeoportalMapStyle";
import {
  setBackgroundLayer,
  getSelectedMapLayer,
  getSelectedLuftbildLayer,
  getBackgroundLayer,
} from "../store/slices/mapping";
import type { RootState } from "../store";

/**
 * Custom hook to synchronize map style changes with Redux background layer state.
 * When map style changes, it updates the corresponding Redux background layer
 * based on the selected layer for each map style.
 *
 * Note: Cesium scene style synchronization is handled by useSyncCesiumSceneStyle hook
 * via the event bus to avoid coupling Redux state with external APIs.
 */
export const useMapStyleReduxSync = () => {
  const dispatch = useDispatch();
  const { currentStyle } = useMapStyle();

  const selectedMapLayer = useSelector((state: RootState) =>
    getSelectedMapLayer(state)
  );
  const selectedLuftbildLayer = useSelector((state: RootState) =>
    getSelectedLuftbildLayer(state)
  );

  const backgroundLayer = useSelector((state: RootState) =>
    getBackgroundLayer(state)
  );

  useEffect(() => {
    if (currentStyle === MapStyleKeys.TOPO) {
      dispatch(
        setBackgroundLayer({
          ...selectedMapLayer,
          id: MapStyleKeys.TOPO,
          visible: backgroundLayer.visible,
          opacity: backgroundLayer.opacity,
        })
      );
    } else if (currentStyle === MapStyleKeys.AERIAL) {
      dispatch(
        setBackgroundLayer({
          ...selectedLuftbildLayer,
          id: MapStyleKeys.AERIAL,
          visible: backgroundLayer.visible,
          opacity: backgroundLayer.opacity,
        })
      );
    }
  }, [
    currentStyle,
    selectedMapLayer,
    selectedLuftbildLayer,
    backgroundLayer.visible,
    backgroundLayer.opacity,
    dispatch,
  ]);
};
