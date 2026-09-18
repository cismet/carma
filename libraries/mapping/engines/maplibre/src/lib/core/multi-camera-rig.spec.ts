import { OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { degToRadNumeric } from "@carma-units";
import { WUPPERTAL_CAMERA_CORRIDORS } from "@carma-commons/resources";

import {
  createCylinderCameraRig,
  createSpineCameraRig,
  getCameraStripLayout,
  sampleSpine,
} from "./multi-camera-rig";

const forward = (camera: PerspectiveCamera | OrthographicCamera) =>
  camera.getWorldDirection(new Vector3());

describe("multi camera rigs", () => {
  const referenceEdge = (
    view: ReturnType<typeof createSpineCameraRig>[number],
    sign: number
  ) => {
    const camera = view.camera as OrthographicCamera;
    return camera.position
      .clone()
      .addScaledVector(forward(camera), view.distance)
      .addScaledVector(
        new Vector3(1, 0, 0).applyQuaternion(camera.quaternion),
        (sign * (camera.right - camera.left)) / 2
      );
  };

  it.each([1, -1] as const)(
    "joins reference panels at a bend, on side %s",
    (side) => {
      const views = createSpineCameraRig({
        points: [
          new Vector3(),
          new Vector3(100, 0, 0),
          new Vector3(100, 0, 100),
        ],
        closed: false,
        count: 4,
        height: 20,
        offset: 20,
        near: 0.1,
        far: 100,
        clipBeforeSurface: 0,
        side,
        referenceSurfaceOffset: [10, 15],
        screenOrder: true,
      });
      for (let index = 1; index < views.length; index++)
        expect(
          referenceEdge(views[index - 1], 1).distanceTo(
            referenceEdge(views[index], -1)
          )
        ).toBeLessThan(1e-10);
      expect(views.map(({ distance }) => distance).sort()).toEqual([
        30, 30, 35, 35,
      ]);
      for (const view of views) {
        for (const sign of [-1, 1]) {
          const projected = referenceEdge(view, sign).project(view.camera);
          expect(projected.x).toBeCloseTo(sign);
          expect(Math.abs(projected.z)).toBeLessThan(1);
        }
      }
    }
  );

  it("closes the offset reference wall at the wrap seam", () => {
    const views = createSpineCameraRig({
      points: [
        new Vector3(),
        new Vector3(100, 0, 0),
        new Vector3(100, 0, 100),
        new Vector3(0, 0, 100),
      ],
      closed: true,
      count: 4,
      height: 20,
      offset: 20,
      near: 0.1,
      far: 100,
      clipBeforeSurface: 0,
      side: 1,
      referenceSurfaceOffset: 10,
    });
    for (let index = 0; index < views.length; index++)
      expect(
        referenceEdge(views[index], 1).distanceTo(
          referenceEdge(views[(index + 1) % views.length], -1)
        )
      ).toBeLessThan(1e-10);
  });

  it("changes reference framing without moving the foreground cut", () => {
    const options = {
      points: [new Vector3(), new Vector3(100, 0, 0)],
      closed: false,
      count: 1,
      height: 20,
      offset: 20,
      near: 0.1,
      far: 100,
      clipBeforeSurface: 4,
      side: 1 as const,
    };
    const [original] = createSpineCameraRig(options);
    const [shifted] = createSpineCameraRig({
      ...options,
      referenceSurfaceOffset: 10,
    });
    expect(shifted.clipPlanes[0].equals(original.clipPlanes[0])).toBe(true);
    expect(shifted.distance).toBe(original.distance + 10);
    expect(
      shifted.camera.position.distanceTo(original.camera.position)
    ).toBeLessThan(1e-12);
  });

  it("rejects incompatible, folded and out-of-frustum reference surfaces", () => {
    const options = {
      points: [new Vector3(), new Vector3(10, 0, 0), new Vector3(10, 0, 10)],
      closed: false,
      count: 2,
      height: 20,
      offset: 20,
      near: 0.1,
      far: 100,
      clipBeforeSurface: 0,
      side: -1 as const,
    };
    expect(() =>
      createSpineCameraRig({ ...options, referenceSurfaceOffset: 15 })
    ).toThrow("folds");
    expect(() =>
      createSpineCameraRig({ ...options, referenceSurfaceOffset: -30 })
    ).toThrow("between near and far");
    expect(() =>
      createSpineCameraRig({ ...options, referenceSurfaceOffset: [1] })
    ).toThrow("one finite offset");
    expect(() =>
      createSpineCameraRig({ ...options, referenceSurfaceOffset: NaN })
    ).toThrow("one finite offset");
    expect(() =>
      createSpineCameraRig({
        ...options,
        points: [new Vector3(), new Vector3(10, 0, 0), new Vector3(20, 0, 0)],
        referenceSurfaceOffset: [1, 2],
      })
    ).toThrow("Parallel");
  });
  it.each([1, -1] as const)(
    "unfolds the opposite facade downward with side %s above",
    (side) => {
      const options = {
        points: [new Vector3(0, 0, 0), new Vector3(100, 0, 0)],
        closed: false,
        count: 2,
        height: 30,
        offset: 10,
        near: 0.1,
        far: 100,
        clipBeforeSurface: 0,
        screenOrder: true,
      };
      const upper = createSpineCameraRig({ ...options, side });
      const lower = createSpineCameraRig({
        ...options,
        side: side === 1 ? -1 : 1,
        upsideDown: true,
      });
      upper.forEach((view, index) => {
        const opposite = lower[index].camera;
        expect(opposite.position.x).toBeCloseTo(view.camera.position.x);
        const axis = (camera: typeof opposite, x: number, y: number) =>
          new Vector3(x, y, 0).applyQuaternion(camera.quaternion);
        expect(axis(view.camera, 1, 0).dot(axis(opposite, 1, 0))).toBeCloseTo(
          1
        );
        expect(axis(view.camera, 0, 1).dot(axis(opposite, 0, 1))).toBeCloseTo(
          -1
        );
        expect(forward(view.camera).dot(forward(opposite))).toBeCloseTo(-1);
        expect(opposite.matrixWorld.determinant()).toBeCloseTo(1);
      });
    }
  );
  it("orders an opposite-facing open strip continuously in screen space", () => {
    const views = createSpineCameraRig({
      points: [new Vector3(0, 0, 0), new Vector3(100, 0, 0)],
      closed: false,
      count: 2,
      height: 30,
      offset: 10,
      near: 0.1,
      far: 100,
      clipBeforeSurface: 0,
      side: -1,
      screenOrder: true,
    });
    expect(views.map((view) => view.camera.position.x)).toEqual([75, 25]);
    const right = new Vector3(1, 0, 0).applyQuaternion(
      views[0].camera.quaternion
    );
    expect(right.x).toBeCloseTo(-1);
  });
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

  const square = [
    new Vector3(0, 0, 0),
    new Vector3(10, 0, 0),
    new Vector3(10, 0, 10),
    new Vector3(0, 0, 10),
  ];
  const footprintRig = (points = square, count = 16, clearance = 3) =>
    createSpineCameraRig({
      points,
      closed: true,
      count,
      height: 20,
      offset: 20,
      near: 0.1,
      far: 300,
      clipBeforeSurface: 0,
      side: 1,
      closedFootprint: { clearance, backPadding: 3 },
    });

  it.each([false, true])(
    "offsets every hull edge outward for reversed=%s",
    (reverse) => {
      const views = footprintRig(
        reverse ? [...square].reverse() : square,
        16,
        2
      );
      for (const view of views) {
        // Clipping/image plane is at least 2 m outside every original point.
        expect(
          Math.min(
            ...square.map((point) => view.clipPlanes[0].distanceToPoint(point))
          )
        ).toBeCloseTo(2);
        expect(
          view.clipPlanes[0].distanceToPoint(view.camera.position)
        ).toBeCloseTo(-20);
        expect(view.camera.far).toBeCloseTo(20 + 2 + 10 + 3);
      }
      for (const point of square) {
        expect(
          views.some(({ camera }) => {
            const ndc = point.clone().project(camera);
            return (
              Math.abs(ndc.x) <= 1 + 1e-8 &&
              Math.abs(ndc.y) <= 1 &&
              Math.abs(ndc.z) <= 1
            );
          })
        ).toBe(true);
      }
    }
  );

  it("keeps the buffered outline closed at adjacent camera-strip seams", () => {
    const views = footprintRig();
    const edgePoint = (index: number, right: boolean) => {
      const { camera, distance } = views[index];
      const ortho = camera as OrthographicCamera;
      return new Vector3(
        right ? ortho.right : ortho.left,
        0,
        -distance
      ).applyMatrix4(camera.matrixWorld);
    };
    for (let index = 0; index < views.length; index++) {
      expect(
        edgePoint(index, true).distanceTo(
          edgePoint((index + 1) % views.length, false)
        )
      ).toBeLessThan(1e-8);
    }
  });

  it("normalizes closed and consecutive duplicate vertices and accepts collinear edges", () => {
    const points = [
      square[0],
      square[0],
      new Vector3(5, 0, 0),
      ...square.slice(1),
      square[0],
    ];
    const views = footprintRig(points);
    expect(views).toHaveLength(16);
    expect(
      views.every(
        ({ camera }) => Number.isFinite(camera.far) && camera.far <= 36
      )
    ).toBe(true);
    expect(
      footprintRig(square)
        .map((view) => view.camera.far)
        .sort()
    ).toEqual(
      footprintRig([...square].reverse())
        .map((view) => view.camera.far)
        .sort()
    );
  });

  it("fits far from clipped edge intersections, not only vertices inside the strip", () => {
    const triangle = [
      new Vector3(0, 0, 0),
      new Vector3(10, 0, 0),
      new Vector3(5, 0, 10),
    ];
    const views = footprintRig(triangle, 40);
    const selected = views.find(({ camera }) => {
      const width = (camera as OrthographicCamera).right;
      return (
        forward(camera).z > 0.99 &&
        camera.position.x - width > 0 &&
        camera.position.x + width < 5
      );
    })!;
    expect(selected).toBeDefined();
    const camera = selected.camera as OrthographicCamera;
    const deepestX = camera.position.x + camera.right;
    expect(camera.far).toBeCloseTo(20 + 3 + deepestX * 2 + 3);
    expect(camera.far).toBeLessThan(36);
  });

  it("bounds margin-only strips instead of loading distant neighbours", () => {
    const views = footprintRig(square, 64);
    const empty = views.filter(({ camera }) => camera.far < 30);
    expect(empty.length).toBeGreaterThan(0);
    for (const { camera } of empty) expect(camera.far).toBeCloseTo(26);
  });

  it("rejects insufficient clearance and non-convex or degenerate footprints", () => {
    expect(() => footprintRig(square, 4, 1.99)).toThrow("at least 2 m");
    expect(() =>
      footprintRig([new Vector3(), new Vector3(1, 0, 0), new Vector3(2, 0, 0)])
    ).toThrow("zero area");
    expect(() =>
      footprintRig([
        ...square.slice(0, 2),
        new Vector3(2, 0, 2),
        ...square.slice(2),
      ])
    ).toThrow("convex");
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

  it("fits a whole facade and roof window including vertical padding", () => {
    const views = createSpineCameraRig({
      points: [new Vector3(0, 155, 0), new Vector3(12, 162, 0)],
      closed: false,
      count: 3,
      height: 8,
      offset: 5,
      near: 0.1,
      far: 100,
      clipBeforeSurface: 0,
      side: 1,
      verticalRange: [154, 225],
      verticalPadding: 5,
    });
    for (const { camera } of views) {
      expect(camera.position.y).toBe(189.5);
      expect((camera as OrthographicCamera).top).toBe(40.5);
      for (const elevation of [154, 225]) {
        const projected = new Vector3(camera.position.x, elevation, 0).project(
          camera
        );
        expect(Math.abs(projected.y)).toBeLessThan(1);
      }
    }
  });

  it.each([undefined, 145])(
    "keeps one wall baseline despite varying source heights (override %s)",
    (baselineElevation) => {
      const views = createSpineCameraRig({
        points: [new Vector3(0, 100, 0), new Vector3(12, 160, 0)],
        closed: false,
        count: 3,
        height: 70,
        offset: 5,
        near: 0.1,
        far: 100,
        clipBeforeSurface: 0,
        side: 1,
        verticalPadding: 5,
        baselineElevation,
      });
      expect(views.map(({ camera }) => camera.position.y)).toEqual([
        baselineElevation ?? 100,
        baselineElevation ?? 100,
        baselineElevation ?? 100,
      ]);
      for (const view of views) {
        const projected = new Vector3(
          view.camera.position.x,
          baselineElevation ?? 100,
          0
        ).project(view.camera);
        expect(projected.y).toBeCloseTo(0);
        expect(forward(view.camera).y).toBeCloseTo(0);
      }
      expect(
        views.every(({ camera }) => (camera as OrthographicCamera).top === 40)
      ).toBe(true);
    }
  );

  it("creates a no-parallax panorama with outward cameras", () => {
    const center = new Vector3(3, 4, 5);
    const views = createCylinderCameraRig({
      center,
      radius: 10,
      height: 8,
      count: 4,
      mode: "panorama",
      aspect: 2,
      near: 0.1,
      far: 100,
    });
    expect(views).toHaveLength(4);
    expect(
      views.every(({ camera }) => camera instanceof PerspectiveCamera)
    ).toBe(true);
    expect(views.every(({ camera }) => camera.position.equals(center))).toBe(
      true
    );
    expect(
      forward(views[0].camera).distanceTo(new Vector3(1, 0, 0))
    ).toBeLessThan(1e-12);
    expect((views[0].camera as PerspectiveCamera).fov).toBeCloseTo(
      (2 * Math.atan(0.5) * 180) / Math.PI
    );
  });

  it("creates inward orthographic cylinder slices", () => {
    const views = createCylinderCameraRig({
      center: new Vector3(),
      radius: 10,
      height: 6,
      count: 4,
      mode: "object-cover",
      aspect: 1,
      near: 0.1,
      far: 100,
    });
    const camera = views[0].camera as OrthographicCamera;
    expect(camera).toBeInstanceOf(OrthographicCamera);
    expect(camera.position).toEqual(new Vector3(10, 0, 0));
    expect(forward(camera).distanceTo(new Vector3(-1, 0, 0))).toBeLessThan(
      1e-12
    );
    expect(camera.right - camera.left).toBeCloseTo(10);
    expect(views[0].distance).toBe(5);
    for (let index = 0; index < views.length; index++)
      expect(
        referenceEdge(views[index], -1).distanceTo(
          referenceEdge(views[(index + 1) % views.length], 1)
        )
      ).toBeLessThan(1e-10);
    expect(
      views[0].clipPlanes[0].distanceToPoint(new Vector3())
    ).toBeGreaterThan(0);
  });

  it("covers a straight open spine without seam gaps", () => {
    const views = createSpineCameraRig({
      points: [new Vector3(0, 2, 0), new Vector3(12, 2, 0)],
      closed: false,
      count: 3,
      height: 8,
      offset: 5,
      near: 0.1,
      far: 100,
      clipBeforeSurface: 0.25,
      side: 1,
    });
    expect(views.map(({ distance }) => distance)).toEqual([5, 5, 5]);
    expect(
      views.map(({ camera }) => [
        (camera as OrthographicCamera).left,
        (camera as OrthographicCamera).right,
      ])
    ).toEqual([
      [-2, 2],
      [-2, 2],
      [-2, 2],
    ]);
    expect(views.map(({ camera }) => camera.position.x)).toEqual([2, 6, 10]);
    expect(views[0].camera.position.z).toBe(5);
    expect(forward(views[0].camera).z).toBe(-1);
  });

  it("wraps closed sampling and ignores coincident adjacent points", () => {
    const points = [
      new Vector3(0, 0, 0),
      new Vector3(4, 0, 0),
      new Vector3(4, 0, 0),
      new Vector3(4, 0, 4),
    ];
    const totalLength = sampleSpine(points, true, 0).totalLength;
    expect(sampleSpine(points, true, totalLength).position).toEqual(
      sampleSpine(points, true, 0).position
    );
    expect(sampleSpine(points, true, -1).position).toEqual(
      sampleSpine(points, true, totalLength - 1).position
    );
    expect(sampleSpine(points, false, 100).position).toEqual(
      new Vector3(4, 0, 4)
    );
  });

  it("places clipping positive behind the surface and negative at the camera", () => {
    const [view] = createSpineCameraRig({
      points: [new Vector3(0, 0, 0), new Vector3(10, 0, 0)],
      closed: false,
      count: 1,
      height: 4,
      offset: 3,
      near: 0.1,
      far: 20,
      clipBeforeSurface: 0.5,
      side: 1,
    });
    const plane = view.clipPlanes[0];
    expect(plane.distanceToPoint(new Vector3(5, 0, -1))).toBeGreaterThan(0);
    expect(plane.distanceToPoint(view.camera.position)).toBeLessThan(0);
  });

  it("supports either spine side and adjustable counts", () => {
    const options = {
      points: [new Vector3(), new Vector3(8, 0, 0)],
      closed: false,
      count: 4,
      height: 4,
      offset: 2,
      near: 0.1,
      far: 10,
      clipBeforeSurface: 0.1,
    } as const;
    const left = createSpineCameraRig({ ...options, side: 1 });
    const right = createSpineCameraRig({ ...options, side: -1 });
    expect(left).toHaveLength(4);
    expect(left[0].camera.position.z).toBe(2);
    expect(right[0].camera.position.z).toBe(-2);
    expect(new Set(left.map(({ id }) => id)).size).toBe(4);
  });

  it("allocates whole strips within facade edges", () => {
    const views = createSpineCameraRig({
      points: [
        new Vector3(0, 0, 0),
        new Vector3(9, 0, 0),
        new Vector3(9, 0, 3),
      ],
      closed: false,
      count: 4,
      height: 4,
      offset: 2,
      near: 0.1,
      far: 10,
      clipBeforeSurface: 0,
      side: 1,
    });
    expect(views).toHaveLength(4);
    expect(views.map(({ stripWidthMeters }) => stripWidthMeters)).toEqual([
      3, 3, 3, 3,
    ]);
    expect(
      views.slice(0, 3).every(({ camera }) => camera.position.z === 2)
    ).toBe(true);
    expect(views[3].camera.position.x).toBe(7);
    expect(
      views[3].clipPlanes[0].distanceToPoint(views[3].camera.position)
    ).toBeLessThan(0);
  });

  it("raises the actual count so every nondegenerate edge has a strip", () => {
    const views = createSpineCameraRig({
      points: [
        new Vector3(0, 0, 0),
        new Vector3(2, 0, 0),
        new Vector3(2, 0, 2),
        new Vector3(4, 0, 2),
      ],
      closed: false,
      count: 1,
      height: 2,
      offset: 1,
      near: 0.1,
      far: 10,
      clipBeforeSurface: 0,
      side: -1,
    });
    expect(views).toHaveLength(3);
  });

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
