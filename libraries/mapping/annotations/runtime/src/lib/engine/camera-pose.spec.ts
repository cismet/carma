import { cartographicToEcef } from "@carma-geo/proj";
import {
  createLookAtEcefCameraPose,
  type EcefCameraPose,
} from "@carma-commons/camera/model";
import { degToRadNumeric, type Radians } from "@carma-units";

import type { AnnotationEngine } from "./annotation-engine.types";
import { animateCameraPose, stopCameraPoseAnimation } from "./camera-pose";

const at = (longitudeDeg: number, latitudeDeg: number, altitude: number) =>
  cartographicToEcef(
    degToRadNumeric(longitudeDeg),
    degToRadNumeric(latitudeDeg),
    altitude
  );
const target = at(7.2, 51.272, 155);

const expectSamePose = (a: EcefCameraPose, b: EcefCameraPose) => {
  expect(a.positionECEF.distanceTo(b.positionECEF)).toBeLessThan(1e-6);
  expect(a.directionECEF.angleTo(b.directionECEF)).toBeLessThan(1e-6);
  expect(a.upECEF.angleTo(b.upECEF)).toBeLessThan(1e-6);
};

describe("animateCameraPose", () => {
  const createFakeEngine = (start: EcefCameraPose) => {
    let current = start;
    const applied: EcefCameraPose[] = [];
    const engine = {
      isDestroyed: () => false,
      getCameraPose: () => current,
      setCameraPose: (pose: EcefCameraPose) => {
        current = pose;
        applied.push(pose);
        return true;
      },
    } as unknown as AnnotationEngine;
    return { engine, applied };
  };
  const from = createLookAtEcefCameraPose(
    at(7.19, 51.27, 400),
    target,
    0.6 as Radians
  )!;
  const to = createLookAtEcefCameraPose(
    at(7.21, 51.275, 250),
    target,
    1.0 as Radians
  )!;

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("arrives on the pose after the duration, frame by frame", async () => {
    const { engine, applied } = createFakeEngine(from);
    const flight = animateCameraPose(engine, to, { durationMs: 500 });
    await vi.advanceTimersByTimeAsync(600);
    await expect(flight).resolves.toBe(true);
    expect(applied.length).toBeGreaterThan(5);
    expectSamePose(applied.at(-1)!, to);
  });

  it("jumps without a duration", async () => {
    const { engine, applied } = createFakeEngine(from);
    await expect(
      animateCameraPose(engine, to, { durationMs: 0 })
    ).resolves.toBe(true);
    expect(applied).toEqual([to]);
  });

  it("resolves false when stopped or replaced", async () => {
    const { engine } = createFakeEngine(from);
    const first = animateCameraPose(engine, to, { durationMs: 500 });
    const second = animateCameraPose(engine, from, { durationMs: 500 });
    await expect(first).resolves.toBe(false);
    stopCameraPoseAnimation(engine);
    await expect(second).resolves.toBe(false);
  });
});
