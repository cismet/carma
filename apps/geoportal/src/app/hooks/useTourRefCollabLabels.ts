import { useOverlayHelper } from "@carma/libraries/commons/ui/lib-helper-overlay";
import { getCollabedHelpComponentConfig } from "@carma-collab/wuppertal/helper-overlay";
import { geoElements } from "@carma-collab/wuppertal/geoportal";
import { useMemo } from "react";

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
