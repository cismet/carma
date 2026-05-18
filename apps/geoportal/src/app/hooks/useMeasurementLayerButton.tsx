import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import { faFloppyDisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { Layer } from "@carma-mapping/layers";
import { useMapMeasurementsContext } from "@carma-commons/measurements";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import type { AnnotationModeText } from "@carma-mapping/annotations/builtin-tools/annotation-mode-text";

import { geoportalAnnotationModeText } from "../config/geoportalTextConfig";
import {
  appendLayer,
  getLayers,
  removeLayer,
  updateLayer,
} from "../store/slices/mapping";
import { getUIMode, setUIMode, UIMode } from "../store/slices/ui";

export const MEASUREMENT_LAYER_ID = "__measurement__";

function getMeasurementTitle(
  count: number,
  annotationModeText: AnnotationModeText
) {
  return count > 0
    ? `${count} ${
        count > 1
          ? annotationModeText.layerTitle.plural
          : annotationModeText.layerTitle.singular
      }`
    : annotationModeText.layerTitle.empty;
}

export function useMeasurementLayerButton() {
  const dispatch = useDispatch();
  const annotationModeText = geoportalAnnotationModeText;
  const uiMode = useSelector(getUIMode);
  const layers = useSelector(getLayers);
  const { shapes } = useMapMeasurementsContext();
  const { isLeaflet } = useMapFrameworkSwitcherContext();

  const measurementLayer: Layer = {
    id: MEASUREMENT_LAYER_ID,
    title: annotationModeText.layerTitle.empty,
    type: "object",
    icon: "measurement",
    visible: true,
    pinned: "last",
    skipSelection: true,
    interactionButtons: {
      icon: <FontAwesomeIcon icon={faFloppyDisk} />,
      id: "save-measurements",
      tooltip: annotationModeText.layerbar.leafletMeasurements.save,
    },
  };

  const isMeasurementMode = uiMode === UIMode.MEASUREMENT;
  const shouldShowMeasurementLayer = isLeaflet && isMeasurementMode;
  const hasMeasurementLayer = layers.some((l) => l.id === MEASUREMENT_LAYER_ID);

  // Track previous values to detect what changed
  const prevRef = useRef({ shouldShowMeasurementLayer, hasMeasurementLayer });
  const initialCleanupDone = useRef(false);

  // Clean up stale measurement layers persisted from a previous session
  useEffect(() => {
    if (initialCleanupDone.current) return;
    initialCleanupDone.current = true;

    if (!shouldShowMeasurementLayer && hasMeasurementLayer) {
      dispatch(removeLayer(MEASUREMENT_LAYER_ID));
    }
  }, []);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { shouldShowMeasurementLayer, hasMeasurementLayer };

    // Mode just turned ON and layer doesn't exist yet: add it
    if (
      shouldShowMeasurementLayer &&
      !prev.shouldShowMeasurementLayer &&
      !hasMeasurementLayer
    ) {
      dispatch(
        appendLayer({
          ...measurementLayer,
          title: getMeasurementTitle(shapes.length, annotationModeText),
        })
      );
      return;
    }

    // Mode just turned OFF and layer still exists: remove it
    if (
      !shouldShowMeasurementLayer &&
      prev.shouldShowMeasurementLayer &&
      hasMeasurementLayer
    ) {
      dispatch(removeLayer(MEASUREMENT_LAYER_ID));
      return;
    }

    // Layer was removed (by the user via X button) while mode is still active: deactivate mode
    if (
      shouldShowMeasurementLayer &&
      !hasMeasurementLayer &&
      prev.hasMeasurementLayer
    ) {
      dispatch(setUIMode(UIMode.DEFAULT));
    }
  }, [
    annotationModeText,
    dispatch,
    hasMeasurementLayer,
    shouldShowMeasurementLayer,
    shapes.length,
  ]);

  useEffect(() => {
    if (!shouldShowMeasurementLayer || !hasMeasurementLayer) return;
    dispatch(
      updateLayer({
        ...measurementLayer,
        title: getMeasurementTitle(shapes.length, annotationModeText),
      })
    );
  }, [
    annotationModeText,
    dispatch,
    hasMeasurementLayer,
    shapes.length,
    shouldShowMeasurementLayer,
  ]);
}
