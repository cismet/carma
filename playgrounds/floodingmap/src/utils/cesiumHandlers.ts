import {
  Cartographic,
  Math as CesiumMath,
  sampleTerrainMostDetailed,
  Viewer,
} from "cesium";
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
    const lat = CesiumMath.toDegrees(cartographic.latitude);
    const lon = CesiumMath.toDegrees(cartographic.longitude);
    const [groundPositionCartographic] = await sampleTerrainMostDetailed(
      terrainProviderRef.current,
      [cartographic]
    );

    updateMarkerPosition(viewer, markerEntityRef, groundPositionCartographic);
    callback([lat, lon]);
  }
};
