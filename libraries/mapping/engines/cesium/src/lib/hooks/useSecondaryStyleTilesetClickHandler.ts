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

export const useSecondaryStyleTilesetClickHandler = (
  disableSelection = true
) => {
  const { sceneRef, currentSceneStyleRef } = useCesiumContext();
  const isTopoStyle = currentSceneStyleRef.current === "topo";

  useEffect(() => {
    const scene = sceneRef.current;
    if (!isTopoStyle || disableSelection || !isValidScene(scene)) return;
    console.debug("HOOK: useGLTFTilesetClickHandler");

    let selectedObject: any = null;
    let lastColor: any = null;
    const { canvas } = scene;

    const handler = new ScreenSpaceEventHandler(canvas);

    handler.setInputAction((movement: any) => {
      if (selectedObject) {
        selectedObject.color = lastColor;
        selectedObject.colorBlendMode = ColorBlendMode.HIGHLIGHT;
        selectedObject.colorBlendAmount = 0.0;
      }

      tryWithValidScene(scene, (scene) => {
        const pickedObject = scene.pick(movement.position);
        console.debug("SCENE PICK: topo style", pickedObject);
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
  }, [sceneRef, isTopoStyle, disableSelection]);
};
