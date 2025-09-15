import type { Camera, BoundingSphere, HeadingPitchRange } from "cesium";

// Guard operations on a Cesium Camera instance. All methods are no-throw and
// return safe defaults where applicable.
export const guardCamera = (cameraLike: unknown, label?: string) => {
  const isValid = (c: unknown): c is Camera =>
    !!c && typeof (c as Camera).getMagnitude === "function"; // lightweight sanity check

  const ensure = <T>(fn: (c: Camera) => T, fallback: T): T => {
    if (!isValid(cameraLike)) {
      console.warn("Camera gate invalid", label);
      return fallback;
    }
    try {
      return fn(cameraLike as Camera);
    } catch (e) {
      console.warn("Camera gate call failed", label, e);
      return fallback;
    }
  };

  // Facade for Cesium Camera.changed event providing chainable methods
  const changedFacade = {
    addEventListener(handler: (...args: unknown[]) => void) {
      ensure(
        (c) => c.changed.addEventListener(handler),
        undefined as unknown as void
      );
      return changedFacade;
    },
    removeEventListener(handler: (...args: unknown[]) => void) {
      ensure(
        (c) => c.changed.removeEventListener(handler),
        undefined as unknown as void
      );
      return changedFacade;
    },
  };

  return {
    // Queries

    get changed() {
      return changedFacade;
    },

    heading(): number | undefined {
      return ensure((c) => c.heading, undefined);
    },
    pitch(): number | undefined {
      return ensure((c) => c.pitch, undefined);
    },
    roll(): number | undefined {
      return ensure((c) => c.roll, undefined);
    },
    position(): import("cesium").Cartesian3 | undefined {
      return ensure((c) => c.position, undefined);
    },

    // Actions
    flyToBoundingSphere(
      sphere: BoundingSphere,
      options: {
        offset?: HeadingPitchRange;
        duration?: number;
        pitchAdjustHeight?: number;
        easingFunction?: (time: number) => number;
        complete?: () => void;
      } = {}
    ) {
      ensure(
        (c) => c.flyToBoundingSphere(sphere, options as any),
        undefined as unknown as void
      );
      return this;
    },
  };
};
