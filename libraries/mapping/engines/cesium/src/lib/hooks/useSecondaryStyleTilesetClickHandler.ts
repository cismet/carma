import { useEffect } from "react";

import {
  ScreenSpaceEventHandler,
  Cesium3DTileFeature,
  Cesium3DTileset,
  ColorBlendMode,
  Color,
  ScreenSpaceEventType,
} from "cesium";

import { isValidScene, tryWithValidScene } from "../utils/instanceGates";
import { useCesiumContext } from "./useCesiumContext";
import { TILESET_IDS } from "../constants";

export const useSecondaryStyleTilesetClickHandler = (
  disableSelection = true
) => {
  const { isViewerReady, sceneRef, tilesetVisibilityRef } = useCesiumContext();
  const isSecondaryStyle =
    tilesetVisibilityRef.current.get(TILESET_IDS.SECONDARY) ?? true;

  useEffect(() => {
    const scene = sceneRef.current;
    if (
      !isViewerReady ||
      !isSecondaryStyle ||
      disableSelection ||
      !isValidScene(scene)
    )
      return;
    console.debug("HOOK: useGLTFTilesetClickHandler");

    let selectedObject; // Store the currently selected feature
    let lastColor;
    const { canvas } = scene;

    const handler = new ScreenSpaceEventHandler(canvas);

    handler.setInputAction((movement) => {
      // If a feature was previously selected, revert its color
      if (selectedObject) {
        selectedObject.color = lastColor;
        selectedObject.colorBlendMode = ColorBlendMode.HIGHLIGHT;
        selectedObject.colorBlendAmount = 0.0;
      }

      tryWithValidScene(scene, (scene) => {
        const pickedObject = scene.pick(movement.position);
        console.debug("SCENE PICK: secondary", pickedObject);
        if (!pickedObject) return;

        if (pickedObject.primitive instanceof Cesium3DTileset) {
          const { _batchId, _content } = pickedObject;
          console.debug("Cesium3DTileFeature", _batchId);
          const feature = _content.getFeature(_batchId);
          if (feature instanceof Cesium3DTileFeature) {
            lastColor = feature.color;
            feature.color = Color.YELLOW;
            selectedObject = feature;
          }
        }
      });
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
    };
  }, [sceneRef, isViewerReady, isSecondaryStyle, disableSelection]);
};
