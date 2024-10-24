import { CesiumTerrainProvider, ClassificationType, Color } from "cesium";

import type { CesiumContextType } from "../CesiumContext";
import { getGroundPrimitiveById } from "./cesiumGroundPrimitives";

// TODO have configurable setup functions for primary and secondary styles
// TODO MOVE THE ID into viewer config/state
const INVERTED_SELECTED_POLYGON_ID = "searchgaz-inverted-polygon";

export const setupPrimaryStyle = ({
  viewerRef,
  terrainProviderRef,
  surfaceProviderRef,
  imageryLayerRef,
}: CesiumContextType) => {
  (async () => {
    const viewer = viewerRef.current;
    const terrainProvider = terrainProviderRef.current;
    const surfaceProvider = surfaceProviderRef.current;
    const imageryLayer = imageryLayerRef.current;

    if (!viewer) return;
    viewer.scene.globe.baseColor = Color.DARKGRAY;

    if (viewer.scene.terrainProvider instanceof CesiumTerrainProvider) {
      //viewer.scene.terrainProvider = ellipsoidTerrainProvider;
    } else {
      if (surfaceProvider) {
        viewer.scene.terrainProvider = surfaceProvider;
      }
    }
    // viewer.scene.globe.depthTestAgainstTerrain = false;

    if (imageryLayer) {
      imageryLayer.show = false;
    }

    const invertedSelection = getGroundPrimitiveById(
      viewer,
      INVERTED_SELECTED_POLYGON_ID
    );
    if (invertedSelection) {
      invertedSelection.classificationType = ClassificationType.CESIUM_3D_TILE;
    }

    viewer.scene.requestRender();
  })();
};

export const setupSecondaryStyle = ({
  viewerRef,
  terrainProviderRef,
  imageryLayerRef,
}: CesiumContextType) => {
  const viewer = viewerRef.current;
  const terrainProvider = terrainProviderRef.current;
  const imageryLayer = imageryLayerRef.current;

  if (!viewer) return;
  (async () => {
    viewer.scene.globe.baseColor = Color.WHITE;
    if (
      !(viewer.scene.terrainProvider instanceof CesiumTerrainProvider) &&
      terrainProvider
    ) {
      viewer.scene.terrainProvider = terrainProvider;
    }
    // DEPTH TEST is quite slow, only use if really necessary
    // viewer.scene.globe.depthTestAgainstTerrain = true;
    // viewer.scene.globe.show = false;

    if (imageryLayer && imageryLayer.ready) {
      imageryLayer.show = true;
      if (viewer.imageryLayers.length === 0) {
        console.debug("Secondary Style Setup: add imagery layer");
        viewer.imageryLayers.add(imageryLayer);
      }
    }

    const invertedSelection = getGroundPrimitiveById(
      viewer,
      INVERTED_SELECTED_POLYGON_ID
    );
    if (invertedSelection) {
      invertedSelection.classificationType = ClassificationType.BOTH;
    }

    viewer.scene.requestRender();
    // viewer.scene.globe.show = true;
  })();
};
