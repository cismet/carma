import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useCesium } from "resium";
import { CesiumTerrainProvider, Color, Viewer } from "cesium";
import {
  setShowPrimaryTileset,
  setShowSecondaryTileset,
} from "../../CustomViewerContextProvider/slices/cesium";
import { SceneStyles } from "../../..";
import {
  useCesiumCustomViewer,
  useCustomViewerContext,
} from "../../CustomViewerContextProvider/components/CustomViewerContextProvider";

// TODO move combined common setup out of here

const setupPrimaryStyle = (
  viewer: Viewer,
  { terrainProvider, imageryLayer },
) => {
  (async () => {
    viewer.scene.globe.baseColor = Color.DARKGRAY;

    if (viewer.scene.terrainProvider instanceof CesiumTerrainProvider) {
      //viewer.scene.terrainProvider = ellipsoidTerrainProvider;
    } else {
      viewer.scene.terrainProvider = await terrainProvider;
    }
    // viewer.scene.globe.depthTestAgainstTerrain = false;

    if (imageryLayer) {
      imageryLayer.show = false;
      if (!viewer.imageryLayers.contains(imageryLayer)) {
        viewer.imageryLayers.add(imageryLayer);
      }
    }
  })();
};

export const setupSecondaryStyle = (
  viewer: Viewer,
  { terrainProvider, imageryLayer },
) => {
  if (!viewer) return;
  (async () => {
    viewer.scene.globe.baseColor = Color.WHITE;

    // console.log('setupSecondaryStyle', viewer.scene.terrainProvider);
    if (!(viewer.scene.terrainProvider instanceof CesiumTerrainProvider)) {
      viewer.scene.terrainProvider = await terrainProvider;
    }
    // DEPTH TEST is quite slow, only use if really necessary
    // viewer.scene.globe.depthTestAgainstTerrain = true;
    // viewer.scene.globe.show = false;

    if (imageryLayer.ready) {
      imageryLayer.show = true;
      // console.log('Secondary Style Setup: add imagery layer');
      if (!viewer.imageryLayers.contains(imageryLayer)) {
        // console.log('Secondary Style Setup: add imagery layer');
        viewer.imageryLayers.add(imageryLayer);
      }
    }
    // viewer.scene.globe.show = true;
  })();
};

export const useSceneStyleToggle = (
  initialStyle: keyof SceneStyles = "secondary",
) => {
  const dispatch = useDispatch();
  const { viewer } = useCesiumCustomViewer();
  const [currentStyle, setCurrentStyle] =
    useState<keyof SceneStyles>(initialStyle);
  const customViewerContext = useCustomViewerContext();

  useEffect(() => {
    if (!viewer) return;

    if (currentStyle === "primary") {
      setupPrimaryStyle(viewer, customViewerContext);
      dispatch(setShowPrimaryTileset(true));
      dispatch(setShowSecondaryTileset(false));
    } else {
      setupSecondaryStyle(viewer, customViewerContext);
      dispatch(setShowPrimaryTileset(false));
      dispatch(setShowSecondaryTileset(true));
    }
  }, [dispatch, viewer, currentStyle, customViewerContext]);

  const toggleSceneStyle = (style?: "primary" | "secondary") => {
    if (style) {
      setCurrentStyle(style);
    } else {
      setCurrentStyle((prev) => (prev === "primary" ? "secondary" : "primary"));
    }
  };

  return toggleSceneStyle;
};
