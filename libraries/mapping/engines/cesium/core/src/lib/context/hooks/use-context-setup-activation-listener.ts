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
import type { CesiumConfig } from "../../types";
import type { CesiumWidget } from "@carma/cesium";
import type { CesiumInstanceRecord } from "../CesiumContext";

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
  config: CesiumConfig
) => {
  // Track context mount time (not app start time)
  const contextMountTimeRef = useRef(Date.now());

  useEffect(() => {
    const unsubActivate = subscribe(CtxEvent.Activate, (triggerData) => {
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
          trigger: triggerData || undefined,
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
