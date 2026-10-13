import { describe, expect, it } from "vitest";
import {
  scoreCalibratedCameraAxis,
  type CalibratedCameraAxis,
} from "./calibrated-camera-axis";

const camera = (): CalibratedCameraAxis => ({
  sceneToImage: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0] },
  eye: { x: 0, y: 0, z: 0 },
  direction: { x: 0, y: 0, z: 1 },
});

describe("calibrated camera axis score", () => {
  it.each([
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
    [0.25, 0.75],
  ])(
    "includes sensor edges without shifting bottom-left UV (%s,%s)",
    (x, y) => {
      const point = { x, y, z: 1 };
      expect(scoreCalibratedCameraAxis(camera(), point)).toBe(
        1 / Math.sqrt(x * x + y * y + 1)
      );
    }
  );

  it.each([
    { x: -1e-10, y: 0, z: 1 },
    { x: 1 + 1e-10, y: 0, z: 1 },
    { x: 0, y: -1e-10, z: 1 },
    { x: 0, y: 1 + 1e-10, z: 1 },
    { x: 0, y: 0, z: -1 },
    { x: 0, y: 0, z: 0 },
    { x: NaN, y: 0, z: 1 },
    { x: Infinity, y: 0, z: 1 },
    { x: 0, y: 0, z: Number.MAX_VALUE },
  ])(
    "rejects uncovered, behind, zero, non-finite or overflowing rays %j",
    (point) => {
      expect(scoreCalibratedCameraAxis(camera(), point)).toBeNull();
    }
  );

  it("is independent of direction length and retains outward negative cosine", () => {
    expect(
      scoreCalibratedCameraAxis(
        { ...camera(), direction: { x: 0, y: 0, z: 7 } },
        { x: 0, y: 0, z: 1 }
      )
    ).toBe(1);
    expect(
      scoreCalibratedCameraAxis(
        { ...camera(), direction: { x: 0, y: 0, z: -7 } },
        { x: 0, y: 0, z: 1 }
      )
    ).toBe(-1);
  });

  it("uses all homogeneous matrix components and camera translation", () => {
    const site = camera();
    const elements = [...site.sceneToImage.elements];
    elements[12] = 0.5;
    elements[13] = -0.5;
    expect(
      scoreCalibratedCameraAxis(
        { ...site, sceneToImage: { elements }, eye: { x: -0.5, y: 0.5, z: 0 } },
        { x: -0.5, y: 0.5, z: 1 }
      )
    ).toBe(1);
    elements[13] = -0.5001;
    expect(
      scoreCalibratedCameraAxis(
        { ...site, sceneToImage: { elements } },
        { x: -0.5, y: 0.5, z: 1 }
      )
    ).toBeNull();
  });

  it("rejects invalid calibration and direction values even in the unused z row", () => {
    const site = camera();
    const point = { x: 0, y: 0, z: 1 };
    const elements = [...site.sceneToImage.elements];
    elements[2] = NaN;
    expect(
      scoreCalibratedCameraAxis({ ...site, sceneToImage: { elements } }, point)
    ).toBeNull();
    expect(
      scoreCalibratedCameraAxis(
        { ...site, sceneToImage: { elements: [] } },
        point
      )
    ).toBeNull();
    expect(
      scoreCalibratedCameraAxis(
        { ...site, eye: { x: 0, y: Infinity, z: 0 } },
        point
      )
    ).toBeNull();
    expect(
      scoreCalibratedCameraAxis(
        { ...site, direction: { x: 0, y: 0, z: 0 } },
        point
      )
    ).toBeNull();
  });
});
