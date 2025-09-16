import type { MutableRefObject } from "react";
import { Cartographic, type Cartesian3, type Entity } from "cesium";
import {
  getDegreesFromCartographic,
  getTerrainElevationAsync,
  type CesiumContextType,
} from "@carma-mapping/engines/cesium";

import { updateMarkerPosition } from "./marker";

export const onCesiumClick = async (
  click,
  ctx: CesiumContextType,
  markerEntityRef: MutableRefObject<Entity | null>,
  highlightEntityRef: MutableRefObject<Entity | null>,
  callback
) => {
  let cartesian: Cartesian3 | undefined;

  ctx.withScene((scene) => {
    cartesian = scene.pickPosition(click.position);
  });

  if (!cartesian) return;

  const cartographic = Cartographic.fromCartesian(cartesian);
  const { latitude, longitude } = getDegreesFromCartographic(cartographic);

  const [groundPositionCartographic] = await getTerrainElevationAsync(ctx, [
    cartographic,
  ]);

  if (!groundPositionCartographic) return;

  updateMarkerPosition(
    ctx.viewerRef.current!,
    markerEntityRef,
    highlightEntityRef,
    groundPositionCartographic
  );
  callback && callback([latitude, longitude]);
};
