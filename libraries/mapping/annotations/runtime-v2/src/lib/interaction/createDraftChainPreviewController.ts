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

export type DraftChainPreviewControllerState = {
  chainCoordinates: readonly RuntimeCoordinate[];
  markerCoordinates: readonly RuntimeCoordinate[];
};

export type DraftChainPreviewController = {
  setState: (state: DraftChainPreviewControllerState) => void;
  clear: () => void;
  destroy: () => void;
};

const DRAFT_CHAIN_PREVIEW_LAYER_ID =
  "annotation-overlay-draft-chain-preview-layer";
type RuntimeCartesian3 = ReturnType<typeof cartesian3FromGeographicCoordinate>;

export const createDraftChainPreviewController = (
  scene: RuntimeScene
): DraftChainPreviewController => {
  const overlayLayer = createPreviewOverlayLayer(
    scene,
    DRAFT_CHAIN_PREVIEW_LAYER_ID
  );
  if (!overlayLayer) {
    return {
      setState: () => undefined,
      clear: () => undefined,
      destroy: () => undefined,
    };
  }

  const lineCollection = createLineCollection(scene);
  const draftChainLine = createLineRuntime(
    lineCollection,
    "draft-preview-chain",
    previewControllerDefaults.draftChainColor
  );
  const pointMarkers: PreviewPointMarker[] = [];
  let currentState: DraftChainPreviewControllerState = {
    chainCoordinates: [],
    markerCoordinates: [],
  };
  let chainLinePositions: readonly RuntimeCartesian3[] = [];

  const hide = () => {
    clearLineRuntime(draftChainLine);
    hidePointMarkers(pointMarkers);
  };

  const render = (requestRender = true) => {
    if (!isValidScene(scene)) {
      return;
    }

    const { markerCoordinates } = currentState;
    if (chainLinePositions.length >= 2) {
      applyLineRuntime(draftChainLine, chainLinePositions);
    } else {
      clearLineRuntime(draftChainLine);
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
          currentState.chainCoordinates,
          nextState.chainCoordinates
        ) &&
        coordinatesEqual(
          currentState.markerCoordinates,
          nextState.markerCoordinates
        )
      ) {
        return;
      }

      currentState = {
        chainCoordinates: [...nextState.chainCoordinates],
        markerCoordinates: [...nextState.markerCoordinates],
      };
      chainLinePositions = currentState.chainCoordinates.map(
        cartesian3FromGeographicCoordinate
      );
      render();
    },
    clear: () => {
      currentState = {
        chainCoordinates: [],
        markerCoordinates: [],
      };
      chainLinePositions = [];
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
