import { CAMERA_TYPE } from "@carma-commons/camera/model";
import { describe, expect, it } from "vitest";
import { readSceneCameraIntrinsics } from "./Intrinsics";

describe("readSceneCameraIntrinsics", () => {
  it("marks Cesium scene cameras as perspective intrinsics", () => {
    const intrinsics = readSceneCameraIntrinsics({
      camera: {
        frustum: {
          fovy: 0.5,
          aspectRatio: 1.5,
          near: 0.1,
          far: 1000,
        },
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
});
