import {
  CesiumTerrainProvider,
  ClassificationType,
  Color,
  EllipsoidTerrainProvider,
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
  terrainProviderRef: MutableRefObject<
    CesiumTerrainProvider | EllipsoidTerrainProvider | null
  >,
  { label, onReady }: { label?: string; onReady?: () => void }
) => {
  let isTerrainProviderSet = false;
  const startTime = performance.now();

  const checkTerrainProvider = () => {
    if (isTerrainProviderSet) return;

    if (terrainProviderRef.current && viewerRef.current) {
      console.debug(
        "[STYLES|TERRAIN|CESIUM] terrainProvider ready after",
        performance.now() - startTime,
        "ms",
        label
      );
      viewerRef.current.scene.terrainProvider = terrainProviderRef.current;
      isTerrainProviderSet = true;
      onReady?.();
    }
    if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
    requestAnimationFrame(checkTerrainProvider);
  };

  if (terrainProviderRef.current && viewerRef.current) {
    viewerRef.current.scene.terrainProvider = terrainProviderRef.current;
    isTerrainProviderSet = true;
    onReady?.();
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
    ellipsoidTerrainProviderRef,
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

    // use terrain provider not the surface provider to prevent camera jitter on move
    waitAndSetTerrainProvider(viewerRef, terrainProviderRef, {
      label: "secondary",
      //onReady: addImageryLayer,
    });

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

    const addImageryLayer = () => {
      if (imageryLayer && imageryLayer.ready) {
        imageryLayer.show = true;
        if (viewer.imageryLayers.length === 0) {
          viewer.imageryLayers.add(imageryLayer);
          console.debug(
            "Secondary Style Setup: add imagery layer",
            viewer.imageryLayers.length
          );
        }
      }
    };

    waitAndSetTerrainProvider(viewerRef, terrainProviderRef, {
      label: "secondary",
      onReady: addImageryLayer,
    });

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
