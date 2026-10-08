import { Matrix4, PerspectiveCamera, Vector3, Vector4 } from "three";
import { TWO_PI, type CssPixels, type Milliseconds } from "@carma-units";
import { describe, expect, it } from "vitest";

import {
  QUERY_CURSOR_DEFAULTS,
  createQueryCursorNormalSmoother,
  orientNormalTowardViewer,
  queryCursorRingMatrix,
  screenConstantRingRadius,
  surfaceNormalFromNeighbours,
} from "./query-cursor";

const viewport = { width: 1200, height: 800 };
const UP = new Vector3(0, 1, 0);

const sceneToClipOf = (position: Vector3, target = new Vector3()) => {
  const camera = new PerspectiveCamera(
    50,
    viewport.width / viewport.height,
    0.1,
    100_000
  );
  camera.position.copy(position);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return new Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse
  );
};

const toCss = (point: Vector3, sceneToClip: Matrix4) => {
  const clip = new Vector4(point.x, point.y, point.z, 1).applyMatrix4(
    sceneToClip
  );
  return {
    x: ((clip.x / clip.w + 1) / 2) * viewport.width,
    y: ((1 - clip.y / clip.w) / 2) * viewport.height,
  };
};

/** Largest projected distance of the ring outline from its projected centre. */
const projectedRadius = (
  center: Vector3,
  normal: Vector3,
  radius: number,
  sceneToClip: Matrix4
) => {
  const matrix = queryCursorRingMatrix(center, normal, radius);
  const anchor = toCss(center, sceneToClip);
  let max = 0;
  for (let index = 0; index < 360; index++) {
    const angle = (index / 360) * TWO_PI;
    const outline = new Vector3(
      Math.cos(angle),
      Math.sin(angle),
      0
    ).applyMatrix4(matrix);
    const css = toCss(outline, sceneToClip);
    max = Math.max(max, Math.hypot(css.x - anchor.x, css.y - anchor.y));
  }
  return max;
};

describe("surfaceNormalFromNeighbours", () => {
  it("spans the tangent plane of a flat ground with an upward normal", () => {
    // y-up scene; screen right = +x, screen down = +z for a camera looking north-down.
    const normal = surfaceNormalFromNeighbours(
      new Vector3(),
      {
        right: new Vector3(1, 0, 0),
        left: new Vector3(-1, 0, 0),
        up: new Vector3(0, 0, -1),
        down: new Vector3(0, 0, 1),
      },
      UP
    );
    expect(normal?.toArray()).toEqual(
      [0, 1, 0].map((value) => expect.closeTo(value, 9))
    );
  });

  it("follows a tilted roof and stays on the upper side", () => {
    // Roof rising 1 m per metre toward +x.
    const normal = surfaceNormalFromNeighbours(
      new Vector3(),
      {
        right: new Vector3(1, 1, 0),
        left: new Vector3(-1, -1, 0),
        up: new Vector3(0, 0, 1),
        down: new Vector3(0, 0, -1),
      },
      UP
    )!;
    expect(normal.dot(UP)).toBeGreaterThan(0);
    expect(normal.x).toBeCloseTo(-Math.SQRT1_2, 9);
    expect(normal.y).toBeCloseTo(Math.SQRT1_2, 9);
    expect(normal.length()).toBeCloseTo(1, 12);
  });

  it("falls back to one-sided differences and rejects degenerate picks", () => {
    const center = new Vector3(5, 2, 5);
    const oneSided = surfaceNormalFromNeighbours(
      center,
      {
        right: new Vector3(6, 2, 5),
        left: null,
        up: null,
        down: new Vector3(5, 2, 6),
      },
      UP
    );
    expect(oneSided?.y).toBeCloseTo(1, 9);
    expect(
      surfaceNormalFromNeighbours(
        center,
        { right: null, left: null, up: null, down: new Vector3(5, 2, 6) },
        UP
      )
    ).toBeNull();
    expect(
      surfaceNormalFromNeighbours(
        center,
        {
          right: new Vector3(6, 2, 5),
          left: new Vector3(4, 2, 5),
          up: new Vector3(7, 2, 5),
          down: new Vector3(3, 2, 5),
        },
        UP
      )
    ).toBeNull();
  });
});

describe("orientNormalTowardViewer", () => {
  it("turns a wall normal toward the camera", () => {
    const sceneToClip = sceneToClipOf(new Vector3(0, 10, 100));
    expect(orientNormalTowardViewer(new Vector3(0, 0, -1), sceneToClip).z).toBe(
      1
    );
    expect(orientNormalTowardViewer(new Vector3(0, 0, 1), sceneToClip).z).toBe(
      1
    );
  });
});

describe("screenConstantRingRadius", () => {
  it("keeps the projected radius at the target size", () => {
    const sceneToClip = sceneToClipOf(new Vector3(0, 150, 200));
    const center = new Vector3(10, 0, -20);
    const radius = screenConstantRingRadius({
      center,
      normal: UP,
      sceneToClip,
      viewport,
    })!;
    expect(radius).toBeGreaterThan(0);
    // The radius is fitted on 16 outline samples; the dense outline may exceed it slightly.
    const projected = projectedRadius(center, UP, radius, sceneToClip);
    expect(
      Math.abs(projected - QUERY_CURSOR_DEFAULTS.targetScreenRadius) /
        QUERY_CURSOR_DEFAULTS.targetScreenRadius
    ).toBeLessThan(0.02);
  });

  it("grows the scene radius with distance so the screen size stays constant", () => {
    const near = screenConstantRingRadius({
      center: new Vector3(),
      normal: UP,
      sceneToClip: sceneToClipOf(new Vector3(0, 100, 100)),
      viewport,
      targetScreenRadius: 20 as CssPixels,
    })!;
    const far = screenConstantRingRadius({
      center: new Vector3(),
      normal: UP,
      sceneToClip: sceneToClipOf(new Vector3(0, 200, 200)),
      viewport,
      targetScreenRadius: 20 as CssPixels,
    })!;
    expect(far / near).toBeCloseTo(2, 2);
  });

  it("returns null behind the camera", () => {
    const sceneToClip = sceneToClipOf(
      new Vector3(0, 10, 0),
      new Vector3(0, 10, -1)
    );
    expect(
      screenConstantRingRadius({
        center: new Vector3(0, 10, 50),
        normal: UP,
        sceneToClip,
        viewport,
      })
    ).toBeNull();
  });
});

describe("queryCursorRingMatrix", () => {
  it("builds a right-handed basis with the normal as ring axis", () => {
    const normal = new Vector3(1, 2, 0.5).normalize();
    const center = new Vector3(3, 4, 5);
    const matrix = queryCursorRingMatrix(center, normal, 2.5);
    const x = new Vector3();
    const y = new Vector3();
    const z = new Vector3();
    matrix.extractBasis(x, y, z);
    expect(z.clone().normalize().dot(normal)).toBeCloseTo(1, 12);
    expect(x.length()).toBeCloseTo(2.5, 12);
    expect(y.length()).toBeCloseTo(2.5, 12);
    expect(x.dot(y)).toBeCloseTo(0, 12);
    expect(x.dot(z)).toBeCloseTo(0, 12);
    expect(matrix.determinant()).toBeGreaterThan(0);
    expect(new Vector3().setFromMatrixPosition(matrix).toArray()).toEqual([
      3, 4, 5,
    ]);
  });

  it("handles a normal along the basis reference axis", () => {
    const matrix = queryCursorRingMatrix(
      new Vector3(),
      new Vector3(0, 0, 1),
      1
    );
    expect(matrix.determinant()).toBeCloseTo(1, 12);
  });
});

describe("createQueryCursorNormalSmoother", () => {
  const tilted = new Vector3(1, 1, 0).normalize();

  it("returns the fallback without samples and the newest sample when alone", () => {
    const smoother = createQueryCursorNormalSmoother();
    expect(smoother.average(UP, 0).toArray()).toEqual([0, 1, 0]);
    smoother.push(tilted, 0);
    expect(smoother.average(UP, 0).dot(tilted)).toBeCloseTo(1, 12);
    expect(smoother.isSettled(0)).toBe(true);
  });

  it("blends the trail and settles on the newest normal after the window", () => {
    const smoother = createQueryCursorNormalSmoother({
      trailWindow: 500 as Milliseconds,
      weightDecayGamma: 1,
    });
    smoother.push(UP, 0);
    smoother.push(tilted, 250);
    const blended = smoother.average(tilted, 250);
    expect(blended.dot(tilted)).toBeLessThan(0.999);
    expect(blended.dot(UP)).toBeLessThan(0.999);
    expect(smoother.isSettled(250)).toBe(false);
    expect(smoother.isSettled(751)).toBe(true);
    expect(smoother.average(tilted, 751).dot(tilted)).toBeCloseTo(1, 12);
  });

  it("orients flipped samples to the trail and caps the sample count", () => {
    const smoother = createQueryCursorNormalSmoother({ sampleCount: 2 });
    smoother.push(UP, 0);
    smoother.push(UP.clone().negate(), 1);
    expect(smoother.latest()?.y).toBe(1);
    smoother.push(tilted, 2);
    smoother.reset();
    expect(smoother.latest()).toBeNull();
  });
});
