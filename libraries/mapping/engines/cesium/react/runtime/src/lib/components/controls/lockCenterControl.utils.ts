import {
  Transforms,
  CesiumMath,
  Cartographic,
  Cartesian2,
  Matrix4,
  HeadingPitchRange,
} from "@carma-cesium";

import type { CesiumRuntime } from "../../CesiumContext";

// TODO move to/intergarte orbit control with cesium helper

type LockableCesiumRuntime = CesiumRuntime & {
  debugPrimitive?: Parameters<
    CesiumRuntime["scene"]["primitives"]["remove"]
  >[0];
};

export const lockPosition = async (runtime: CesiumRuntime) => {
  const { center, camera, cameraHeight } = await getAll(runtime);
  const transform = Transforms.eastNorthUpToFixedFrame(center);

  runtime.scene.camera.lookAt(
    center,
    new HeadingPitchRange(camera.heading, camera.pitch, cameraHeight)
  );

  /*
  const debugPrimitive = new Cesium.DebugModelMatrixPrimitive({
    modelMatrix: transform,
    length: 100000.0,
  });
  
  runtime.scene.primitives.add(debugPrimitive);
  */
};

export const unlockPosition = async (runtime: LockableCesiumRuntime) => {
  runtime.scene.camera.lookAtTransform(Matrix4.IDENTITY);
  if (runtime.debugPrimitive) {
    runtime.scene.primitives.remove(runtime.debugPrimitive);
    runtime.debugPrimitive = undefined;
  }
};

export const getAll = async (runtime: CesiumRuntime) => {
  const camera = runtime.camera;

  const ellipsoid = runtime.scene.mapProjection.ellipsoid;

  const windowPosition = new Cartesian2(
    runtime.container.clientWidth / 2,
    runtime.container.clientHeight / 2
  );
  const cameraHeight = ellipsoid.cartesianToCartographic(
    camera.positionWC
  ).height;

  // Get the position on the mesh
  const center = runtime.scene.pickPosition(windowPosition);

  const height = ellipsoid.cartesianToCartographic(center).height;

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
