import { useContext, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { getMappingLayers } from "../store/slices/mapping";
import { setInfoText, getFeaturesInfoText } from "../store/slices/features";
import { getAtLeastOneLayerIsQueryable } from "../components/GeoportalMap/utils";

export const useDispatchSachdatenInfoText = () => {
  const dispatch = useDispatch();
  const layers = useSelector(getMappingLayers);
  const infoText = useSelector(getFeaturesInfoText);
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);

  const leaflelEl = routedMapRef?.leafletMap?.leafletElement;
  const zoom = leaflelEl?.getZoom();

  useEffect(() => {
    if (
      !layers.some((layer) => layer.queryable === true) &&
      layers.length > 0
    ) {
      dispatch(
        setInfoText(
          "Die Sachdatenabfrage ist für die ausgewählten Layer nicht verfügbar.",
        ),
      );
    } else if (
      !layers.some((layer) => layer.useInFeatureInfo === true) &&
      layers.length > 0
    ) {
      dispatch(
        setInfoText(
          "Die Sachdatenabfrage wurde für alle ausgewählten Layer deaktiviert.",
        ),
      );
    } else if (
      getAtLeastOneLayerIsQueryable(layers, zoom) &&
      (infoText ===
        "Die Sachdatenabfrage ist für die ausgewählten Layer nicht verfügbar." ||
        infoText ===
          "Die Sachdatenabfrage wurde für alle ausgewählten Layer deaktiviert.")
    ) {
      dispatch(setInfoText(""));
    }
  }, [layers, infoText, zoom, dispatch]);
};
