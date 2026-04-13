import {
  cartesian3FromGeographicCoordinate,
  isValidScene,
} from "@carma-mapping/engines/cesium/core";

import type { RuntimeCoordinate } from "../store";
import type { RuntimeScene } from "../types/runtimeScene.types";
import {
  applyLineRuntime,
  clearLineRuntime,
  coordinatesEqual,
  createLineCollection,
  createLineRuntime,
  createPreviewOverlayLayer,
  destroyLineCollection,
  destroyPreviewOverlayLayer,
  hidePointMarkers,
  placePointMarkers,
  previewControllerDefaults,
  type PreviewPointMarker,
} from "./previewController.shared";

export type PolygonLoopPreviewControllerState = {
  loopCoordinates: readonly RuntimeCoordinate[];
  markerCoordinates: readonly RuntimeCoordinate[];
};

export type PolygonLoopPreviewController = {
  setState: (state: PolygonLoopPreviewControllerState) => void;
  clear: () => void;
  destroy: () => void;
};

const POLYGON_LOOP_PREVIEW_LAYER_ID =
  "annotation-overlay-polygon-loop-preview-layer";
type RuntimeCartesian3 = ReturnType<typeof cartesian3FromGeographicCoordinate>;

export const createPolygonLoopPreviewController = (
  scene: RuntimeScene
): PolygonLoopPreviewController => {
  const overlayLayer = createPreviewOverlayLayer(
    scene,
    POLYGON_LOOP_PREVIEW_LAYER_ID
  );
  if (!overlayLayer) {
    return {
      setState: () => undefined,
      clear: () => undefined,
      destroy: () => undefined,
    };
  }

  const lineCollection = createLineCollection(scene);
  const loopLine = createLineRuntime(
    lineCollection,
    "draft-preview-loop",
    previewControllerDefaults.draftChainColor
  );
  const pointMarkers: PreviewPointMarker[] = [];
  let currentState: PolygonLoopPreviewControllerState = {
    loopCoordinates: [],
    markerCoordinates: [],
  };
  let loopLinePositions: readonly RuntimeCartesian3[] = [];

  const hide = () => {
    clearLineRuntime(loopLine);
    hidePointMarkers(pointMarkers);
  };

  const render = (requestRender = true) => {
    if (!isValidScene(scene)) {
      return;
    }

    const { markerCoordinates } = currentState;
    if (loopLinePositions.length >= 2) {
      applyLineRuntime(loopLine, loopLinePositions);
    } else {
      clearLineRuntime(loopLine);
    }

    if (markerCoordinates.length > 0) {
      placePointMarkers({
        scene,
        overlayLayer,
        pointMarkers,
        coordinates: markerCoordinates,
      });
    } else {
      hidePointMarkers(pointMarkers);
    }

    if (requestRender) {
      scene.requestRender();
    }
  };

  const removePostRenderListener = scene.postRender.addEventListener(() => {
    render(false);
  });

  return {
    setState: (nextState) => {
      if (
        coordinatesEqual(
          currentState.loopCoordinates,
          nextState.loopCoordinates
        ) &&
        coordinatesEqual(
          currentState.markerCoordinates,
          nextState.markerCoordinates
        )
      ) {
        return;
      }

      currentState = {
        loopCoordinates: [...nextState.loopCoordinates],
        markerCoordinates: [...nextState.markerCoordinates],
      };
      loopLinePositions = currentState.loopCoordinates.map(
        cartesian3FromGeographicCoordinate
      );
      render();
    },
    clear: () => {
      currentState = {
        loopCoordinates: [],
        markerCoordinates: [],
      };
      loopLinePositions = [];
      hide();
      scene.requestRender();
    },
    destroy: () => {
      removePostRenderListener();
      hide();
      destroyLineCollection(scene, lineCollection);
      destroyPreviewOverlayLayer(overlayLayer);
      if (!scene.isDestroyed()) {
        scene.requestRender();
      }
    },
  };
};
