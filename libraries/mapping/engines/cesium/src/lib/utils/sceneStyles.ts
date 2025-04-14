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
  viewer: Viewer | undefined,
  terrainProviderRef: MutableRefObject<
    CesiumTerrainProvider | EllipsoidTerrainProvider | null
  >,
  { label, onReady }: { label?: string; onReady?: () => void }
) => {
  let isTerrainProviderSet = false;
  const startTime = performance.now();

  const checkTerrainProvider = () => {
    if (isTerrainProviderSet) return;

    if (terrainProviderRef.current && viewer) {
      console.debug(
        "[STYLES|TERRAIN|CESIUM] terrainProvider ready after",
        performance.now() - startTime,
        "ms",
        label
      );
      viewer.scene.terrainProvider = terrainProviderRef.current;
      isTerrainProviderSet = true;
      onReady?.();
    }
    if (!viewer || viewer.isDestroyed()) return;
    requestAnimationFrame(checkTerrainProvider);
  };

  if (terrainProviderRef.current && viewer) {
    viewer.scene.terrainProvider = terrainProviderRef.current;
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
    viewer,
    terrainProviderRef,
    surfaceProviderRef,
    ellipsoidTerrainProviderRef,
    imageryLayerRef,
  }: CesiumContextType,
  style?: Partial<SceneStyle>
) => {
  (async () => {
    if (!viewer) return;
    const imageryLayer = imageryLayerRef.current;

    viewer.scene.globe.baseColor =
      fromColorRgbaArray(style?.globe?.baseColor) ?? Color.LIGHTGREY;
    viewer.scene.backgroundColor =
      fromColorRgbaArray(style?.backgroundColor) ?? new Color(0, 0, 0, 0);

    console.debug("[STYLES|TERRAIN|CESIUM] setup primary style");

    // use terrain provider not the surface provider to prevent camera jitter on move
    waitAndSetTerrainProvider(viewer, terrainProviderRef, {
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
  { viewer, terrainProviderRef, imageryLayerRef }: CesiumContextType,
  style?: Partial<SceneStyle>
) => {
  const imageryLayer = imageryLayerRef.current;

  if (!viewer) return;
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

    waitAndSetTerrainProvider(viewer, terrainProviderRef, {
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
