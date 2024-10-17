import {
  Transforms,
  Math as CesiumMath,
  Cartographic,
  Cartesian2,
  Matrix4,
  Viewer,
  HeadingPitchRange,
  DebugModelMatrixPrimitive,
} from "cesium";

// TODO move to/intergarte orbit control with cesium helper

export const lockPosition = async (viewer: Viewer) => {
  const { center, camera, cameraHeight } = await getAll(viewer);
  const transform = Transforms.eastNorthUpToFixedFrame(center);
  // viewer.scene.camera.lookAtTransform(
  //   transform,
  //   new Cesium.HeadingPitchRange(0, -Math.PI / 4, cameraHeight - 150)
  // );

  viewer.scene.camera.lookAt(
    center,
    // new Cesium.HeadingPitchRange(0, -Math.PI / 4, cameraHeight)
    new HeadingPitchRange(camera.heading, camera.pitch, cameraHeight),
  );

  /*
  const debugPrimitive = new Cesium.DebugModelMatrixPrimitive({
    modelMatrix: transform,
    length: 100000.0,
  });
  
  viewer.scene.primitives.add(debugPrimitive);
  */
};

export const unlockPosition = async (
  viewer: Viewer & { debugPrimitive?: DebugModelMatrixPrimitive },
) => {
  viewer.scene.camera.lookAtTransform(Matrix4.IDENTITY);
  if (viewer.debugPrimitive) {
    viewer.scene.primitives.remove(viewer.debugPrimitive);
    viewer.debugPrimitive = undefined;
  }
};

export const getAll = async (viewer: Viewer) => {
  const camera = viewer.camera;

  const ellipsoid = viewer.scene.mapProjection.ellipsoid;

  const windowPosition = new Cartesian2(
    viewer.container.clientWidth / 2,
    viewer.container.clientHeight / 2,
  );
  const cameraHeight = ellipsoid.cartesianToCartographic(
    camera.positionWC,
  ).height;

  // Get the position on the mesh
  const center = viewer.scene.pickPosition(windowPosition);

  const height = ellipsoid.cartesianToCartographic(center).height;

  //console.log('height', height);

  // Convert the position to cartographic coordinates to get the height
  const cartographicPosition = Cartographic.fromCartesian(center);

  const lat = CesiumMath.toDegrees(cartographicPosition.latitude);
  const lng = CesiumMath.toDegrees(cartographicPosition.longitude);

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
