import { useContext } from "react";

import { EnviroMetricMapContext } from "@cismet-dev/react-cismap-envirometrics-maps/EnviroMetricMapContextProvider";
import StyledWMSTileLayer from "react-cismap/StyledWMSTileLayer";

import config from "../config";
import { HGK_KEYS } from "../config/app.config";
import {
  useCesiumFeatureInfoClick,
  useFeatureInfoMarker3D,
  useFeatureInfoQueryHashSync,
  useForceAerialBackground,
  useRestoreFeatureInfoQuery,
} from "../hooks/feature-info";
import { useFloodingSceneStyleSync } from "../hooks/useFloodingSceneStyleSync";
import NotesDisplay from "./NotesDisplay";

/**
 * Context-reading child of EnviroMetricMap: wires flooding feature-info hooks and
 * renders the map overlays. Must be a descendant of <EnviroMetricMap>.
 */
export const StateAwareChildren = () => {
  const { controlState } = useContext<typeof EnviroMetricMapContext>(
    EnviroMetricMapContext
  );
  const isHWS = controlState.customInfoBoxToggleState;
  const conf = config.config;

  // Feature-info query: URL restoration, hash sync, 3D marker, click-to-query.
  useRestoreFeatureInfoQuery();
  useFeatureInfoQueryHashSync();
  const markerRefs = useFeatureInfoMarker3D();
  useCesiumFeatureInfoClick(markerRefs);

  // Scene presentation tied to the flooding state.
  useForceAerialBackground();
  useFloodingSceneStyleSync(controlState.selectedSimulation, isHWS, HGK_KEYS);

  return (
    <>
      {isHWS && controlState.selectedSimulation !== 2 && <NotesDisplay />}
      {!isHWS &&
        conf.simulations[controlState.selectedSimulation].gefaehrdungsLayer && (
          <StyledWMSTileLayer
            key={
              "rainHazardMap.depthLayer" +
              conf.simulations[controlState.selectedSimulation]
                .gefaehrdungsLayer +
              "." +
              controlState.selectedBackground
            }
            url={conf.modelWMS}
            layers={
              conf.simulations[controlState.selectedSimulation]
                .gefaehrdungsLayer
            }
            version="1.1.1"
            transparent="true"
            format="image/png"
            tiled={true}
            styles={
              conf.simulations[controlState.selectedSimulation].depthStyle
            }
            maxZoom={22}
            opacity={0.8}
          />
        )}
    </>
  );
};
