import { useMemo } from "react";

import { useOverlayHelper } from "@carma-commons/ui/lib-helper-overlay";
import { getCollabedHelpComponentConfig } from "@carma-collab/wuppertal/helper-overlay";
import { geoElements } from "@carma-collab/wuppertal/geoportal";

export const useTourRefCollabLabels = () => {
  const zoom = useOverlayHelper(
    getCollabedHelpComponentConfig("ZOOM", geoElements)
  );
  const fullScreen = useOverlayHelper(
    getCollabedHelpComponentConfig("VOLLBILD", geoElements)
  );
  const navigator = useOverlayHelper(
    getCollabedHelpComponentConfig("MEINE_POSITION", geoElements)
  );
  const home = useOverlayHelper(
    getCollabedHelpComponentConfig("RATHAUS", geoElements)
  );
  const measurement = useOverlayHelper(
    getCollabedHelpComponentConfig("MESSUNGEN", geoElements)
  );
  const gazetteer = useOverlayHelper(
    getCollabedHelpComponentConfig("GAZETTEER_SUCHE", geoElements)
  );
  const toggle2d3d = useOverlayHelper(
    getCollabedHelpComponentConfig("2D_3D_TOGGLE", geoElements)
  );
  const alignNorth = useOverlayHelper(
    getCollabedHelpComponentConfig("EINNORDEN", geoElements)
  );
  const featureInfo = useOverlayHelper(
    getCollabedHelpComponentConfig("SACHDATENABFRAGE", geoElements)
  );

  return useMemo(
    () => ({
      zoom,
      fullScreen,
      navigator,
      home,
      measurement,
      gazetteer,
      toggle2d3d,
      alignNorth,
      featureInfo,
    }),
    [
      zoom,
      fullScreen,
      navigator,
      home,
      measurement,
      gazetteer,
      toggle2d3d,
      alignNorth,
      featureInfo,
    ]
  );
};
