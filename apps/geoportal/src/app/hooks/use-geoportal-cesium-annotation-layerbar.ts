import { createElement, useCallback, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import { faRuler } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ANNOTATION_SELECT_TOOL_ID } from "@carma-mapping/annotations/core";
import { useAnnotationsRuntime } from "@carma-mapping/annotations/runtime";
import type { AnnotationModeText } from "@carma-mapping/annotations/builtin-tools/annotation-mode-text";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import type { Layer } from "@carma-mapping/layers";

import { geoportalAnnotationModeText } from "../config/geoportalTextConfig";
import {
  appendLayer,
  setActiveInteractionButtonID,
  setActiveInteractionLayerID,
  getLayers,
  removeLayer,
  updateLayer,
} from "../store/slices/mapping";
import { getUIMode, setUIMode, UIMode } from "../store/slices/ui";
import {
  CESIUM_ANNOTATION_INTERACTION_ID,
  CESIUM_ANNOTATION_LAYER_ID,
} from "../components/annotations/cesium-annotations.constants";
import { useModeLifecycleActions } from "./use-mode-lifecycle-actions";
import { CESIUM_ANNOTATION_CONFIG } from "../config/app.config";

const createCesiumAnnotationLayer = (
  annotationModeText: AnnotationModeText
): Layer => ({
  id: CESIUM_ANNOTATION_LAYER_ID,
  title: annotationModeText.layerTitle.empty,
  type: "object",
  icon: "measurement",
  visible: true,
  pinned: "last",
  interactionButtons: {
    icon: createElement(FontAwesomeIcon, { icon: faRuler }),
    id: CESIUM_ANNOTATION_INTERACTION_ID,
  },
});

const getCesiumAnnotationLayerTitle = (
  count: number,
  annotationModeText: AnnotationModeText
) =>
  count > 0
    ? `${count} ${
        count > 1
          ? annotationModeText.layerTitle.plural
          : annotationModeText.layerTitle.singular
      }`
    : annotationModeText.layerTitle.empty;

export function useGeoportalCesiumAnnotationLayerbar() {
  const dispatch = useDispatch();
  const annotationModeText = geoportalAnnotationModeText;
  const layers = useSelector(getLayers);
  const uiMode = useSelector(getUIMode);
  const { isCesium } = useMapFrameworkSwitcherContext();
  const {
    activeToolType,
    annotationEntries,
    registry,
    setActiveToolType,
    setSelectedAnnotationId,
  } = useAnnotationsRuntime();

  const shouldShowCesiumAnnotationLayer =
    isCesium && uiMode === UIMode.MEASUREMENT;
  const hasCesiumAnnotationLayer = layers.some(
    (layer) => layer.id === CESIUM_ANNOTATION_LAYER_ID
  );
  const hadActiveCesiumAnnotationLayerRef = useRef(
    shouldShowCesiumAnnotationLayer && hasCesiumAnnotationLayer
  );
  const initialCleanupDone = useRef(false);

  const handleEnterCesiumAnnotationMode = useCallback(() => {
    if (!hasCesiumAnnotationLayer) {
      dispatch(
        appendLayer({
          ...createCesiumAnnotationLayer(annotationModeText),
          title: getCesiumAnnotationLayerTitle(
            annotationEntries.length,
            annotationModeText
          ),
        })
      );
    }

    dispatch(setActiveInteractionLayerID(CESIUM_ANNOTATION_LAYER_ID));
    dispatch(setActiveInteractionButtonID(CESIUM_ANNOTATION_INTERACTION_ID));
  }, [
    annotationEntries.length,
    annotationModeText,
    dispatch,
    hasCesiumAnnotationLayer,
  ]);

  const handleLeaveCesiumAnnotationMode = useCallback(() => {
    if (!hasCesiumAnnotationLayer) {
      return;
    }

    setSelectedAnnotationId(null);
    dispatch(removeLayer(CESIUM_ANNOTATION_LAYER_ID));
  }, [dispatch, hasCesiumAnnotationLayer, setSelectedAnnotationId]);

  useModeLifecycleActions({
    active: shouldShowCesiumAnnotationLayer,
    onEnter: [handleEnterCesiumAnnotationMode],
    onLeave: [handleLeaveCesiumAnnotationMode],
  });

  useEffect(() => {
    if (!initialCleanupDone.current) {
      initialCleanupDone.current = true;

      if (!shouldShowCesiumAnnotationLayer && hasCesiumAnnotationLayer) {
        hadActiveCesiumAnnotationLayerRef.current = false;
        dispatch(removeLayer(CESIUM_ANNOTATION_LAYER_ID));
        return;
      }
    }

    const hadActiveCesiumAnnotationLayer =
      hadActiveCesiumAnnotationLayerRef.current;
    hadActiveCesiumAnnotationLayerRef.current =
      shouldShowCesiumAnnotationLayer && hasCesiumAnnotationLayer;

    if (
      shouldShowCesiumAnnotationLayer &&
      !hasCesiumAnnotationLayer &&
      hadActiveCesiumAnnotationLayer
    ) {
      setSelectedAnnotationId(null);
      dispatch(setUIMode(UIMode.DEFAULT));
    }
  }, [
    dispatch,
    hasCesiumAnnotationLayer,
    setSelectedAnnotationId,
    shouldShowCesiumAnnotationLayer,
  ]);

  useEffect(() => {
    if (!shouldShowCesiumAnnotationLayer || !hasCesiumAnnotationLayer) {
      return;
    }

    dispatch(
      updateLayer({
        ...createCesiumAnnotationLayer(annotationModeText),
        title: getCesiumAnnotationLayerTitle(
          annotationEntries.length,
          annotationModeText
        ),
      })
    );
  }, [
    annotationEntries.length,
    annotationModeText,
    dispatch,
    hasCesiumAnnotationLayer,
    shouldShowCesiumAnnotationLayer,
  ]);

  useEffect(() => {
    const defaultToolId = CESIUM_ANNOTATION_CONFIG.tools.defaultToolId;
    if (
      !shouldShowCesiumAnnotationLayer ||
      annotationEntries.length > 0 ||
      activeToolType !== ANNOTATION_SELECT_TOOL_ID ||
      !registry.getPlugin(defaultToolId)
    ) {
      return;
    }

    setActiveToolType(defaultToolId);
  }, [
    activeToolType,
    annotationEntries.length,
    registry,
    setActiveToolType,
    shouldShowCesiumAnnotationLayer,
  ]);
}
