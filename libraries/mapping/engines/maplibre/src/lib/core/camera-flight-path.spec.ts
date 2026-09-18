import { describe, expect, it } from "vitest";
import {
  AnimationClip,
  CatmullRomCurve3,
  PerspectiveCamera,
  Vector3,
} from "three";
import {
  createCameraFlightPlayer,
  createCameraLensClip,
} from "./camera-flight-path";

describe("shared camera flights", () => {
  it("round-trips Three clip JSON and reverses without a pose/lens jump", () => {
    const camera = new PerspectiveCamera();
    const target = new Vector3(50, 0, -100);
    const clip = AnimationClip.parse(
      AnimationClip.toJSON(createCameraLensClip(10, [60, 20, 40]))
    );
    const player = createCameraFlightPlayer(camera, {
      curve: new CatmullRomCurve3([
        new Vector3(0, 100, 0),
        new Vector3(100, 100, 0),
      ]),
      clip,
      duration: 10,
      target,
    });
    player.sample(0);
    expect(camera.fov).toBeCloseTo(60);
    player.sample(5);
    expect(camera.position.x).toBeCloseTo(50);
    expect(camera.fov).toBeCloseTo(20);
    expect(
      camera
        .getWorldDirection(new Vector3())
        .dot(target.clone().sub(camera.position).normalize())
    ).toBeCloseTo(1);
    player.sample(10);
    expect(camera.position.x).toBeCloseTo(100);
    player.sample(15);
    expect(camera.position.x).toBeCloseTo(50);
    expect(camera.fov).toBeCloseTo(20);
    player.sample(15, 75);
    expect(camera.fov).toBe(75);
    camera.aspect = 2;
    player.sample(15, 75);
    expect(
      camera.projectionMatrix.elements[5] / camera.projectionMatrix.elements[0]
    ).toBeCloseTo(2);
    player.dispose();
  });
  it("keeps path parameters finite at endpoints and rejects invalid durations", () => {
    const camera = new PerspectiveCamera();
    const path = {
      curve: new CatmullRomCurve3([new Vector3(), new Vector3(100, 0, 0)]),
      duration: 10,
      clip: createCameraLensClip(10, [60, 60]),
    };
    const player = createCameraFlightPlayer(camera, path);
    for (const time of [-10, 0, 10, 20, 1e6]) {
      player.sample(time);
      expect(camera.matrixWorld.elements.every(Number.isFinite)).toBe(true);
    }
    expect(() =>
      createCameraFlightPlayer(camera, { ...path, duration: 0 })
    ).toThrow();
    player.dispose();
  });

  it("samples a future pose without mutating the live camera", () => {
    const camera = new PerspectiveCamera(60, 2, 0.5, 500);
    const player = createCameraFlightPlayer(camera, {
      curve: new CatmullRomCurve3([new Vector3(), new Vector3(100, 0, 0)]),
      duration: 10,
      clip: createCameraLensClip(10, [60, 20]),
    });
    player.sample(0);
    const position = camera.position.clone();
    const fov = camera.fov;
    const future = player.sampleAhead(0, 5000);
    expect(future.position.x).toBeCloseTo(50);
    expect(future.fov).toBeCloseTo(40);
    expect(camera.position.equals(position)).toBe(true);
    expect(camera.fov).toBe(fov);
    expect(player.sampleAhead(0, 5000)).toBe(future);
    expect(() => player.sampleAhead(NaN, 0)).toThrow();
    expect(() => player.sampleAhead(0, -1)).toThrow();
    player.dispose();
  });
});
