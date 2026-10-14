import { Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import type { CssPixels, Ratio, Radians } from "@carma-units";
import {
  ANNOTATION_POINT_QUERY_DISC_SIZING_DEFAULTS,
  type AnnotationPointQueryDiscSizingOptions,
} from "../config/annotation-reference-object-sizing";

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

describe("scene sampler stepped outer radius", () => {
  it("exports the five configured scene defaults", () => {
    expect(ANNOTATION_POINT_QUERY_DISC_SIZING_DEFAULTS).toEqual({
      targetScreenRadiusCssPx: 64,
      minimumScreenRadiusCssPx: 10,
      maximumViewportRadiusRatio: 0.5,
      sceneResizeFactor: 10,
      resizeHysteresisRatio: 0.15,
      radiusLabelVisibleDurationMs: 3000,
      radiusLabelFadeDurationMs: 250,
      resizeAnimationDurationMs: 200,
    });
  });
  const createSceneSampler = (
    discSizing: Partial<AnnotationPointQueryDiscSizingOptions> = {},
    viewportSize = 600
  ) => {
    const ground = new Vector3(500, 0, 0);
    const point = new Vector3(20, 0, 0);
    const scale = { ground: 12.8, pointer: 12.8 };
    const getGround = vi.fn(() => ground);
    const { engine: legacy } = createFakeEngine();
    const engine = {
      ...legacy,
      canvas: { clientWidth: 800, clientHeight: viewportSize },
      getViewportCenterGroundPosition: getGround,
      getScreenPixelsPerMeterAt: (position: Vector3) =>
        position.equals(ground) ? scale.ground : scale.pointer,
    } as unknown as AnnotationEngine;
    const radius = createSteppedDiscRadius({
      engine,
      stepFactor: 2,
      targetScreenRadiusCssPx: 2,
      quantize: false,
      discSizing,
      fallbackRadiusMeters: 3,
      trigger: VIEW_CHANGE,
    });
    return { radius, point, ground, scale, getGround, engine };
  };

  it("snaps outer radii while the existing default still snaps diameters", () => {
    expect(resolveDiscRadiusForScreenTarget(16, 48, true)).toBe(2.5);
    expect(
      resolveDiscRadiusForScreenTarget(16, 64, true, { radiusSteps: true })
    ).toBe(5);
    for (const radius of [
      0.001, 0.002, 0.005, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50,
    ]) {
      expect(
        resolveDiscRadiusForScreenTarget(64 / radius, 64, true, {
          radiusSteps: true,
        })
      ).toBeCloseTo(radius, 10);
    }
  });

  it("chooses from centre ground independently of the first pointer depth", () => {
    const near = createSceneSampler(),
      far = createSceneSampler();
    near.scale.pointer = 40;
    far.scale.pointer = 4;
    expect(near.radius(near.point, { viewRevision: 0 })).toBe(5);
    expect(far.radius(far.point, { viewRevision: 0 })).toBe(5);
    expect(near.getGround).toHaveBeenCalledOnce();
    expect(far.getGround).toHaveBeenCalledOnce();
  });

  it("does not drift or resample ground under a static view", () => {
    const s = createSceneSampler();
    expect(s.radius(s.point, { viewRevision: 0 })).toBe(5);
    s.scale.ground = 64;
    for (const scale of [8, 10, 15, 25, 40, 50, 12.8]) {
      s.scale.pointer = scale;
      expect(s.radius(s.point, { viewRevision: 0 })).toBe(5);
    }
    expect(s.getGround).toHaveBeenCalledOnce();
  });

  it("repicks only when a new view revision is settled, not during the move", () => {
    const s = createSceneSampler();
    expect(s.radius(s.point, { viewRevision: 0 })).toBe(5);
    s.scale.ground = 32;
    expect(s.radius(s.point, { cameraMoving: true, viewRevision: 1 })).toBe(5);
    expect(s.getGround).toHaveBeenCalledOnce();
    expect(s.radius(s.point, { cameraMoving: false, viewRevision: 1 })).toBe(2);
    expect(s.radius(s.point, { viewRevision: 1 })).toBe(2);
    expect(s.getGround).toHaveBeenCalledTimes(2);
  });

  it("escapes by decade factors below10px and above half the viewport, without ground repicks", () => {
    const s = createSceneSampler();
    expect(s.radius(s.point, { viewRevision: 0 })).toBe(5);
    s.scale.pointer = 1;
    expect(s.radius(s.point, { viewRevision: 0 })).toBe(50);
    s.scale.pointer = 10;
    expect(s.radius(s.point, { viewRevision: 0 })).toBe(5);
    s.scale.pointer = 1000;
    expect(s.radius(s.point, { viewRevision: 0 })).toBe(0.05);
    expect(s.getGround).toHaveBeenCalledOnce();
  });

  it("uses a usable intermediate nice step in a tight viewport and stays stable across threshold jitter", () => {
    const s = createSceneSampler({}, 60);
    s.scale.ground = s.scale.pointer = 1;
    expect(s.radius(s.point, { viewRevision: 0 })).toBe(20);
    s.scale.pointer = 0.25;
    expect(s.radius(s.point, { viewRevision: 0 })).toBe(100);
    for (const scale of [0.245, 0.26, 0.25]) {
      s.scale.pointer = scale;
      expect(s.radius(s.point, { viewRevision: 0 })).toBe(100);
    }
    for (const scale of [0.099, 0.101, 0.0995, 0.1005]) {
      s.scale.pointer = scale;
      const radius = s.radius(s.point, { viewRevision: 0 });
      expect(radius).toBe(200);
      expect(radius * scale).toBeGreaterThanOrEqual(10 * 1.15);
      expect(radius * scale).toBeLessThanOrEqual(30 / 1.15);
    }
    expect(s.getGround).toHaveBeenCalledOnce();
  });

  it("substitutes all defaults for non-finite controls", () => {
    const s = createSceneSampler({
      targetScreenRadiusCssPx: Number.NaN as CssPixels,
      minimumScreenRadiusCssPx: Infinity as CssPixels,
      maximumViewportRadiusRatio: Number.NaN as Ratio,
      sceneResizeFactor: Infinity as Ratio,
      resizeHysteresisRatio: Number.NaN as Ratio,
    });
    expect(s.radius(s.point, { viewRevision: 0 })).toBe(5);
    s.scale.pointer = 1;
    expect(s.radius(s.point, { viewRevision: 0 })).toBe(50);
  });

  it("clamps out-of-range controls to finite usable sizing", () => {
    const s = createSceneSampler({
      targetScreenRadiusCssPx: -10 as CssPixels,
      minimumScreenRadiusCssPx: -10 as CssPixels,
      maximumViewportRadiusRatio: -1 as Ratio,
      sceneResizeFactor: -10 as Ratio,
      resizeHysteresisRatio: -1 as Ratio,
    });
    const radius = s.radius(s.point, { viewRevision: 0 });
    expect(Number.isFinite(radius)).toBe(true);
    expect(radius * s.scale.pointer).toBeGreaterThanOrEqual(1);
    expect(radius * s.scale.pointer).toBeLessThanOrEqual(6);
  });

  it("does not pick ground for invalid pointer scale and recovers on a valid sample", () => {
    const s = createSceneSampler();
    s.scale.pointer = 0;
    expect(s.radius(s.point, { viewRevision: 0 })).toBe(3);
    expect(s.getGround).not.toHaveBeenCalled();
    s.scale.pointer = 12.8;
    expect(s.radius(s.point, { viewRevision: 0 })).toBe(5);
    s.scale.pointer = Number.NaN;
    expect(s.radius(s.point, { viewRevision: 0 })).toBe(5);
    expect(s.getGround).toHaveBeenCalledOnce();
  });
});
