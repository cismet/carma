import {
  cartesian3FromGeographicCoordinate,
  isValidScene,
} from "@carma-mapping/engines/cesium/core";

import type { RuntimeCoordinate } from "../store";
import type { RuntimeScene } from "../types/runtime-scene.types";
import {
  applyLineRuntime,
  clearLineRuntime,
  createLineCollection,
  createLineRuntime,
  createPreviewOverlayLayer,
  destroyLineCollection,
  destroyPreviewOverlayLayer,
  hidePointMarkers,
  placePointMarkers,
  type PreviewPointMarker,
} from "./authoring-visual-runtime";
import { areRuntimeCoordinateListsEqual } from "../utils/runtime-coordinate-equality";

export type PathAuthoringControllerState = {
  lineCoordinates: readonly RuntimeCoordinate[];
  markerCoordinates: readonly RuntimeCoordinate[];
};

export type PathAuthoringController = {
  setState: (state: PathAuthoringControllerState) => void;
  clear: () => void;
  destroy: () => void;
};

type RuntimeCartesian3 = ReturnType<typeof cartesian3FromGeographicCoordinate>;

const EMPTY_PATH_AUTHORING_STATE: PathAuthoringControllerState = {
  lineCoordinates: [],
  markerCoordinates: [],
};

export const createPathAuthoringController = (
  scene: RuntimeScene,
  {
    overlayLayerId,
    lineId,
    lineColor,
  }: {
    overlayLayerId: string;
    lineId: string;
    lineColor: string;
  }
): PathAuthoringController => {
  const overlayLayer = createPreviewOverlayLayer(scene, overlayLayerId);
  if (!overlayLayer) {
    return {
      setState: () => undefined,
      clear: () => undefined,
      destroy: () => undefined,
    };
  }

  const lineCollection = createLineCollection(scene);
  const pathLine = createLineRuntime(lineCollection, lineId, lineColor);
  const pointMarkers: PreviewPointMarker[] = [];
  let currentState = EMPTY_PATH_AUTHORING_STATE;
  let linePositions: readonly RuntimeCartesian3[] = [];

  const hide = () => {
    clearLineRuntime(pathLine);
    hidePointMarkers(pointMarkers);
  };

  const render = (requestRender = true) => {
    if (!isValidScene(scene)) {
      return;
    }

    if (linePositions.length >= 2) {
      applyLineRuntime(pathLine, linePositions);
    } else {
      clearLineRuntime(pathLine);
    }

    if (currentState.markerCoordinates.length > 0) {
      placePointMarkers({
        scene,
        overlayLayer,
        pointMarkers,
        coordinates: currentState.markerCoordinates,
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
        areRuntimeCoordinateListsEqual(
          currentState.lineCoordinates,
          nextState.lineCoordinates
        ) &&
        areRuntimeCoordinateListsEqual(
          currentState.markerCoordinates,
          nextState.markerCoordinates
        )
      ) {
        return;
      }

      currentState = {
        lineCoordinates: [...nextState.lineCoordinates],
        markerCoordinates: [...nextState.markerCoordinates],
      };
      linePositions = currentState.lineCoordinates.map(
        cartesian3FromGeographicCoordinate
      );
      render();
    },
    clear: () => {
      currentState = EMPTY_PATH_AUTHORING_STATE;
      linePositions = [];
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
