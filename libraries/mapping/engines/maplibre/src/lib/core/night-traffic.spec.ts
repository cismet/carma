import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  advanceNightTrafficDistance,
  getNightTrafficSignalPhase,
  NIGHT_TRAFFIC_SIGNAL_PHASE,
} from "./night-traffic";
import { createSharedSceneNightTraffic } from "../runtime/integrations/shared-scene-night-traffic";

describe("night traffic", () => {
  it("runs a deterministic German-style signal cycle with an all-red boundary", () => {
    expect(getNightTrafficSignalPhase(0)).toBe(NIGHT_TRAFFIC_SIGNAL_PHASE.RED);
    expect(getNightTrafficSignalPhase(12)).toBe(
      NIGHT_TRAFFIC_SIGNAL_PHASE.RED_YELLOW
    );
    expect(getNightTrafficSignalPhase(14)).toBe(
      NIGHT_TRAFFIC_SIGNAL_PHASE.GREEN
    );
    expect(getNightTrafficSignalPhase(26)).toBe(
      NIGHT_TRAFFIC_SIGNAL_PHASE.YELLOW
    );
    expect(getNightTrafficSignalPhase(29)).toBe(
      NIGHT_TRAFFIC_SIGNAL_PHASE.ALL_RED
    );
    expect(getNightTrafficSignalPhase(30)).toBe(NIGHT_TRAFFIC_SIGNAL_PHASE.RED);
  });

  it("stops before a non-green signal and resumes on green", () => {
    const base = {
      speedMetersPerSecond: 10,
      routeLengthMeters: 100,
      signal: { distanceMeters: 50, phaseOffsetSeconds: 0 },
    } as const;
    expect(
      advanceNightTrafficDistance({
        ...base,
        distanceMeters: 40,
        deltaSeconds: 1,
        elapsedSeconds: 0,
      })
    ).toBe(47);
    expect(
      advanceNightTrafficDistance({
        ...base,
        distanceMeters: 47,
        deltaSeconds: 0,
        elapsedSeconds: 8,
      })
    ).toBe(47);
    expect(
      advanceNightTrafficDistance({
        ...base,
        distanceMeters: 47,
        deltaSeconds: 1,
        elapsedSeconds: 14,
      })
    ).toBe(57);
  });

  it("is invariant to frame subdivision away from a signal transition", () => {
    const options = {
      speedMetersPerSecond: 7,
      routeLengthMeters: 100,
    } as const;
    const oneFrame = advanceNightTrafficDistance({
      ...options,
      distanceMeters: 5,
      deltaSeconds: 2,
      elapsedSeconds: 14,
    });
    const first = advanceNightTrafficDistance({
      ...options,
      distanceMeters: 5,
      deltaSeconds: 1,
      elapsedSeconds: 14,
    });
    const twoFrames = advanceNightTrafficDistance({
      ...options,
      distanceMeters: first,
      deltaSeconds: 1,
      elapsedSeconds: 15,
    });
    expect(twoFrames).toBeCloseTo(oneFrame);
  });

  it("bounds the fleet, skips invalid routes, and disposes its scene root", () => {
    const scene = new THREE.Scene();
    const points = [new THREE.Vector3(), new THREE.Vector3(100, 10, 0)];
    const runtime = createSharedSceneNightTraffic(scene, {
      carCount: 20,
      routes: [
        {
          id: "road",
          kind: "car",
          points,
          speedMetersPerSecond: 10,
          signal: { distanceMeters: 50, phaseOffsetSeconds: 0 },
        },
        {
          id: "suspension-rail",
          kind: "schwebebahn",
          points,
          speedMetersPerSecond: 8,
        },
        {
          id: "rail",
          kind: "train",
          points,
          speedMetersPerSecond: 12,
        },
        {
          id: "invalid",
          kind: "car",
          points: [new THREE.Vector3()],
          speedMetersPerSecond: 10,
        },
      ],
    });

    expect(runtime.vehicleCount).toBe(10);
    expect(runtime.signalCount).toBe(1);
    expect(scene.getObjectByName("shared-scene-night-traffic")).toBeTruthy();
    runtime.dispose();
    runtime.dispose();
    expect(scene.getObjectByName("shared-scene-night-traffic")).toBeFalsy();
  });

  it("limits a large elapsed-clock jump on resume", () => {
    const scene = new THREE.Scene();
    const runtime = createSharedSceneNightTraffic(scene, {
      carCount: 1,
      routes: [
        {
          id: "road",
          kind: "car",
          points: [new THREE.Vector3(), new THREE.Vector3(100, 0, 0)],
          speedMetersPerSecond: 10,
        },
      ],
    });
    const car = scene.getObjectByName("night-traffic-car-road")!;

    runtime.update(100);

    expect(car.position.x).toBeCloseTo(2.5);
    runtime.dispose();
  });
});
