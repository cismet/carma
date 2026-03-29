import { CAMERA_TYPE } from "@carma-commons/camera/model";
import { describe, expect, it } from "vitest";
import {
  OrthographicFrustum,
  OrthographicOffCenterFrustum,
  PerspectiveFrustum,
} from "../../cesium";
import { readSceneCameraIntrinsics } from "./Intrinsics";

describe("readSceneCameraIntrinsics", () => {
  it("reads perspective Cesium frusta as perspective intrinsics", () => {
    const frustum = new PerspectiveFrustum();
    frustum.aspectRatio = 1.5;
    frustum.fov = Math.atan(Math.tan(0.5 * 0.5) * frustum.aspectRatio) * 2;
    frustum.near = 0.1;
    frustum.far = 1000;

    const intrinsics = readSceneCameraIntrinsics({
      camera: {
        frustum,
      },
    });

    expect(intrinsics.type).toBe(CAMERA_TYPE.PERSPECTIVE);
    expect(intrinsics.fov).toBeCloseTo(0.5, 8);
    expect(intrinsics.fovHorizontal).toBeCloseTo(
      Math.atan(Math.tan(0.5 * 0.5) * 1.5) * 2,
      8
    );
    expect(intrinsics.frustum).toEqual({
      near: 0.1,
      far: 1000,
    });
  });

  it("reads orthographic Cesium frusta as orthographic intrinsics", () => {
    const frustum = new OrthographicFrustum();
    frustum.width = 900;
    frustum.aspectRatio = 1.5;
    frustum.near = 10;
    frustum.far = 2000;

    const intrinsics = readSceneCameraIntrinsics({
      camera: {
        frustum,
      },
      canvas: {
        clientWidth: 600,
        clientHeight: 400,
      },
    });

    expect(intrinsics.type).toBe(CAMERA_TYPE.ORTHOGRAPHIC);
    expect(intrinsics.orthographicScale?.metersPerCssPixel).toBeCloseTo(1.5, 8);
    expect(intrinsics.frustum).toEqual({
      near: 10,
      far: 2000,
    });
  });

  it("reads off-center orthographic Cesium frusta as orthographic intrinsics", () => {
    const frustum = new OrthographicOffCenterFrustum();
    frustum.left = -450;
    frustum.right = 450;
    frustum.top = 300;
    frustum.bottom = -300;
    frustum.near = 5;
    frustum.far = 1500;

    const intrinsics = readSceneCameraIntrinsics({
      camera: {
        frustum,
      },
      canvas: {
        clientWidth: 600,
        clientHeight: 400,
      },
    });

    expect(intrinsics.type).toBe(CAMERA_TYPE.ORTHOGRAPHIC);
    expect(intrinsics.orthographicScale?.metersPerCssPixel).toBeCloseTo(1.5, 8);
    expect(intrinsics.frustum).toEqual({
      near: 5,
      far: 1500,
    });
  });
});
