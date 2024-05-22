import * as Cesium from 'cesium';

export const lockPosition = async (viewer: Cesium.Viewer) => {
  const { center, camera, cameraHeight } = await getAll(viewer);
  const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
  // viewer.scene.camera.lookAtTransform(
  //   transform,
  //   new Cesium.HeadingPitchRange(0, -Math.PI / 4, cameraHeight - 150)
  // );

  viewer.scene.camera.lookAt(
    center,
    // new Cesium.HeadingPitchRange(0, -Math.PI / 4, cameraHeight)
    new Cesium.HeadingPitchRange(camera.heading, camera.pitch, cameraHeight)
  );

  const debugPrimitive = new Cesium.DebugModelMatrixPrimitive({
    modelMatrix: transform,
    length: 100000.0,
  });
  
  viewer.scene.primitives.add(debugPrimitive);
};

export const unlockPosition = async (viewer) => {
  viewer.scene.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  if (viewer.debugPrimitive) {
    viewer.scene.primitives.remove(viewer.debugPrimitive);
    viewer.debugPrimitive = undefined;
  }
};

export const getAll = async (viewer: Cesium.Viewer) => {
  const camera = viewer.camera;

  const ellipsoid = viewer.scene.mapProjection.ellipsoid;

  const windowPosition = new Cesium.Cartesian2(
    viewer.container.clientWidth / 2,
    viewer.container.clientHeight / 2
  );
  const cameraHeight = ellipsoid.cartesianToCartographic(
    camera.positionWC
  ).height;

  /*
  // we dont have terrain by default
  const pickRay = viewer.scene.camera.getPickRay(windowPosition);
  const pickPosition = viewer.scene.globe.pick(pickRay, viewer.scene);
  const pickPositionCartographic =
    viewer.scene.globe.ellipsoid.cartesianToCartographic(pickPosition);
  const lat = pickPositionCartographic.latitude * (180 / Math.PI);
  const lng = pickPositionCartographic.longitude * (180 / Math.PI);
  const positions = [Cesium.Cartographic.fromDegrees(lng, lat)];
  const heights = await Cesium.sampleTerrainMostDetailed(
    viewer.terrainProvider,
    positions
  );
  console.log('heights', heights[0].height);

  const terrainHeight = heights[0].height;
  const center = Cesium.Cartesian3.fromDegrees(lng, lat, terrainHeight);
*/

  // Get the position on the mesh
  const center = viewer.scene.pickPosition(windowPosition);

  const height = ellipsoid.cartesianToCartographic(center).height;

  console.log('height', height);

  // Convert the position to cartographic coordinates to get the height
  const cartographicPosition = Cesium.Cartographic.fromCartesian(center);

  const lat = cartographicPosition.latitude * (180 / Math.PI);
  const lng = cartographicPosition.longitude * (180 / Math.PI);

  return {
    camera,
    ellipsoid,
    windowPosition,
    cameraHeight,
    center,
    lat,
    lng,
  };
};
