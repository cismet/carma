import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import Icon from "react-cismap/commons/Icon";
import bbox from "@turf/bbox";
import type { FeatureCollection } from "geojson";

import { faFloppyDisk, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { InteractionButton, Layer } from "@carma-mapping/layers";
import { useMapMeasurementsContext } from "@carma-commons/measurements";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import type { AnnotationModeText } from "@carma-mapping/annotations/builtin-tools/annotation-mode-text";
import { useMeasurements } from "@carma-mapping/measurements";
import { useFeatureFlags } from "@carma-providers/feature-flag";

import { geoportalAnnotationModeText } from "../config/geoportalTextConfig";
import {
  appendLayer,
  getActiveInteractionButtonID,
  getActiveInteractionLayerID,
  getLayers,
  getLibreMapRef,
  removeLayer,
  setActiveInteractionButtonID,
  setActiveInteractionLayerID,
  updateLayer,
} from "../store/slices/mapping";
import { getUIMode, setUIMode, UIMode } from "../store/slices/ui";

export const MEASUREMENT_LAYER_ID = "__measurement__";
export const MEASUREMENT_DRAW_TOOLS_INTERACTION_ID = "measurement-draw-tools";

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
  const activeInteractionLayerID = useSelector(getActiveInteractionLayerID);
  const activeInteractionButtonID = useSelector(getActiveInteractionButtonID);
  const flags = useFeatureFlags();
  const isLibreMap = Boolean(flags.featureFlagLibreMap);
  const { shapes, clearAllShapes, setShowAll } = useMapMeasurementsContext();
  const { isLeaflet } = useMapFrameworkSwitcherContext();
  // libreMap path: terra-draw measurements live in the new
  // @carma-mapping/measurements context, not the leaflet one. clearAll()
  // no-ops until a MeasurementHost mounts and registers its commands;
  // `features`/`count` reflect the live terra-draw snapshot.
  const {
    clearAll: clearLibreMeasurements,
    features: libreFeatures,
    count: libreCount,
  } = useMeasurements();
  const libreMapRef = useSelector(getLibreMapRef);

  // Single source of truth for the layer-row count: terra-draw snapshot in
  // the libreMap path, leaflet shapes otherwise.
  const measurementCount = isLibreMap ? libreCount : shapes.length;

  // Zoom-to-all for the libreMap path. The new measurements context has no
  // setShowAll equivalent (the leaflet provider owns its own map), so we
  // fit the base maplibre map to the terra-draw features' bbox ourselves.
  const showAllLibreMeasurements = () => {
    const map = libreMapRef?.current;
    if (!map || libreFeatures.length === 0) {
      return;
    }
    try {
      const [minX, minY, maxX, maxY] = bbox({
        type: "FeatureCollection",
        features: libreFeatures,
      } as FeatureCollection);
      map.fitBounds(
        [
          [minX, minY],
          [maxX, maxY],
        ],
        { padding: 50, maxZoom: 18 }
      );
    } catch (e) {
      console.warn("[MEASUREMENT] zoom-to-all (libre) failed", e);
    }
  };

  // In the libreMap path the draw-tools panel is opened by clicking the
  // measurement layer row itself (handled in GeoportalLayerButton). In the
  // leaflet path there is no panel — drawing is driven by leaflet-draw.
  const interactionButtons: InteractionButton[] = [
    {
      icon: <Icon name="search-location" />,
      id: "zoom-measurements",
      tooltip: annotationModeText.layerbar.leafletMeasurements.focusAll,
      onClick: () => {
        if (isLibreMap) {
          showAllLibreMeasurements();
        } else {
          setShowAll(true);
        }
      },
    },
    {
      icon: <FontAwesomeIcon icon={faTrashCan} />,
      id: "clear-measurements",
      tooltip: annotationModeText.layerbar.leafletMeasurements.deleteAll,
      onClick: () => {
        if (isLibreMap) {
          clearLibreMeasurements();
        } else {
          clearAllShapes();
        }
      },
    },
    {
      icon: <FontAwesomeIcon icon={faFloppyDisk} />,
      id: "save-measurements",
      tooltip: annotationModeText.layerbar.leafletMeasurements.save,
    },
  ];

  const measurementLayer: Layer = {
    id: MEASUREMENT_LAYER_ID,
    title: annotationModeText.layerTitle.empty,
    type: "object",
    icon: "measurement",
    visible: true,
    pinned: "last",
    skipSelection: true,
    interactionButtons,
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
          title: getMeasurementTitle(measurementCount, annotationModeText),
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
    measurementCount,
  ]);

  useEffect(() => {
    if (!shouldShowMeasurementLayer || !hasMeasurementLayer) return;
    dispatch(
      updateLayer({
        ...measurementLayer,
        title: getMeasurementTitle(measurementCount, annotationModeText),
      })
    );
  }, [
    annotationModeText,
    dispatch,
    hasMeasurementLayer,
    measurementCount,
    shouldShowMeasurementLayer,
  ]);

  // Auto-open the draw-tools panel when the measurement layer first appears in
  // the libreMap path so the user doesn't have to click the pen-ruler icon to
  // see the tools. Mirrors the 3D-measurement branch's handleEnterCesium-
  // AnnotationMode flow. We only flip when the panel isn't already targeting a
  // different layer, so we don't yank focus away if the user has another
  // interaction view open.
  useEffect(() => {
    if (!isLibreMap || !hasMeasurementLayer) {
      return;
    }
    if (
      activeInteractionLayerID === MEASUREMENT_LAYER_ID &&
      activeInteractionButtonID === MEASUREMENT_DRAW_TOOLS_INTERACTION_ID
    ) {
      return;
    }
    if (
      activeInteractionLayerID !== null &&
      activeInteractionLayerID !== MEASUREMENT_LAYER_ID
    ) {
      return;
    }
    dispatch(setActiveInteractionLayerID(MEASUREMENT_LAYER_ID));
    dispatch(
      setActiveInteractionButtonID(MEASUREMENT_DRAW_TOOLS_INTERACTION_ID)
    );
    // We deliberately depend only on hasMeasurementLayer + libreMap so we
    // re-open after layer re-add; clicking the pen-ruler closes the panel by
    // clearing activeInteractionButtonID and we don't want to fight that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, hasMeasurementLayer, isLibreMap]);

  // Close the panel when we leave measurement mode entirely.
  useEffect(() => {
    if (isMeasurementMode) {
      return;
    }
    if (activeInteractionLayerID === MEASUREMENT_LAYER_ID) {
      dispatch(setActiveInteractionLayerID(null));
      dispatch(setActiveInteractionButtonID(null));
    }
  }, [dispatch, isMeasurementMode, activeInteractionLayerID]);
}
