import {
  Cartographic,
  sampleTerrainMostDetailed,
  Viewer,
  CesiumTerrainProvider,
} from "cesium";
import { getDegreesFromCartographic } from "@carma-mapping/engines/cesium";

import { updateMarkerPosition } from "./marker";

export const onCesiumClick = async (
  click,
  viewer: Viewer,
  withTerrainProvider: (
    cb: (provider: CesiumTerrainProvider, viewer: Viewer) => void
  ) => boolean,
  markerEntityRef,
  highlightEntityRef,
  callback
) => {
  if (viewer.isDestroyed()) return;

  const cartesian = viewer.scene.pickPosition(click.position);
  if (!cartesian) return;

  const cartographic = Cartographic.fromCartesian(cartesian);
  const { latitude, longitude } = getDegreesFromCartographic(cartographic);

  let handled = false;
  await withTerrainProvider(async (provider) => {
    const [groundPositionCartographic] = await sampleTerrainMostDetailed(
      provider,
      [cartographic]
    );

    updateMarkerPosition(
      viewer,
      markerEntityRef,
      highlightEntityRef,
      groundPositionCartographic
    );
    callback([latitude, longitude]);
    handled = true;
  });
  if (!handled) {
    // fallback: if no provider available yet, do nothing
    return;
  }
};
