import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import { faFloppyDisk } from "@fortawesome/free-solid-svg-icons";

import type { Layer } from "@carma-mapping/layers";
import { useMapMeasurementsContext } from "@carma-commons/measurements";

import {
  appendLayer,
  getLayers,
  removeLayer,
  updateLayer,
} from "../store/slices/mapping";
import { getUIMode, setUIMode, UIMode } from "../store/slices/ui";

export const MEASUREMENT_LAYER_ID = "__measurement__";

const MEASUREMENT_LAYER: Layer = {
  id: MEASUREMENT_LAYER_ID,
  title: "Messung",
  icon: "measurement",
  visible: true,
  pinned: "last",
  interactionButton: {
    icon: faFloppyDisk,
    id: "save-measurements",
  },
};

function getMeasurementTitle(count: number) {
  return count > 0 ? `${count} Messung${count > 1 ? "en" : ""}` : "Messung";
}

export function useMeasurementLayerButton() {
  const dispatch = useDispatch();
  const uiMode = useSelector(getUIMode);
  const layers = useSelector(getLayers);
  const { shapes } = useMapMeasurementsContext();

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
      dispatch(
        appendLayer({
          ...MEASUREMENT_LAYER,
          title: getMeasurementTitle(shapes.length),
        })
      );
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

  useEffect(() => {
    if (!hasMeasurementLayer) return;
    dispatch(
      updateLayer({
        ...MEASUREMENT_LAYER,
        title: getMeasurementTitle(shapes.length),
      })
    );
  }, [shapes.length, hasMeasurementLayer, dispatch]);
}
