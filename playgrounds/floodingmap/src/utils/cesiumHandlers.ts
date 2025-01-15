import { Cartographic, sampleTerrainMostDetailed, Viewer } from "cesium";
import { getDegreesFromCartographic } from "@carma-mapping/cesium-engine";

import { updateMarkerPosition } from "./marker";

export const onCesiumClick = async (
  click,
  viewer: Viewer,
  terrainProviderRef,
  markerEntityRef,
  callback
) => {
  const cartesian = viewer.scene.pickPosition(click.position);
  if (cartesian && terrainProviderRef.current) {
    const cartographic = Cartographic.fromCartesian(cartesian);
    const { latitude, longitude } = getDegreesFromCartographic(cartographic);

    const [groundPositionCartographic] = await sampleTerrainMostDetailed(
      terrainProviderRef.current,
      [cartographic]
    );

    updateMarkerPosition(viewer, markerEntityRef, groundPositionCartographic);
    callback([latitude, longitude]);
  }
};
