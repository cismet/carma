import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setCurrentSceneStyle } from "@carma-mapping/cesium-engine";

import { useMapStyle } from "./useGeoportalMapStyle";
import { MapStyleKeys } from "../constants/MapStyleKeys";
import {
  setBackgroundLayer,
  getSelectedMapLayer,
  getSelectedLuftbildLayer,
} from "../store/slices/mapping";
import type { RootState } from "../store";

/**
 * Custom hook to determine map layers from map styles and and layer selection
 * It updates the background layer and current scene style based on
 * - the current mapStyle from the MapStyleProvider
 * - the selected layer for each mapStyle from the Redux store.
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

  useEffect(() => {
    if (currentStyle === MapStyleKeys.TOPO) {
      dispatch(
        setBackgroundLayer({
          ...selectedMapLayer,
          id: "karte",
          visible: true,
        })
      );
      dispatch(setCurrentSceneStyle("secondary"));
    } else if (currentStyle === MapStyleKeys.AERIAL) {
      dispatch(
        setBackgroundLayer({
          ...selectedLuftbildLayer,
          id: "luftbild",
          visible: true,
        })
      );
      dispatch(setCurrentSceneStyle("primary"));
    }
  }, [currentStyle, selectedMapLayer, selectedLuftbildLayer, dispatch]);
};
