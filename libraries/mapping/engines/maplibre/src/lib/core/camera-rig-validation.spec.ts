import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createCylinderCameraRig } from "./cylinder-camera-rig";
import { createSpineCameraRig, sampleSpine } from "./spine-camera-rig";

describe("camera rig validation", () => {
  it("rejects invalid counts, ranges, and degenerate spines", () => {
    expect(() =>
      createCylinderCameraRig({
        center: new Vector3(),
        radius: 1,
        height: 1,
        count: 2,
        mode: "panorama",
        aspect: 1,
        near: 1,
        far: 2,
      })
    ).toThrow();
    expect(() =>
      createSpineCameraRig({
        points: [new Vector3(), new Vector3()],
        closed: false,
        count: 1,
        height: 1,
        offset: 1,
        near: 0.1,
        far: 2,
        clipBeforeSurface: 0.1,
        side: 1,
      })
    ).toThrow();
    expect(() =>
      sampleSpine([new Vector3(), new Vector3(1, 0, 0)], false, NaN)
    ).toThrow();
  });
});
