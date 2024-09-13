import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { getLayers } from "../store/slices/mapping";
import { getInfoText, setInfoText } from "../store/slices/features";
import { getAtLeastOneLayerIsQueryable } from "../components/GeoportalMap/utils";

export const useDispatchSachdatenInfoText = () => {
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);
  const infoText = useSelector(getInfoText);

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
      getAtLeastOneLayerIsQueryable(layers) &&
      (infoText ===
        "Die Sachdatenabfrage ist für die ausgewählten Layer nicht verfügbar." ||
        infoText ===
          "Die Sachdatenabfrage wurde für alle ausgewählten Layer deaktiviert.")
    ) {
      dispatch(setInfoText(""));
    }
  }, [layers, infoText, dispatch]);
};
