import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

import { getInfoText, setInfoText } from "../store/slices/features";
import { getLayers } from "../store/slices/mapping";
import { getLeafletElement } from "../store/slices/topicmap";

import { getAtLeastOneLayerIsQueryable } from "../components/GeoportalMap/utils";

// Define message constants outside the hook
const NO_QUERYABLE_LAYERS_MSG =
  "Die Sachdatenabfrage ist für die ausgewählten Layer nicht verfügbar.";
const FEATURE_INFO_DISABLED_MSG =
  "Die Sachdatenabfrage wurde für alle ausgewählten Layer deaktiviert.";

export const useDispatchSachdatenInfoText = () => {
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);
  const infoText = useSelector(getInfoText);
  const leafletElement = useSelector(getLeafletElement);

  useEffect(() => {
    if (!leafletElement) return;

    const zoom = leafletElement.getZoom();
    if (
      !layers.some((layer) => layer.queryable === true) &&
      layers.length > 0
    ) {
      dispatch(setInfoText(NO_QUERYABLE_LAYERS_MSG));
    } else if (
      !layers.some((layer) => layer.useInFeatureInfo === true) &&
      layers.length > 0
    ) {
      dispatch(setInfoText(FEATURE_INFO_DISABLED_MSG));
    } else if (
      getAtLeastOneLayerIsQueryable(layers, zoom) &&
      (infoText === NO_QUERYABLE_LAYERS_MSG ||
        infoText === FEATURE_INFO_DISABLED_MSG)
    ) {
      dispatch(setInfoText(""));
    }
  }, [layers, infoText, leafletElement, dispatch]);
};
