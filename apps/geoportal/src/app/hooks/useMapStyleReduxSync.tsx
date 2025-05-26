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
    console.debug("useMapStyleReduxSync - currentStyle:", currentStyle);
    console.debug("useMapStyleReduxSync - selectedMapLayer:", selectedMapLayer);
    console.debug("useMapStyleReduxSync - selectedLuftbildLayer:", selectedLuftbildLayer);
    
    if (currentStyle === MapStyleKeys.TOPO) {
      console.debug("useMapStyleReduxSync - setting to TOPO style");
      dispatch(
        setBackgroundLayer({
          ...selectedMapLayer,
          id: "karte",
          visible: true,
        })
      );
      dispatch(setCurrentSceneStyle("secondary"));
    } else if (currentStyle === MapStyleKeys.AERIAL) {
      console.debug("useMapStyleReduxSync - setting to AERIAL style");
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
