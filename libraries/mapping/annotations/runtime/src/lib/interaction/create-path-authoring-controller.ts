import {
  cartesian3FromGeographicCoordinate,
  isValidScene,
} from "@carma-mapping/engines/cesium/core";

import type { CesiumGeographicCoordinate } from "../store";
import type { Cartesian3, Scene } from "@carma-cesium";
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
} from "./authoring-visual-runtime";
import { areCoordinateListsEqual } from "../utils/coordinate-equality";

export type PathAuthoringControllerState = {
  lineCoordinates: readonly CesiumGeographicCoordinate[];
  markerCoordinates: readonly CesiumGeographicCoordinate[];
};

export type PathAuthoringController = {
  setState: (state: PathAuthoringControllerState) => void;
  clear: () => void;
  destroy: () => void;
};

const EMPTY_PATH_AUTHORING_STATE: PathAuthoringControllerState = {
  lineCoordinates: [],
  markerCoordinates: [],
};

export const createPathAuthoringController = (
  scene: Scene,
  {
    overlayLayerId,
    lineId,
    lineColor,
    showPointMarkers = true,
  }: {
    overlayLayerId: string;
    lineId: string;
    lineColor: string;
    showPointMarkers?: boolean;
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
  const pointMarkers: HTMLDivElement[] = [];
  let currentState = EMPTY_PATH_AUTHORING_STATE;
  let linePositions: readonly Cartesian3[] = [];

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

    if (showPointMarkers && currentState.markerCoordinates.length > 0) {
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
        areCoordinateListsEqual(
          currentState.lineCoordinates,
          nextState.lineCoordinates
        ) &&
        areCoordinateListsEqual(
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
