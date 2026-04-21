import { useMemo } from "react";

import {
  readLeafletHomeViewState,
  readViewStateHashNumber,
  useInitialCesiumCameraView,
} from "@carma-mapping/engines-interop/view-state";
import { useHashState } from "@carma-providers/hash-state";
import { Cartesian3 } from "@carma-cesium";

import config from "../config";
import { FLOODINGMAP_HASH_KEYS } from "../config/hash-state.config";
import { DEFAULT_HOME_VIEW_REF } from "../config/view.config";
const DEFAULT_HOME_VIEW_STATE = readLeafletHomeViewState(
  DEFAULT_HOME_VIEW_REF,
  {
    sourceId: "floodingmap/default-home",
  }
);

const readRestoredQueryPosition = (
  queryX: number | undefined,
  queryY: number | undefined
): [number, number] | undefined =>
  Number.isFinite(queryX) && Number.isFinite(queryY)
    ? [queryX, queryY]
    : undefined;

export const useFloodingmapInitialValues = () => {
  const { getHashValues } = useHashState();
  const { initialCameraView, isInitialCameraResolved } =
    useInitialCesiumCameraView(DEFAULT_HOME_VIEW_STATE);

  const initialHashValues = getHashValues();
  const initialQueryX = readViewStateHashNumber(
    initialHashValues[FLOODINGMAP_HASH_KEYS.QUERY_X]
  );
  const initialQueryY = readViewStateHashNumber(
    initialHashValues[FLOODINGMAP_HASH_KEYS.QUERY_Y]
  );
  const restoredQueryPosition = readRestoredQueryPosition(
    initialQueryX,
    initialQueryY
  );

  const initialEnviroMetricState = useMemo(
    () => ({
      ...config.initialState,
      featureInfoModeActivated: Boolean(restoredQueryPosition),
      currentFeatureInfoPosition: restoredQueryPosition,
    }),
    [restoredQueryPosition]
  );

  const homeCenter = useMemo(
    () =>
      [DEFAULT_HOME_VIEW_REF.lat, DEFAULT_HOME_VIEW_REF.lng] as [
        number,
        number
      ],
    []
  );

  const homeLeafletZoom = DEFAULT_HOME_VIEW_REF.zoom ?? 18;

  const homeValidationCenter = useMemo(
    () =>
      Cartesian3.fromDegrees(
        DEFAULT_HOME_VIEW_REF.lng,
        DEFAULT_HOME_VIEW_REF.lat,
        DEFAULT_HOME_VIEW_REF.altitude
      ),
    []
  );

  return {
    defaultHomeViewState: DEFAULT_HOME_VIEW_STATE,
    homeCenter,
    homeLeafletZoom,
    homeValidationCenter,
    initialCameraView,
    initialEnviroMetricState,
    isInitialCameraResolved,
  };
};
