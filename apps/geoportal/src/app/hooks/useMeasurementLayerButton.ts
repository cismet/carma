import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import type { Layer } from "@carma-mapping/layers";

import { appendLayer, getLayers, removeLayer } from "../store/slices/mapping";
import { getUIMode, setUIMode, UIMode } from "../store/slices/ui";

export const MEASUREMENT_LAYER_ID = "__measurement__";

const MEASUREMENT_LAYER: Layer = {
  id: MEASUREMENT_LAYER_ID,
  title: "Messung",
  opacity: 1,
  visible: true,
  description: "",
  queryable: false,
  useInFeatureInfo: false,
};

export function useMeasurementLayerButton() {
  const dispatch = useDispatch();
  const uiMode = useSelector(getUIMode);
  const layers = useSelector(getLayers);

  const isMeasurementMode = uiMode === UIMode.MEASUREMENT;
  const hasMeasurementLayer = layers.some((l) => l.id === MEASUREMENT_LAYER_ID);

  // Track previous values to detect what changed
  const prevRef = useRef({ isMeasurementMode, hasMeasurementLayer });
  const initialCleanupDone = useRef(false);

  // Clean up stale measurement layers persisted from a previous session
  useEffect(() => {
    if (initialCleanupDone.current) return;
    initialCleanupDone.current = true;

    if (!isMeasurementMode && hasMeasurementLayer) {
      dispatch(removeLayer(MEASUREMENT_LAYER_ID));
    }
  }, []);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { isMeasurementMode, hasMeasurementLayer };

    // Mode just turned ON and layer doesn't exist yet: add it
    if (isMeasurementMode && !prev.isMeasurementMode && !hasMeasurementLayer) {
      dispatch(appendLayer(MEASUREMENT_LAYER));
      return;
    }

    // Mode just turned OFF and layer still exists: remove it
    if (!isMeasurementMode && prev.isMeasurementMode && hasMeasurementLayer) {
      dispatch(removeLayer(MEASUREMENT_LAYER_ID));
      return;
    }

    // Layer was removed (by the user via X button) while mode is still active: deactivate mode
    if (isMeasurementMode && !hasMeasurementLayer && prev.hasMeasurementLayer) {
      dispatch(setUIMode(UIMode.DEFAULT));
    }
  }, [isMeasurementMode, hasMeasurementLayer, dispatch]);
}
