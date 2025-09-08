import React, { useRef, useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import type { Pane } from "tweakpane";
import localForage from "localforage";
import { DebugUiContext } from "./DebugUiContext";
import { createTweakpane, disposeTweakpane } from "./tweakpane/initPane";

const eventKeys = ["~", "F1"];
const localForageKey = "tweakpaneEnabled";

export const DebugUiProvider: React.FC<{
  children: ReactNode;
  position?: {
    top?: number;
    left?: number;
    right?: number;
  };
}> = ({ children, position = { top: 64, left: 64 } }) => {
  const [isHidden, setIsHidden] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<Pane | null>(null);

  const toggleTweakpane = useCallback(() => {
    setIsHidden((prevState) => {
      const newState = !prevState;
      localForage.setItem(localForageKey, newState);
      return newState;
    });
  }, []);

  useEffect(() => {
    const checkStoredState = async () => {
      const storedIsHidden = await localForage.getItem<boolean>(localForageKey);
      if (storedIsHidden !== null && storedIsHidden !== undefined) {
        setIsHidden(storedIsHidden);
      }
    };
    checkStoredState();
  }, []);

  const toggleOnKeypress = useCallback(
    (event: KeyboardEvent) => {
      if (eventKeys.includes(event.key)) {
        toggleTweakpane();
      }
    },
    [toggleTweakpane]
  );

  useEffect(() => {
    window.addEventListener("keydown", toggleOnKeypress);
    return () => {
      window.removeEventListener("keydown", toggleOnKeypress);
    };
  }, [toggleOnKeypress]);

  useEffect(() => {
    if (!paneRef.current && containerRef.current) {
      paneRef.current = createTweakpane(containerRef.current, toggleTweakpane);
    }

    return () => {
      disposeTweakpane(paneRef.current);
      paneRef.current = null;
    };
  }, [toggleTweakpane]);

  const { top, left, right } = position;

  return (
    <DebugUiContext.Provider value={{ paneRef }}>
      <div
        ref={containerRef}
        id="tweakpane-container"
        hidden={isHidden}
        style={{
          position: "absolute",
          top,
          left,
          right,
          zIndex: 10000,
          overflow: "hidden",
        }}
      ></div>
      {children}
    </DebugUiContext.Provider>
  );
};

export default DebugUiProvider;
