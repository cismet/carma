import type { MutableRefObject } from "react";
import { Cartographic, type Cartesian3, type Entity, Viewer } from "cesium";
import {
  getDegreesFromCartographic,
  type Scene,
  type CesiumTerrainProvider,
} from "@carma/cesium";
import { getTerrainElevationAsync } from "@carma-mapping/engines/cesium";

import { updateMarkerPosition } from "./marker";

export const onCesiumClick = async (
  click,
  viewerRef: MutableRefObject<Viewer | null>,
  scene: Scene,
  terrainProvider: CesiumTerrainProvider,
  markerEntityRef: MutableRefObject<Entity | null>,
  highlightEntityRef: MutableRefObject<Entity | null>,
  callback
) => {
  let cartesian: Cartesian3 | undefined;

  cartesian = scene.pickPosition(click.position);

  if (!cartesian) return;

  const cartographic = Cartographic.fromCartesian(cartesian);
  const { latitude, longitude } = getDegreesFromCartographic(cartographic);

  const [groundPositionCartographic] = await getTerrainElevationAsync(
    terrainProvider,
    [cartographic]
  );

  if (!groundPositionCartographic) return;

  updateMarkerPosition(
    viewerRef.current!,
    markerEntityRef,
    highlightEntityRef,
    groundPositionCartographic
  );
  callback?.([latitude, longitude]);
};
