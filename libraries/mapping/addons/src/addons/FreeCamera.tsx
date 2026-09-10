import { useEffect, useRef } from "react";

import type { AddonComponentProps } from "../lib/registry";
import {
  ADDON_CAMERA_RESTRICTION_PRIORITY,
  setAddonCameraRestriction,
} from "../lib/camera-restriction-overrides";

/** MapLibre's supported pitch range is 0–180 degrees. */
export const FREE_CAMERA_MAX_PITCH = 180;

export type FreeCameraConfig = Record<never, never>;

/**
 * Opt-in unrestricted MapLibre camera policy.
 *
 * It wins over route and interaction addons, but not an app-forced lock such as
 * print/export. MapLibre needs an unclamped centre for pitches beyond 90°; this
 * intentionally permits the camera target to pass beneath terrain.
 */
export const FreeCamera = ({ libreMap }: AddonComponentProps<"freeCamera">) => {
  const owner = useRef(Symbol("freeCamera")).current;

  useEffect(() => {
    if (!libreMap) {
      return;
    }

    setAddonCameraRestriction(
      libreMap,
      owner,
      {
        restricted: false,
        maxPitch: FREE_CAMERA_MAX_PITCH,
        minPitch: 0,
        centerClampedToGround: false,
      },
      ADDON_CAMERA_RESTRICTION_PRIORITY.FREE_CAMERA
    );

    return () => {
      setAddonCameraRestriction(libreMap, owner, null);
    };
  }, [libreMap, owner]);

  return null;
};
