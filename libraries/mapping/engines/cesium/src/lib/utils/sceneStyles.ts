import {
  CesiumTerrainProvider,
  ClassificationType,
  Color,
  Viewer,
} from "cesium";

import type { CesiumContextType } from "../CesiumContext";
import { getGroundPrimitiveById } from "./cesiumGroundPrimitives";
import { SceneStyle } from "../..";
import { fromColorRgbaArray } from "./cesiumSerializer";
import { MutableRefObject } from "react";

// TODO have configurable setup functions for primary and secondary styles
// TODO MOVE THE ID into viewer config/state
const INVERTED_SELECTED_POLYGON_ID = "searchgaz-inverted-polygon";

const waitAndSetTerrainProvider = (
  viewerRef: MutableRefObject<Viewer | null>,
  terrainProviderRef: MutableRefObject<CesiumTerrainProvider | null>,
  label?: string
) => {
  let isTerrainProviderSet = false;
  const startTime = performance.now();

  const checkTerrainProvider = () => {
    if (isTerrainProviderSet) return;

    if (terrainProviderRef.current && viewerRef.current) {
      console.debug(
        "[STYLES|TERRAIN|CESIUM] terrain Provider ready after",
        performance.now() - startTime,
        "ms",
        label
      );
      viewerRef.current.terrainProvider = terrainProviderRef.current;
      isTerrainProviderSet = true;
      if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
      requestAnimationFrame(checkTerrainProvider);
    }
  };

  if (terrainProviderRef.current && viewerRef.current) {
    viewerRef.current.terrainProvider = terrainProviderRef.current;
    console.debug("[STYLES|TERRAIN|CESIUM] terrainProvider already set");
    return;
  } else {
    checkTerrainProvider();
  }
};

export const setupPrimaryStyle = (
  {
    viewerRef,
    terrainProviderRef,
    surfaceProviderRef,
    imageryLayerRef,
  }: CesiumContextType,
  style?: Partial<SceneStyle>
) => {
  (async () => {
    if (!viewerRef.current) return;
    const viewer = viewerRef.current;
    const imageryLayer = imageryLayerRef.current;

    viewer.scene.globe.baseColor =
      fromColorRgbaArray(style?.globe?.baseColor) ?? Color.LIGHTGREY;
    viewer.scene.backgroundColor =
      fromColorRgbaArray(style?.backgroundColor) ?? new Color(0, 0, 0, 0);

    console.debug("[STYLES|TERRAIN|CESIUM] setup primary style");
    waitAndSetTerrainProvider(viewerRef, surfaceProviderRef, "primary");

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

export const setupSecondaryStyle = (
  { viewerRef, terrainProviderRef, imageryLayerRef }: CesiumContextType,
  style?: Partial<SceneStyle>
) => {
  const imageryLayer = imageryLayerRef.current;

  if (!viewerRef.current) return;
  const viewer = viewerRef.current;
  (async () => {
    viewer.scene.globe.baseColor =
      fromColorRgbaArray(style?.globe?.baseColor) ?? Color.WHITE;
    viewer.scene.backgroundColor =
      fromColorRgbaArray(style?.backgroundColor) ?? new Color(0, 0, 0, 0);

    if (imageryLayer && imageryLayer.ready) {
      imageryLayer.show = true;
      if (viewer.imageryLayers.length === 0) {
        console.debug("Secondary Style Setup: add imagery layer");
        viewer.imageryLayers.add(imageryLayer);
      }
    }

    waitAndSetTerrainProvider(viewerRef, terrainProviderRef, "secondary");

    const invertedSelection = getGroundPrimitiveById(
      viewer,
      INVERTED_SELECTED_POLYGON_ID
    );
    if (invertedSelection) {
      invertedSelection.classificationType = ClassificationType.BOTH;
    }
    viewer.scene.requestRender();
  })();
};
