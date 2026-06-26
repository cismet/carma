import type { MutableRefObject } from "react";

import {
  Cartographic,
  PolylineCollection,
  Primitive,
  type Cartesian3,
  type CesiumTerrainProvider,
  type Scene,
} from "@carma-cesium";
import {
  getDegreesFromCartographic,
  getTerrainElevationAsync,
} from "@carma-mapping/engines/cesium/core";
import type { CesiumRuntime } from "@carma-mapping/engines/cesium/react/runtime";

import { updateMarkerPosition } from "./marker";
export const onCesiumClick = async (
  click,
  runtimeRef: MutableRefObject<CesiumRuntime | null>,
  scene: Scene,
  terrainProvider: CesiumTerrainProvider,
  markerPrimitiveRef: MutableRefObject<Primitive | null>,
  highlightPrimitiveRef: MutableRefObject<PolylineCollection | null>,
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
    runtimeRef.current!,
    markerPrimitiveRef,
    highlightPrimitiveRef,
    groundPositionCartographic
  );
  callback?.([latitude, longitude]);
};
