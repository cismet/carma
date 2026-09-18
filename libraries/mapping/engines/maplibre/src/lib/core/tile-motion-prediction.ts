import { Matrix4, Vector3 } from "three";
import type { TileCameraSnapshot } from "./tile-camera-demand";

/** Bounded speculative demand, never an additional visible camera.
 * Decision: PAN-PREDICTION-20260916 in engines/maplibre/TILES_COVERAGE.md.
 */
export const createTileMotionPrediction = () => {
  let previous: TileCameraSnapshot | null = null;
  let previousAt = 0;
  let stableMs = 0;
  let stability = 0;
  const velocity = new Vector3();
  const delta = new Vector3();
  const world = new Matrix4();
  const latencies: number[] = [];
  let latencyMs = 500;
  let leadMs = 0;
  const reset = () => {
    previous = null;
    stableMs = stability = leadMs = 0;
    velocity.set(0, 0, 0);
  };
  return {
    reset,
    observeLatency(ms: number) {
      if (!Number.isFinite(ms) || ms <= 0) return;
      latencies.push(Math.min(1500, Math.max(100, ms)));
      if (latencies.length > 64) latencies.shift();
      const sorted = [...latencies].sort((a, b) => a - b);
      latencyMs = sorted[Math.floor((sorted.length - 1) * 0.75)];
    },
    getStats: () => ({ stability, stableMs, latencyMs, leadMs }),
    update(
      view: TileCameraSnapshot,
      now: number,
      moving: boolean,
      zooming: boolean,
      viewWidthMeters: number
    ): TileCameraSnapshot | null {
      if (
        !moving ||
        zooming ||
        !Number.isFinite(viewWidthMeters) ||
        viewWidthMeters <= 0
      ) {
        reset();
        return null;
      }
      const old = previous;
      const dt = now - previousAt;
      if (old && dt < 80) return null;
      previous = view;
      previousAt = now;
      if (!old || dt > 250 || dt <= 0) {
        stableMs = stability = leadMs = 0;
        velocity.set(0, 0, 0);
        return null;
      }
      // Pan-only inference: do not guess zoom, roll or a changing look direction.
      const lensChanged = view.projectionMatrix.some(
        (v, i) =>
          Math.abs(v - old.projectionMatrix[i]) >
          0.002 * Math.max(1, Math.abs(v))
      );
      const rotationChanged = [0, 1, 2, 4, 5, 6, 8, 9, 10].some(
        (i) => Math.abs(view.matrixWorld[i] - old.matrixWorld[i]) > 0.01
      );
      delta
        .set(
          view.matrixWorld[12] - old.matrixWorld[12],
          view.matrixWorld[13] - old.matrixWorld[13],
          view.matrixWorld[14] - old.matrixWorld[14]
        )
        .divideScalar(dt);
      const speed = delta.length(),
        oldSpeed = velocity.length();
      if (
        lensChanged ||
        rotationChanged ||
        speed < viewWidthMeters * 0.000002 ||
        speed * dt > viewWidthMeters * 0.25
      ) {
        stableMs = stability = leadMs = 0;
        velocity.copy(delta);
        return null;
      }
      const direction =
        oldSpeed > 0 ? delta.dot(velocity) / (speed * oldSpeed) : 0;
      const speedAgreement =
        oldSpeed > 0
          ? Math.min(speed, oldSpeed) / Math.max(speed, oldSpeed)
          : 0;
      stability = Math.max(0, direction) * speedAgreement;
      stableMs = direction >= 0.95 && speedAgreement >= 0.7 ? stableMs + dt : 0;
      if (oldSpeed === 0) velocity.copy(delta);
      else velocity.lerp(delta, 1 - Math.exp(-dt / 160));
      if (stableMs < 400 || stability < 0.8) {
        leadMs = 0;
        return null;
      }
      // Clamp both time and spatial lead: overload cannot grow speculation forever.
      leadMs = Math.min(latencyMs, (viewWidthMeters * 0.5) / velocity.length());
      world.fromArray(view.matrixWorld);
      world.elements[12] += velocity.x * leadMs;
      world.elements[13] += velocity.y * leadMs;
      world.elements[14] += velocity.z * leadMs;
      return { ...view, matrixWorld: world.toArray() };
    },
  };
};
