import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { Radians } from "@carma-units";

import type { AnnotationEngine } from "@carma-mapping/annotations/core";

import {
  DISC_RADIUS_RESIZE_TRIGGERS,
  createSteppedDiscRadius,
  resolveDiscRadiusForScreenTarget,
  shouldResizeHeldDiscRadius,
} from "./stepped-disc-radius";

const { SCALE_BAND, VIEW_CHANGE } = DISC_RADIUS_RESIZE_TRIGGERS;

/** A camera on the x axis looking along it; the scale falls off with the distance. */
const createFakeEngine = () => {
  const camera = { x: 0 };
  const engine = {
    canvas: { clientWidth: 800, clientHeight: 600 },
    getCameraPose: () => ({
      positionECEF: new Vector3(camera.x, 0, 0),
      directionECEF: new Vector3(1, 0, 0),
      upECEF: new Vector3(0, 0, 1),
      verticalFovRad: 1 as Radians,
    }),
    getScreenPixelsPerMeterAt: (position: Vector3) =>
      1000 / Math.max(1, position.x - camera.x),
  } as unknown as AnnotationEngine;
  return { engine, camera };
};

describe("resolveDiscRadiusForScreenTarget", () => {
  it("shows the target size, on the 1-2-5 diameter series when quantised", () => {
    expect(resolveDiscRadiusForScreenTarget(16, 48, false)).toBe(3);
    expect(resolveDiscRadiusForScreenTarget(16, 48, true)).toBe(2.5);
  });

  it("never goes below a decimetre and is null on a degenerate scale", () => {
    expect(resolveDiscRadiusForScreenTarget(10_000, 48, false)).toBe(0.1);
    expect(resolveDiscRadiusForScreenTarget(0, 48, false)).toBeNull();
    expect(resolveDiscRadiusForScreenTarget(Number.NaN, 48, true)).toBeNull();
  });
});

describe("shouldResizeHeldDiscRadius", () => {
  const held = { viewKey: "a", referenceScale: 10 };

  it("picks a first radius", () => {
    expect(shouldResizeHeldDiscRadius(VIEW_CHANGE, null, held, 2)).toBe(true);
  });

  it("re-picks on a view change only, whatever the scale does", () => {
    expect(
      shouldResizeHeldDiscRadius(
        VIEW_CHANGE,
        held,
        { viewKey: "a", referenceScale: 40 },
        2
      )
    ).toBe(false);
    expect(
      shouldResizeHeldDiscRadius(
        VIEW_CHANGE,
        held,
        { viewKey: "b", referenceScale: 10 },
        2
      )
    ).toBe(true);
  });

  it("re-picks by the scale band only, whatever the view does", () => {
    expect(
      shouldResizeHeldDiscRadius(
        SCALE_BAND,
        held,
        { viewKey: "b", referenceScale: 19 },
        2
      )
    ).toBe(false);
    expect(
      shouldResizeHeldDiscRadius(
        SCALE_BAND,
        held,
        { viewKey: "a", referenceScale: 20 },
        2
      )
    ).toBe(true);
  });
});

describe("createSteppedDiscRadius", () => {
  const options = {
    stepFactor: 2,
    targetScreenRadiusCssPx: 50,
    quantize: false,
    fallbackRadiusMeters: 3,
  };

  it("holds the world radius while the pointer moves near and far under one view", () => {
    const { engine } = createFakeEngine();
    const radius = createSteppedDiscRadius({
      engine,
      ...options,
      trigger: VIEW_CHANGE,
    });
    expect(radius(new Vector3(100, 0, 0))).toBe(5);
    expect(radius(new Vector3(400, 0, 0))).toBe(5);
    expect(radius(new Vector3(20, 0, 0))).toBe(5);
  });

  it("re-derives the radius at the pointer once the camera moved", () => {
    const { engine, camera } = createFakeEngine();
    const radius = createSteppedDiscRadius({
      engine,
      ...options,
      trigger: VIEW_CHANGE,
    });
    expect(radius(new Vector3(100, 0, 0))).toBe(5);
    camera.x = 10;
    // a tenth closer: the scale band would keep 5 m
    expect(radius(new Vector3(100, 0, 0))).toBe(4.5);
    expect(radius(new Vector3(300, 0, 0))).toBe(4.5);
  });

  it("keeps the scale band by default: a small camera move holds the radius", () => {
    const { engine, camera } = createFakeEngine();
    const radius = createSteppedDiscRadius({ engine, ...options });
    expect(radius(new Vector3(100, 0, 0))).toBe(5);
    camera.x = 10;
    expect(radius(new Vector3(300, 0, 0))).toBe(5);
    camera.x = 60;
    expect(radius(new Vector3(300, 0, 0))).toBe(12);
  });
});
