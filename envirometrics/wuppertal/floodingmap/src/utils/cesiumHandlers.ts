import type { MutableRefObject } from "react";
import {
  Cartographic,
  CesiumTerrainProvider,
  Scene,
  Viewer,
  type Cartesian3,
  type Entity,
} from "cesium";

import {
  getDegreesFromCartographic,
  isValidViewer,
  tryWithValidScene,
  guardSampleTerrainMostDetailedAsync,
} from "@carma-mapping/engines/cesium";

import { updateMarkerPosition } from "./marker";

export const onCesiumClick = async (
  click,
  viewerRef: MutableRefObject<Viewer | null>,
  sceneRef: MutableRefObject<Scene | null>,
  terrainProviderRef: MutableRefObject<CesiumTerrainProvider | null>,
  markerEntityRef: MutableRefObject<Entity | null>,
  highlightEntityRef: MutableRefObject<Entity | null>,
  callback
) => {
  let cartesian: Cartesian3 | undefined;
  const scene = sceneRef.current;

  tryWithValidScene(scene, (scene) => {
    cartesian = scene.pickPosition(click.position);
  });

  if (!cartesian) return;

  const cartographic = Cartographic.fromCartesian(cartesian);
  const { latitude, longitude } = getDegreesFromCartographic(cartographic);

  const [groundPositionCartographic] =
    await guardSampleTerrainMostDetailedAsync(terrainProviderRef.current!, [
      cartographic,
    ]);

  if (!groundPositionCartographic) return;

  if (!isValidViewer(viewerRef.current)) return;

  updateMarkerPosition(
    viewerRef.current,
    markerEntityRef,
    highlightEntityRef,
    groundPositionCartographic
  );
  callback?.([latitude, longitude]);
};
