import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useCesiumContext } from "@carma-mapping/engines/cesium/react/runtime";

import { geoportalCesiumSceneStyleByMapStyle } from "../config/mapStyleConfig";
import { MapStyleKeys } from "../constants/MapStyleKeys";
import {
  setBackgroundLayer,
  getSelectedMapLayer,
  getSelectedLuftbildLayer,
  getBackgroundLayer,
} from "../store/slices/mapping";
import type { RootState } from "../store";

import { useMapStyle } from "./useGeoportalMapStyle";

/**
 * Custom hook to determine map layers from map styles and and layer selection
 * It updates the background layer and current scene style based on
 * - the current mapStyle from the MapStyleProvider
 * - the selected layer for each mapStyle from the Redux store.
 */

export const useMapStyleReduxSync = () => {
  const dispatch = useDispatch();
  const { setCurrentSceneStyle } = useCesiumContext();
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
      setCurrentSceneStyle(geoportalCesiumSceneStyleByMapStyle[currentStyle]);
    } else if (currentStyle === MapStyleKeys.AERIAL) {
      dispatch(
        setBackgroundLayer({
          ...selectedLuftbildLayer,
          id: MapStyleKeys.AERIAL,
          visible: backgroundLayer.visible,
          opacity: backgroundLayer.opacity,
        })
      );
      setCurrentSceneStyle(geoportalCesiumSceneStyleByMapStyle[currentStyle]);
    }
  }, [
    currentStyle,
    selectedMapLayer,
    selectedLuftbildLayer,
    backgroundLayer.visible,
    backgroundLayer.opacity,
    dispatch,
    setCurrentSceneStyle,
  ]);
};
