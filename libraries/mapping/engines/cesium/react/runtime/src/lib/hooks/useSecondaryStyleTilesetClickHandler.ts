import { useEffect } from "react";

import {
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cesium3DTileFeature,
  Cesium3DTileset,
  ColorBlendMode,
  Color,
} from "cesium";

import { useCesiumContext } from "./useCesiumContext";
import { useCesiumRuntime } from "./useCesiumRuntime";
export const useSecondaryStyleTilesetClickHandler = (
  disableSelection = true
) => {
  const runtime = useCesiumRuntime();
  const { showSecondaryTileset: isSecondaryStyle } = useCesiumContext();

  useEffect(() => {
    if (!runtime || !isSecondaryStyle || disableSelection) return;
    console.debug("HOOK: useGLTFTilesetClickHandler");

    let selectedObject; // Store the currently selected feature
    let lastColor;

    const handler = new ScreenSpaceEventHandler(runtime.canvas);

    handler.setInputAction((movement) => {
      // If a feature was previously selected, revert its color
      if (selectedObject) {
        selectedObject.color = lastColor;
        selectedObject.colorBlendMode = ColorBlendMode.HIGHLIGHT;
        selectedObject.colorBlendAmount = 0.0;
      }

      const pickedObject = runtime.scene.pick(movement.position);
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
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
    };
  }, [runtime, isSecondaryStyle]);
};
