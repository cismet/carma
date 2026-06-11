import { createElement, useCallback, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import { faRuler } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ANNOTATION_SELECT_TOOL_ID } from "@carma-mapping/annotations/core";
import {
  selectAuthoringAnnotationEntries,
  updateAnnotationEntryById,
  useAnnotationsDispatch,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";
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
import { is3dAnnotationAdhocLayer } from "../helper/adhoc-feature-utils";

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
  const annotationsDispatch = useAnnotationsDispatch();
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
    selectedAnnotationIds,
  } = useAnnotationsRuntime();

  const shouldShowCesiumAnnotationLayer =
    isCesium && uiMode === UIMode.MEASUREMENT;
  const cesiumAnnotationLayer = layers.find(
    (layer) => layer.id === CESIUM_ANNOTATION_LAYER_ID
  );
  const authoringAnnotationCount = selectAuthoringAnnotationEntries({
    annotationEntries,
  }).length;
  const hasCesiumAnnotationLayer = Boolean(cesiumAnnotationLayer);
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
            authoringAnnotationCount,
            annotationModeText
          ),
        })
      );
    }

    dispatch(setActiveInteractionLayerID(CESIUM_ANNOTATION_LAYER_ID));
    dispatch(setActiveInteractionButtonID(CESIUM_ANNOTATION_INTERACTION_ID));
  }, [
    annotationModeText,
    authoringAnnotationCount,
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
          authoringAnnotationCount,
          annotationModeText
        ),
        visible: cesiumAnnotationLayer?.visible ?? true,
      })
    );
  }, [
    annotationModeText,
    authoringAnnotationCount,
    cesiumAnnotationLayer?.visible,
    dispatch,
    hasCesiumAnnotationLayer,
    shouldShowCesiumAnnotationLayer,
  ]);

  useEffect(() => {
    if (!isCesium) {
      return;
    }

    const annotationVisibilityById = new Map<string, boolean>();

    if (cesiumAnnotationLayer) {
      const visible = cesiumAnnotationLayer.visible !== false;
      for (const annotationEntry of selectAuthoringAnnotationEntries({
        annotationEntries,
      })) {
        annotationVisibilityById.set(annotationEntry.id, visible);
      }
    }

    const savedAnnotationLayerVisibilityByCollectionId = new Map<
      string,
      boolean
    >();
    for (const layer of layers) {
      if (is3dAnnotationAdhocLayer(layer)) {
        savedAnnotationLayerVisibilityByCollectionId.set(
          layer.id,
          layer.visible !== false
        );
      }
    }

    for (const annotationEntry of annotationEntries) {
      const externalCollection = annotationEntry.externalCollection;
      if (
        externalCollection?.type !== "saved-measurement" ||
        !savedAnnotationLayerVisibilityByCollectionId.has(externalCollection.id)
      ) {
        continue;
      }

      annotationVisibilityById.set(
        annotationEntry.id,
        savedAnnotationLayerVisibilityByCollectionId.get(externalCollection.id)!
      );
    }

    let shouldClearSelection = false;
    for (const annotationEntry of annotationEntries) {
      const visible = annotationVisibilityById.get(annotationEntry.id);
      if (visible === undefined) {
        continue;
      }

      const nextHidden = !visible;
      if (annotationEntry.hidden !== nextHidden) {
        annotationsDispatch(
          updateAnnotationEntryById({
            annotationId: annotationEntry.id,
            hidden: nextHidden,
          })
        );
      }

      if (nextHidden && selectedAnnotationIds.includes(annotationEntry.id)) {
        shouldClearSelection = true;
      }
    }

    if (shouldClearSelection) {
      setSelectedAnnotationId(null);
    }
  }, [
    annotationEntries,
    annotationsDispatch,
    cesiumAnnotationLayer,
    isCesium,
    layers,
    selectedAnnotationIds,
    setSelectedAnnotationId,
  ]);

  useEffect(() => {
    const defaultToolId = CESIUM_ANNOTATION_CONFIG.tools.defaultToolId;
    if (
      !shouldShowCesiumAnnotationLayer ||
      authoringAnnotationCount > 0 ||
      activeToolType !== ANNOTATION_SELECT_TOOL_ID ||
      !registry.getPlugin(defaultToolId)
    ) {
      return;
    }

    setActiveToolType(defaultToolId);
  }, [
    activeToolType,
    authoringAnnotationCount,
    registry,
    setActiveToolType,
    shouldShowCesiumAnnotationLayer,
  ]);
}
