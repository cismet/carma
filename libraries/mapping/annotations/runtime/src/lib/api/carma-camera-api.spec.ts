import { Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import type { CameraPose } from "@carma-api";
import type { EcefCameraPose } from "@carma-commons/camera/model";
import { PI, type Radians } from "@carma-units";

import type { AnnotationEngine } from "@carma-mapping/annotations/core";
import {
  createCarmaCameraApiAdapter,
  resolveCameraPose,
} from "./carma-camera-api";

const pose = (overrides: Partial<CameraPose> = {}): CameraPose => ({
  position: [10, 20, 30],
  direction: [0, 0, -2],
  up: [0, 1, 1],
  fovY: 0.8,
  ...overrides,
});

const createEngine = (current: EcefCameraPose | null = null) => {
  const setCameraPose = vi.fn<[EcefCameraPose], boolean>(() => true);
  const engine = {
    isDestroyed: () => false,
    getCameraPose: () => current,
    setCameraPose,
  } as unknown as AnnotationEngine;
  return { engine, setCameraPose };
};

describe("resolveCameraPose", () => {
  it("normalizes the direction and makes up orthogonal to it", () => {
    const resolved = resolveCameraPose(pose());
    expect(resolved?.positionECEF.toArray()).toEqual([10, 20, 30]);
    expect(resolved?.directionECEF.toArray()).toEqual([0, 0, -1]);
    expect(resolved?.upECEF.toArray()).toEqual([0, 1, 0]);
    expect(resolved?.verticalFovRad).toBe(0.8);
  });

  it.each([
    ["no pose", null],
    ["a non-finite position", pose({ position: [Number.NaN, 0, 0] })],
    ["a zero direction", pose({ direction: [0, 0, 0] })],
    ["up along the direction", pose({ up: [0, 0, 1] })],
    ["a field of view of pi", pose({ fovY: PI })],
    ["a negative field of view", pose({ fovY: -0.1 })],
  ])("rejects %s", (_label, input) => {
    expect(resolveCameraPose(input)).toBeNull();
  });
});

describe("createCarmaCameraApiAdapter", () => {
  it("reports the engine's pose as plain arrays", () => {
    const { engine } = createEngine({
      positionECEF: new Vector3(1, 2, 3),
      directionECEF: new Vector3(0, 0, -1),
      upECEF: new Vector3(0, 1, 0),
      verticalFovRad: 0.5 as Radians,
    });
    expect(createCarmaCameraApiAdapter(() => engine).getPose()).toEqual({
      position: [1, 2, 3],
      direction: [0, 0, -1],
      up: [0, 1, 0],
      fovY: 0.5,
    });
  });

  it("sets only usable poses", () => {
    const { engine, setCameraPose } = createEngine();
    const adapter = createCarmaCameraApiAdapter(() => engine);
    expect(adapter.setPose(pose({ fovY: 0 }))).toBe(false);
    expect(setCameraPose).not.toHaveBeenCalled();
    expect(adapter.setPose(pose())).toBe(true);
    expect(setCameraPose.mock.calls[0][0].upECEF.toArray()).toEqual([0, 1, 0]);
  });

  it("does nothing without a live engine", async () => {
    const adapter = createCarmaCameraApiAdapter(() => null);
    expect(adapter.getPose()).toBeNull();
    expect(adapter.setPose(pose())).toBe(false);
    await expect(adapter.flyToPose(pose())).resolves.toBe(false);
    await expect(adapter.lookAt([0, 0, 0], [1, 0, 0])).resolves.toBe(false);
  });

  it("jumps when it has no pose to fly from", async () => {
    const { engine, setCameraPose } = createEngine();
    const adapter = createCarmaCameraApiAdapter(() => engine);
    await expect(adapter.flyToPose(pose())).resolves.toBe(true);
    expect(setCameraPose).toHaveBeenCalledTimes(1);
  });
});
