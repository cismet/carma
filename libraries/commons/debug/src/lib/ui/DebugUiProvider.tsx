import React, { useRef, useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import localForage from "localforage";

import { useFeatureFlags } from "@carma-providers/feature-flag";

import { DebugUiContext } from "./DebugUiContext";

const eventKeys = ["~", "F1"];
const localForageKey = "tweakpaneEnabled";

export const DebugUiProvider: React.FC<{
  children: ReactNode;
  enabled?: boolean;
  position?: {
    top?: number;
    left?: number;
    right?: number;
  };
}> = ({ children, enabled = false, position = { top: 64, left: 64 } }) => {
  const [isHidden, setIsHidden] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const { isDeveloperMode } = useFeatureFlags();
  const isLocalDevelopment = import.meta.env?.DEV === true;

  // can be enabled via props e.g test if in local development or via feature flag
  const effectiveEnabled = Boolean(
    enabled || isDeveloperMode || isLocalDevelopment
  );

  useEffect(() => {
    if (!effectiveEnabled) return;
    const checkStoredState = async () => {
      const storedIsHidden = await localForage.getItem<boolean>(localForageKey);
      if (storedIsHidden !== null && storedIsHidden !== undefined) {
        setIsHidden(storedIsHidden);
      }
    };
    checkStoredState();
  }, [effectiveEnabled]);

  const toggleOnKeypress = useCallback(
    (event: KeyboardEvent) => {
      if (!effectiveEnabled) return;
      if (eventKeys.includes(event.key)) {
        console.debug(
          "NOT IMPLEMENTED debug UI, was enabled via keypress",
          event.key
        );
      }
    },
    [effectiveEnabled]
  );

  useEffect(() => {
    if (!effectiveEnabled) return;
    window.addEventListener("keydown", toggleOnKeypress);
    return () => {
      window.removeEventListener("keydown", toggleOnKeypress);
    };
  }, [toggleOnKeypress, effectiveEnabled]);

  const { top, left, right } = position;

  return (
    <DebugUiContext.Provider value={{ enabled: effectiveEnabled }}>
      {effectiveEnabled && (
        <div
          ref={containerRef}
          id="debug-ui-container"
          hidden={isHidden}
          style={{
            position: "absolute",
            top,
            left,
            right,
            zIndex: 10000,
            overflow: "hidden",
          }}
        />
      )}
      {children}
    </DebugUiContext.Provider>
  );
};

export default DebugUiProvider;
