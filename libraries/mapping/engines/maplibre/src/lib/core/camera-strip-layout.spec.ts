import { OrthographicCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createCylinderCameraRig } from "./cylinder-camera-rig";
import { createSpineCameraRig } from "./spine-camera-rig";
import { getCameraStripLayout } from "./camera-strip-layout";

describe("camera strip layout", () => {
  it("lays out variable-aspect strips with prefix offsets", () => {
    const views = createSpineCameraRig({
      points: [
        new Vector3(0, 0, 0),
        new Vector3(8, 0, 0),
        new Vector3(8, 0, 2),
      ],
      closed: false,
      count: 3,
      height: 4,
      offset: 2,
      near: 0.1,
      far: 10,
      clipBeforeSurface: 0,
      side: 1,
    });
    const layout = getCameraStripLayout(views, 100, 120);
    expect(layout.width).toBeLessThanOrEqual(120);
    expect(layout.widths.every((width) => width >= 1)).toBe(true);
    expect(layout.offsets).toEqual([
      0,
      layout.widths[0],
      layout.widths[0] + layout.widths[1],
    ]);
    expect(layout.widths[0] / layout.height).toBeCloseTo(1, 1);
    expect(layout.widths[2] / layout.height).toBeCloseTo(0.5, 1);
  });

  it("keeps shrinking eligible widths after wrapping past minimum-width views", () => {
    const views = [0.06, 0.16, 0.43, 1.17, 3.18].map((aspect) => {
      const camera = new OrthographicCamera(0, aspect, 1, 0, 0.1, 10);
      return {
        id: String(aspect),
        camera,
        clipPlanes: [],
        distance: 1,
      };
    });

    const layout = getCameraStripLayout(views, 1);

    expect(layout.width).toBe(5);
    expect(layout.widths).toEqual([1, 1, 1, 1, 1]);
  });

  it("rejects a strip cap that cannot assign one pixel per camera", () => {
    const views = createCylinderCameraRig({
      center: new Vector3(),
      radius: 1,
      height: 1,
      count: 4,
      mode: "panorama",
      aspect: 1,
      near: 0.1,
      far: 2,
    });
    expect(() => getCameraStripLayout(views, 100, 3)).toThrow(
      "smaller than the view count"
    );
  });
});
