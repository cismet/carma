import { LayerMap } from "@carma-apps/portals";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
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

  useEffect(() => {
    const backgroundLayerId = backgroundLayer.id;
    const selectedMapLayerId = selectedMapLayer.id;

    const getId = () => {
      return backgroundLayerId === "luftbild"
        ? backgroundLayerId
        : selectedMapLayerId;
    };
    dispatch(
      setBackgroundLayer({
        title: layerMap[getId()].title,
        id: backgroundLayerId,
        opacity: backgroundLayer.opacity,
        description: layerMap[getId()].description,
        inhalt: layerMap[getId()].inhalt,
        eignung: layerMap[getId()].eignung,
        visible: backgroundLayer.visible,
        layerType: "wmts",
        props: {
          name: "",
          url: layerMap[getId()].url,
        },
        layers: layerMap[getId()].layers,
      })
    );

    dispatch(
      setSelectedMapLayer({
        title: layerMap[selectedMapLayerId].title,
        id: selectedMapLayerId,
        opacity: 1.0,
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
  }, [dispatch, layerMap]);
};
