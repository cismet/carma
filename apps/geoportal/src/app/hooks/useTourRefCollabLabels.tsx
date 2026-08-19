import { useMemo } from "react";

import {
  useOverlayHelper,
  type OptionsOverlayHelper,
} from "@carma-commons/ui/helper-overlay";
import { useHomeViewOverride } from "@carma-mapping/engines-interop/view-state";
import { getCollabedHelpComponentConfig } from "@carma-collab/wuppertal/helper-overlay";
import {
  geoElements,
  HomeLabel,
  HomeText,
} from "@carma-collab/wuppertal/geoportal";

/** overlay label for a moved home button that brought no wording of its own */
const DEFAULT_HOME_OVERRIDE_LABEL = "Zur Startposition";

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
  // the collab element is written for the default home ("Zum Rathaus Barmen"),
  // so a route that moved the home button feeds its own wording into the
  // collab components' props. The long secondary text stays only when the
  // override brings a destination phrase for it, otherwise it would still
  // talk about the Rathaus.
  const homeOverride = useHomeViewOverride();
  const homeConfig = useMemo((): OptionsOverlayHelper | undefined => {
    const collabConfig = getCollabedHelpComponentConfig("RATHAUS", geoElements);
    if (!homeOverride || !collabConfig) {
      return collabConfig;
    }
    const label =
      homeOverride.overlayLabel ??
      homeOverride.tooltip ??
      DEFAULT_HOME_OVERRIDE_LABEL;
    const destination = homeOverride.overlayDestination;
    return {
      primary: {
        ...collabConfig.primary,
        content: <HomeLabel label={label} />,
        contentKey: destination ? `${label}|${destination}` : label,
        // the collab width is measured for the collab wording; the label box
        // is positioned inside the button-sized highlight, so an auto width
        // would wrap at the button's edge
        contentWidth: "max-content",
      },
      ...(destination && collabConfig.secondary
        ? {
            secondary: {
              ...collabConfig.secondary,
              content: <HomeText destination={destination} />,
            },
          }
        : {}),
    };
  }, [homeOverride]);
  const home = useOverlayHelper(homeConfig);
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
