import { useOverlayHelper } from "@carma/libraries/commons/ui/lib-helper-overlay";

import { getCollabedHelpComponentConfig } from "@carma-collab/wuppertal/helper-overlay";

import { geoElements } from "@carma-collab/wuppertal/geoportal";
import { useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { getLayers } from "../../store/slices/mapping";
import { getInfoText, setInfoText } from "../../store/slices/features";
import { getAtLeastOneLayerIsQueryable } from "./utils";

export const useTourRefCollabLabels = () => {
  const zoom = useOverlayHelper(
    getCollabedHelpComponentConfig("ZOOM", geoElements),
  );
  const fullScreen = useOverlayHelper(
    getCollabedHelpComponentConfig("VOLLBILD", geoElements),
  );
  const navigator = useOverlayHelper(
    getCollabedHelpComponentConfig("MEINE_POSITION", geoElements),
  );
  const home = useOverlayHelper(
    getCollabedHelpComponentConfig("RATHAUS", geoElements),
  );
  const measurement = useOverlayHelper(
    getCollabedHelpComponentConfig("MESSUNGEN", geoElements),
  );
  const gazetteer = useOverlayHelper(
    getCollabedHelpComponentConfig("GAZETTEER_SUCHE", geoElements),
  );

  return useMemo(
    () => ({
      zoom,
      fullScreen,
      navigator,
      home,
      measurement,
      gazetteer,
    }),
    [zoom, fullScreen, navigator, home, measurement, gazetteer],
  );
};

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
