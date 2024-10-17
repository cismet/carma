import { useEffect } from "react";
import { useSelector } from "react-redux";

import {
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cesium3DTileFeature,
  Cesium3DTileset,
  ColorBlendMode,
  Color,
} from "cesium";

import { selectShowSecondaryTileset } from "../slices/cesium";
import { useCesiumContext } from "../CesiumContextProvider";
import type { TilesetConfig } from "../utils/cesiumHelpers";

export const useSecondaryStyleTilesetClickHandler = (
  config: TilesetConfig | null | undefined,
) => {
  const { viewer } = useCesiumContext();
  const isSecondaryStyle = useSelector(selectShowSecondaryTileset);

  const { disableSelection } = config ?? {};

  useEffect(() => {
    if (!viewer || !isSecondaryStyle || disableSelection) return;
    console.log("HOOK: useGLTFTilesetClickHandler");

    let selectedObject; // Store the currently selected feature
    let lastColor;

    const handler = new ScreenSpaceEventHandler(viewer.canvas);

    handler.setInputAction((movement) => {
      // If a feature was previously selected, revert its color
      if (selectedObject) {
        selectedObject.color = lastColor;
        selectedObject.colorBlendMode = ColorBlendMode.HIGHLIGHT;
        selectedObject.colorBlendAmount = 0.0;
      }

      const pickedObject = viewer.scene.pick(movement.position);
      console.log("SCENE PICK: secondary", pickedObject);
      if (!pickedObject) return;

      if (pickedObject.primitive instanceof Cesium3DTileset) {
        // console.log('Cesium3DTileset', pickedObject);
        const { _batchId, _content } = pickedObject;
        console.log("Cesium3DTileFeature", _batchId);
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
  }, [viewer, isSecondaryStyle]);
};
