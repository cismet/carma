import type {
  BoundingSphere,
  Camera,
  Cartesian3,
  HeadingPitchRange,
} from "cesium";
import { isValidCamera } from "./instanceGates";

// Guard operations on a Cesium Camera instance. All methods are no-throw and
// return safe defaults where applicable.
export const guardCamera = (camera: Camera, label?: string) => {
  const isValid = () => isValidCamera(camera);

  const ensure = <T>(fn: (c: Camera) => T, fallback: T): T => {
    if (!isValid()) {
      console.warn("Camera gate invalid", label);
      return fallback;
    }
    try {
      return fn(camera);
    } catch (e) {
      console.warn("Camera gate call failed", label, e);
      return fallback;
    }
  };

  // Facade for Cesium Camera.changed event providing chainable methods
  const changedFacade = {
    addEventListener(handler: (...args: unknown[]) => void) {
      ensure((c) => c.changed.addEventListener(handler), undefined);
      return changedFacade;
    },
    removeEventListener(handler: (...args: unknown[]) => void) {
      ensure((c) => c.changed.removeEventListener(handler), undefined);
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
    position(): Cartesian3 | undefined {
      return ensure((c) => c.position, undefined);
    },

    // Actions
    flyToBoundingSphere(sphere: BoundingSphere, options) {
      ensure((c) => c.flyToBoundingSphere(sphere, options), undefined);
      return this;
    },
    lookAt(target: Cartesian3, offset: Cartesian3 | HeadingPitchRange) {
      ensure((c) => c.lookAt(target, offset), undefined);
      return this;
    },
  };
};
