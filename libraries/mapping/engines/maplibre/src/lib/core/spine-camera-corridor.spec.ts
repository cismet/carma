import { OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { degToRadNumeric } from "@carma-units";
import { WUPPERTAL_CAMERA_CORRIDORS } from "@carma-commons/resources";
import { createCylinderCameraRig } from "./cylinder-camera-rig";
import { createSpineCameraRig } from "./spine-camera-rig";
import { forward } from "./camera-rig.test-support";

describe("spine camera corridor", () => {
  it("constructs finite local bank frustums for the complete sourced Schwebebahn", () => {
    const sections = WUPPERTAL_CAMERA_CORRIDORS.schwebebahn.crossSections;
    const project = ([lon, lat]: number[]) =>
      new Vector3((lon - 7.1) * 70000, 0, -(lat - 51.25) * 111000);
    const views = createSpineCameraRig({
      points: sections.map((section) => project(section.nearBank)),
      closed: false,
      count: 3,
      height: 40,
      offset: 10,
      near: 0.1,
      far: 250,
      clipBeforeSurface: 8,
      side: -1,
      mergeAngleThreshold: degToRadNumeric(3)!,
      corridorFootprint: {
        points: sections.map((section) => project(section.farBank)),
        pairedToSpine: true,
        backPadding: 8,
      },
    });
    expect(views.length).toBeGreaterThan(100);
    for (const view of views) {
      const camera = view.camera as OrthographicCamera;
      expect(camera.far).toBeGreaterThan(camera.near);
      expect(camera.far).toBeLessThan(300);
      expect(camera.projectionMatrix.elements.every(Number.isFinite)).toBe(
        true
      );
    }
  });

  it("fits paired banks locally rather than extending to a distant bend", () => {
    const views = createSpineCameraRig({
      points: [
        new Vector3(0, 0, 0),
        new Vector3(100, 0, 0),
        new Vector3(100, 0, 500),
      ],
      closed: false,
      count: 2,
      height: 40,
      offset: 10,
      near: 0.1,
      far: 600,
      clipBeforeSurface: 8,
      side: -1,
      corridorFootprint: {
        points: [
          new Vector3(0, 0, 20),
          new Vector3(80, 0, 20),
          new Vector3(80, 0, 500),
        ],
        backPadding: 8,
        pairedToSpine: true,
      },
    });
    expect((views[0].camera as OrthographicCamera).far).toBeCloseTo(38);
    expect((views[1].camera as OrthographicCamera).far).toBeCloseTo(38);
  });

  it("looks bank-to-bank and widens depth only for the local crossing", () => {
    const points = [new Vector3(0, 0, 0), new Vector3(100, 0, 0)];
    const boundary = [
      [0, 0],
      [100, 0],
      [100, 40],
      [50, 40],
      [50, 20],
      [0, 20],
    ].map(([x, z]) => new Vector3(x, 0, z));
    const views = createSpineCameraRig({
      points,
      closed: false,
      count: 2,
      height: 40,
      offset: 10,
      near: 0.1,
      far: 250,
      clipBeforeSurface: 8,
      side: -1,
      corridorFootprint: { points: boundary, backPadding: 8 },
    });
    for (const view of views) {
      expect(view.camera.position.z).toBe(-10);
      expect(forward(view.camera as OrthographicCamera).z).toBeCloseTo(1);
      // Both banks are kept; foreground blocks behind the north bank are cut.
      expect(
        view.clipPlanes[0].distanceToPoint(new Vector3(25, 0, 0))
      ).toBeGreaterThan(0);
      expect(
        view.clipPlanes[0].distanceToPoint(new Vector3(25, 0, -9))
      ).toBeLessThan(0);
    }
    // The shared edge at x=50 belongs to both strips. A third narrow strip
    // away from the crossing verifies remote corners do not inflate the far plane.
    expect((views[1].camera as OrthographicCamera).far).toBeCloseTo(58);
    const narrow = createSpineCameraRig({
      points: [points[0], new Vector3(40, 0, 0)],
      closed: false,
      count: 1,
      height: 40,
      offset: 10,
      near: 0.1,
      far: 250,
      clipBeforeSurface: 8,
      side: -1,
      corridorFootprint: { points: boundary, backPadding: 8 },
    });
    expect((narrow[0].camera as OrthographicCamera).far).toBeCloseTo(38);
  });

  const bankRig = (headings: number[], threshold = 3) => {
    const points = [new Vector3()];
    for (const heading of headings) {
      const angle = degToRadNumeric(heading)!;
      points.push(
        points
          .at(-1)!
          .clone()
          .add(new Vector3(10 * Math.cos(angle), 0, 10 * Math.sin(angle)))
      );
    }
    return createSpineCameraRig({
      points,
      closed: false,
      count: 1,
      height: 70,
      offset: 10,
      near: 0.1,
      far: 300,
      clipBeforeSurface: 0,
      side: 1,
      mergeAngleThreshold: degToRadNumeric(threshold)!,
    });
  };

  it("gives each bank bend over three degrees its own camera", () => {
    const views = bankRig([0, 0, 3.1, 3.1, 7.2]);
    expect(views).toHaveLength(3);
    [20, 20, 10].forEach((width, index) =>
      expect(views[index].stripWidthMeters).toBeCloseTo(width)
    );
    expect(views[0].camera.getWorldDirection(new Vector3()).z).toBeCloseTo(-1);
  });

  it("allows exactly three degrees but splits accumulated smaller turns", () => {
    expect(bankRig([0, 3])).toHaveLength(1);
    expect(bankRig([0, 2, 4, 6, 8])).toHaveLength(3);
    expect(bankRig([0, 2, -2])).toHaveLength(2);
  });

  it("handles heading wrap without losing a sharp turn", () => {
    expect(bankRig([179, -179])).toHaveLength(1);
    expect(bankRig([179, -176])).toHaveLength(2);
    expect(bankRig([0, 180])).toHaveLength(2);
  });

  it("preserves the original edges when angle merging is disabled", () => {
    expect(bankRig([0, 0, 0], 0)).toHaveLength(3);
    expect(() => bankRig([0, 1], -1)).toThrow();
    expect(() => bankRig([0, 1], 90)).toThrow();
  });

  it.each([4, 12, 32])(
    "preserves the vertical panorama window with %i cameras",
    (count) => {
      const views = createCylinderCameraRig({
        center: new Vector3(),
        radius: 10,
        height: 8,
        count,
        mode: "panorama",
        aspect: 2,
        near: 0.1,
        far: 100,
        verticalFieldOfView: Math.PI / 3,
        pitch: -Math.PI / 12,
      });
      const first = views[0].camera as PerspectiveCamera;
      expect(first.fov).toBeCloseTo(60);
      expect(2 * Math.atan(first.aspect * Math.tan(Math.PI / 6))).toBeCloseTo(
        (2 * Math.PI) / count
      );
      // Adjacent sides share exactly the same rays, including above/below the
      // horizon. Independently pitched cameras would fail this seam check.
      const second = views[1].camera as PerspectiveCamera;
      for (const y of [-1, 0, 1]) {
        const edge = new Vector3(1, y, 0).unproject(first).normalize();
        const nextEdge = new Vector3(-1, y, 0).unproject(second).normalize();
        expect(edge.distanceTo(nextEdge)).toBeLessThan(1e-10);
      }
      expect(views[0].imagePlaneVerticalOffset).toBeCloseTo(
        10 * Math.tan(-Math.PI / 12)
      );
      const centerRay = new Vector3(0, 0, 0).unproject(first).normalize();
      expect(Math.asin(centerRay.y)).toBeCloseTo(-Math.PI / 12);
      const pitch = -Math.PI / 12;
      const nominalHalfFov = Math.PI / 6;
      const bottomRay = new Vector3(0, -1, 0).unproject(first).normalize();
      const topRay = new Vector3(0, 1, 0).unproject(first).normalize();
      expect(Math.asin(bottomRay.y)).toBeCloseTo(
        Math.atan(Math.tan(pitch) - Math.tan(nominalHalfFov))
      );
      expect(Math.asin(topRay.y)).toBeCloseTo(
        Math.atan(Math.tan(pitch) + Math.tan(nominalHalfFov))
      );
      const horizon = new Vector3(10, 0, 0).project(first);
      expect(Math.abs(horizon.y)).toBeLessThan(1);
    }
  );
});
