import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import { faRuler } from "@fortawesome/free-solid-svg-icons";

import { useAnnotationsRuntime } from "@carma-mapping/annotations/runtime";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import type { Layer } from "@carma-mapping/layers";

import {
  appendLayer,
  getLayers,
  removeLayer,
  updateLayer,
} from "../store/slices/mapping";
import { getUIMode, setUIMode, UIMode } from "../store/slices/ui";
import {
  CESIUM_ANNOTATION_INTERACTION_ID,
  CESIUM_ANNOTATION_LAYER_ID,
} from "../components/annotations/cesium-annotations.constants";

const CESIUM_ANNOTATION_LAYER: Layer = {
  id: CESIUM_ANNOTATION_LAYER_ID,
  title: "Messung",
  type: "object",
  icon: "measurement",
  visible: true,
  pinned: "last",
  interactionButton: {
    icon: faRuler,
    id: CESIUM_ANNOTATION_INTERACTION_ID,
  },
};

const getCesiumAnnotationLayerTitle = (count: number) =>
  count > 0 ? `${count} Messung${count > 1 ? "en" : ""}` : "Messung";

export function useCesiumAnnotationLayerButton() {
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);
  const uiMode = useSelector(getUIMode);
  const { isCesium } = useMapFrameworkSwitcherContext();
  const { annotationEntries, setSelectedAnnotationId } =
    useAnnotationsRuntime();

  const shouldShowCesiumAnnotationLayer =
    isCesium && uiMode === UIMode.MEASUREMENT;
  const hasCesiumAnnotationLayer = layers.some(
    (layer) => layer.id === CESIUM_ANNOTATION_LAYER_ID
  );
  const prevRef = useRef({
    shouldShowCesiumAnnotationLayer,
    hasCesiumAnnotationLayer,
  });
  const initialCleanupDone = useRef(false);

  useEffect(() => {
    if (initialCleanupDone.current) {
      return;
    }

    initialCleanupDone.current = true;

    if (!shouldShowCesiumAnnotationLayer && hasCesiumAnnotationLayer) {
      dispatch(removeLayer(CESIUM_ANNOTATION_LAYER_ID));
    }
  }, [dispatch, hasCesiumAnnotationLayer, shouldShowCesiumAnnotationLayer]);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = {
      shouldShowCesiumAnnotationLayer,
      hasCesiumAnnotationLayer,
    };

    if (
      shouldShowCesiumAnnotationLayer &&
      !prev.shouldShowCesiumAnnotationLayer &&
      !hasCesiumAnnotationLayer
    ) {
      dispatch(
        appendLayer({
          ...CESIUM_ANNOTATION_LAYER,
          title: getCesiumAnnotationLayerTitle(annotationEntries.length),
        })
      );
      return;
    }

    if (
      !shouldShowCesiumAnnotationLayer &&
      prev.shouldShowCesiumAnnotationLayer &&
      hasCesiumAnnotationLayer
    ) {
      setSelectedAnnotationId(null);
      dispatch(removeLayer(CESIUM_ANNOTATION_LAYER_ID));
      return;
    }

    if (
      shouldShowCesiumAnnotationLayer &&
      !hasCesiumAnnotationLayer &&
      prev.hasCesiumAnnotationLayer
    ) {
      setSelectedAnnotationId(null);
      dispatch(setUIMode(UIMode.DEFAULT));
    }
  }, [
    annotationEntries,
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
        ...CESIUM_ANNOTATION_LAYER,
        title: getCesiumAnnotationLayerTitle(annotationEntries.length),
      })
    );
  }, [
    annotationEntries.length,
    dispatch,
    hasCesiumAnnotationLayer,
    shouldShowCesiumAnnotationLayer,
  ]);
}
