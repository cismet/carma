import { useContext, useEffect, useRef } from "react";

import {
  EnviroMetricMapContext,
  EnviroMetricMapDispatchContext,
} from "@cismet-dev/react-cismap-envirometrics-maps/EnviroMetricMapContextProvider";

import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

import { AERIAL_BACKGROUND_INDEX } from "../../config/app.config";

/** Forces the aerial background in 3D and restores the remembered 2D background on return to Leaflet. Keyed only on framework mode so it never clobbers a background picked in 2D. */
export const useForceAerialBackground = () => {
  const { controlState } = useContext<typeof EnviroMetricMapContext>(
    EnviroMetricMapContext
  );
  const { setBackgroundIndex } = useContext<
    typeof EnviroMetricMapDispatchContext
  >(EnviroMetricMapDispatchContext);
  const { isLeaflet } = useMapFrameworkSwitcherContext();

  const selectedBackground2dRef = useRef<number>(
    controlState.selectedBackground
  );

  useEffect(() => {
    if (isLeaflet) {
      setBackgroundIndex(selectedBackground2dRef.current);
    } else {
      selectedBackground2dRef.current = controlState.selectedBackground;
      setBackgroundIndex(AERIAL_BACKGROUND_INDEX);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLeaflet]); // intentionally only trigger on mode change
};
