import {
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
  type MutableRefObject,
} from "react";
import {
  CtxEvent,
  type SubscribeCesiumCtxFn,
} from "../cesium-context-event-map";
import type { CesiumConfig } from "@carma/cesium/types";
import type { CesiumWidget, CameraStateHeadingPitchRoll } from "@carma/cesium";
import type { CesiumInstanceRecord } from "../CesiumContext";
import { degToRad, PI_OVER_TWO } from "@carma/units/helpers";
import type { Degrees } from "@carma/units/types";
import type { Longitude, Altitude } from "@carma/geo/types";

// Generate unique instance IDs using crypto.randomUUID()
const generateInstanceId = () => `cesium-instance-${crypto.randomUUID()}`;

/**
 * Listens for Activate events and tracks Cesium widget instance lifecycle
 * This triggers widget initialization when switching to 3D mode
 */
export const useContextSetupActivationListener = (
  subscribe: SubscribeCesiumCtxFn,
  setCesiumInstances: Dispatch<SetStateAction<CesiumInstanceRecord[]>>,
  widgetRef: MutableRefObject<CesiumWidget | null>,
  config: CesiumConfig,
  currentCameraStateRef: MutableRefObject<CameraStateHeadingPitchRoll | null>
) => {
  // Track context mount time (not app start time)
  const contextMountTimeRef = useRef(Date.now());

  useEffect(() => {
    const unsubActivate = subscribe(CtxEvent.Activate, async (triggerData) => {
      // Update camera state ref if initialPose is provided (e.g., from transition)
      if (triggerData?.initialPose) {
        const { latitude, longitude, altitude, heading, pitch, roll } =
          triggerData.initialPose;

        console.debug(
          "[CesiumContext] Updating camera state from Activate event (degrees)",
          triggerData.initialPose
        );

        // Convert degrees to radians using our helpers
        currentCameraStateRef.current = {
          latitude: degToRad(latitude as Degrees) as Longitude.deg,
          longitude: degToRad(longitude as Degrees) as Longitude.deg,
          altitude: altitude as Altitude.EllipsoidalWGS84Meters,
          heading: degToRad((heading ?? 0) as Degrees) as Degrees,
          pitch: degToRad((pitch ?? -PI_OVER_TWO) as Degrees) as Degrees,
          roll: degToRad((roll ?? 0) as Degrees) as Degrees,
        };

        console.debug(
          "[CesiumContext] Camera state updated (radians)",
          currentCameraStateRef.current
        );
      }

      const instanceId = generateInstanceId();
      const timestamp = Date.now();
      const contextAgeMs = timestamp - contextMountTimeRef.current;

      setCesiumInstances((prev) => {
        // Clone config for immutable snapshot
        const configSnapshot = structuredClone(config);

        // Only store config if it changed from the last instance
        const lastInstance = prev[prev.length - 1];
        const configToStore =
          lastInstance &&
          JSON.stringify(lastInstance.config) === JSON.stringify(configSnapshot)
            ? lastInstance.config // Reuse same config reference if unchanged
            : configSnapshot; // Store new config if changed

        const instanceRecord: CesiumInstanceRecord = {
          instanceId,
          timestamp,
          contextAgeMs,
          widgetRef,
          config: configToStore,
          trigger: triggerData
            ? { source: triggerData.source || "unknown", ...triggerData }
            : undefined,
        };

        const triggerInfo = triggerData
          ? ` triggered by: ${triggerData.source || "unknown"}${
              triggerData.component ? ` (${triggerData.component})` : ""
            }`
          : "";

        console.debug(
          `[CesiumContext] Widget instance created: ${instanceId} at ${new Date(
            timestamp
          ).toISOString()} ` +
            `(context age: ${contextAgeMs}ms)${triggerInfo}` +
            (configToStore === lastInstance?.config
              ? " [config unchanged]"
              : " [config changed]")
        );

        return [...prev, instanceRecord];
      });
    });
    return () => unsubActivate();
  }, [subscribe, setCesiumInstances, widgetRef, config]);
};
