import {
  CesiumTerrainProvider,
  ClassificationType,
  Color,
  EllipsoidTerrainProvider,
  NearFarScalar,
  Rectangle,
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
  providerRef: MutableRefObject<
    CesiumTerrainProvider | EllipsoidTerrainProvider | null
  >,
  { label, onReady }: { label?: string; onReady?: () => void }
) => {
  let isProviderSet = false;
  const startTime = performance.now();

  const checkProvider = () => {
    if (isProviderSet) return;

    if (providerRef.current && viewerRef.current) {
      console.debug(
        "[STYLES|TERRAIN|CESIUM] terrainProvider ready after",
        performance.now() - startTime,
        "ms",
        label
      );
      viewerRef.current.scene.terrainProvider = providerRef.current;
      isProviderSet = true;
      onReady?.();
    }
    if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
    requestAnimationFrame(checkProvider);
  };

  if (providerRef.current && viewerRef.current) {
    viewerRef.current.scene.terrainProvider = providerRef.current;
    isProviderSet = true;
    onReady?.();
    console.debug("[STYLES|TERRAIN|CESIUM] terrainProvider already set");
    return;
  } else {
    checkProvider();
  }
};

export const setupPrimaryStyle = (
  {
    viewerRef,
    terrainProviderRef,
    surfaceProviderRef,
    ellipsoidTerrainProviderRef,
    hq500ProviderRef,
    imageryLayerRef,
  }: CesiumContextType,
  style?: Partial<SceneStyle>,
  hq500Visible: boolean = false
) => {
  (async () => {
    if (!viewerRef.current) return;
    const viewer = viewerRef.current;
    const imageryLayer = imageryLayerRef.current;

    if (hq500Visible) {
      console.debug("[STYLES|TERRAIN|CESIUM] setup primary style with HQ500", hq500ProviderRef.current);
    } else {
      //viewer.scene.globe.baseColor = fromColorRgbaArray(style?.globe?.baseColor) ?? Color.LIGHTGREY;
    }
    console.debug("[STYLES|TERRAIN|CESIUM] setup primary style");

    viewer.scene.backgroundColor =
      fromColorRgbaArray(style?.backgroundColor) ?? new Color(0, 0, 0, 0);

    const onReady = () => {
      if (imageryLayer && imageryLayer.ready) {
        imageryLayer.show = true;
        if (viewer.imageryLayers.length === 0) {
          viewer.imageryLayers.add(imageryLayer);
          console.debug(
            "Primary Style Setup: add imagery layer",
            viewer.imageryLayers.length
          );
        }
      }
      viewer.scene.globe.baseColor = new Color(0.39, 0.77, 0.89, 1);
      // viewer.scene.globe.baseColor = new Color(0.9, 0.2, 0.3, 0.9);
    };
    waitAndSetTerrainProvider(
      viewerRef,
      //terrainProviderRef,
      hq500ProviderRef,
    {
     label: "primary",
     onReady
   });

  
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
  { viewerRef, terrainProviderRef, hq500ProviderRef, imageryLayerRef }: CesiumContextType,
  style?: Partial<SceneStyle>
) => {
  const imageryLayer = imageryLayerRef.current;

  if (!viewerRef.current) return;
  const viewer = viewerRef.current;
  (async () => {
    //viewer.scene.globe.baseColor =   fromColorRgbaArray(style?.globe?.baseColor) ?? Color.WHITE;
    //viewer.scene.globe.baseColor = new Color(0.39, 0.77, 0.89, 0.7);
    viewer.scene.globe.baseColor = new Color(0.14, 0.05, 0.5, 1.0);

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

    waitAndSetTerrainProvider(
       viewerRef,
       terrainProviderRef,
       //hq500ProviderRef,
     {
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
