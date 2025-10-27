import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import { LayerMap, MapStyleKeys } from "@carma-appframeworks/portals";

import {
  getBackgroundLayer,
  getSelectedMapLayer,
  setBackgroundLayer,
  setSelectedMapLayer,
} from "../store/slices/mapping";

export const useManageLayers = (layerMap: LayerMap) => {
  const dispatch = useDispatch();
  const backgroundLayer = useSelector(getBackgroundLayer);
  const selectedMapLayer = useSelector(getSelectedMapLayer);

  // Track processed layer IDs to prevent infinite loops
  const processedBackgroundLayerId = useRef<string | null>(null);
  const processedSelectedMapLayerId = useRef<string | null>(null);

  useEffect(() => {
    const backgroundLayerId = backgroundLayer.id;
    const selectedMapLayerId = selectedMapLayer.id;

    // Only process if we haven't processed these layer IDs before
    const shouldProcessBackground =
      processedBackgroundLayerId.current !== backgroundLayerId;
    const shouldProcessSelected =
      processedSelectedMapLayerId.current !== selectedMapLayerId;

    if (shouldProcessBackground) {
      const getId = () => {
        return backgroundLayerId === MapStyleKeys.AERIAL
          ? backgroundLayerId
          : selectedMapLayerId;
      };

      dispatch(
        setBackgroundLayer({
          ...backgroundLayer,
          title: layerMap[getId()].title,
          id: backgroundLayerId,
          opacity: backgroundLayer.opacity,
          description: layerMap[getId()].description,
          inhalt: layerMap[getId()].inhalt,
          eignung: layerMap[getId()].eignung,
          layerType: "wmts",
          props: {
            name: "",
            url: layerMap[getId()].url,
          },
          layers: layerMap[getId()].layers,
        })
      );

      processedBackgroundLayerId.current = backgroundLayerId;
    }

    if (shouldProcessSelected) {
      dispatch(
        setSelectedMapLayer({
          title: layerMap[selectedMapLayerId].title,
          id: selectedMapLayerId,
          opacity: selectedMapLayer.opacity,
          description: ``,
          inhalt: layerMap[selectedMapLayerId].inhalt,
          eignung: layerMap[selectedMapLayerId].eignung,
          visible: selectedMapLayer.visible,
          layerType: "wmts",
          props: {
            name: "",
            url: layerMap[selectedMapLayerId].url,
          },
          layers: layerMap[selectedMapLayerId].layers,
        })
      );

      processedSelectedMapLayerId.current = selectedMapLayerId;
    }
  }, [dispatch, layerMap, backgroundLayer, selectedMapLayer]);
};
