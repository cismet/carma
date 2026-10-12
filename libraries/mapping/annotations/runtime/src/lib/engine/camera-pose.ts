import { smoothstep } from "@carma-commons/math";
import {
  interpolateEcefCameraPose,
  type EcefCameraPose,
} from "@carma-commons/camera/model";
import type { Milliseconds } from "@carma-units";

import type { AnnotationEngine } from "@carma-mapping/annotations/core";

/** Camera flights: the pose blend of camera/model, played frame by frame through the engine. */

export const CAMERA_FLIGHT_DEFAULT_DURATION_MS = 1500 as Milliseconds;

const runningFlights = new WeakMap<AnnotationEngine, () => void>();

/** Stops the engine's running flight; its promise resolves false. */
export const stopCameraPoseAnimation = (engine: AnnotationEngine) => {
  runningFlights.get(engine)?.();
};

/** One eased blend per frame; a new flight stops the previous one. True on arrival. */
export const animateCameraPose = (
  engine: AnnotationEngine,
  to: EcefCameraPose,
  {
    durationMs = CAMERA_FLIGHT_DEFAULT_DURATION_MS,
  }: { durationMs?: number } = {}
): Promise<boolean> => {
  stopCameraPoseAnimation(engine);
  const from = engine.getCameraPose();
  if (!from || !(durationMs > 0)) {
    return Promise.resolve(engine.setCameraPose(to));
  }
  return new Promise<boolean>((resolve) => {
    let frame = 0;
    let done = false;
    const finish = (arrived: boolean) => {
      if (done) return;
      done = true;
      cancelAnimationFrame(frame);
      if (runningFlights.get(engine) === stop) runningFlights.delete(engine);
      resolve(arrived);
    };
    const stop = () => finish(false);
    runningFlights.set(engine, stop);
    const start = performance.now();
    const step = (now: number) => {
      if (done) return;
      const t = Math.min(1, (now - start) / durationMs);
      const pose =
        t >= 1 ? to : interpolateEcefCameraPose(from, to, smoothstep(0, 1, t));
      if (engine.isDestroyed() || !engine.setCameraPose(pose)) {
        finish(false);
        return;
      }
      if (t >= 1) finish(true);
      else frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  });
};
