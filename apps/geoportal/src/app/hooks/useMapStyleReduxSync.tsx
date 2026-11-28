import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  setBackgroundLayer,
  getSelectedByCategory,
  getBackgroundLayer,
} from "../store/slices/mapping";

import { useMapStyle } from "./useGeoportalMapStyle";

/**
 * Custom hook to determine map layers from map styles and and layer selection
 * It updates the background layer based on
 * - the current mapStyle from the MapStyleProvider (the category id)
 * - the base map selected for that category in the Redux store.
 */

export const useMapStyleReduxSync = () => {
  const dispatch = useDispatch();
  const { currentStyle } = useMapStyle();

  const selectedByCategory = useSelector(getSelectedByCategory);
  const backgroundLayer = useSelector(getBackgroundLayer);

  const selected = selectedByCategory[currentStyle];

  useEffect(() => {
    if (!selected) {
      return;
    }
    dispatch(
      setBackgroundLayer({
        ...selected,
        id: currentStyle,
        visible: backgroundLayer.visible,
        opacity: backgroundLayer.opacity,
      })
    );
  }, [
    currentStyle,
    selected,
    backgroundLayer.visible,
    backgroundLayer.opacity,
    dispatch,
  ]);
};
