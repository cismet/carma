import React, { useRef, useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { Pane } from "tweakpane";
import localForage from "localforage";
import { TweakpaneContext } from "./TweakpaneContext";

const eventKeys = ["~", "F1"];
const localForageKey = "tweakpaneEnabled";

export const TweakpaneProvider: React.FC<{
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
      const pane = new Pane({
        title: "Developer Options",
        container: containerRef.current,
      });
      paneRef.current = pane;

      const closeButton = pane.addButton({
        title: "Close This Dev GUI",
        label: "Toggle with F1 or ~",
      });
      closeButton.on("click", toggleTweakpane);
    }

    return () => {
      paneRef.current?.dispose();
      paneRef.current = null;
    };
  }, [toggleTweakpane]);

  const { top, left, right } = position;

  return (
    <TweakpaneContext.Provider value={{ paneRef }}>
      <div
        ref={containerRef}
        id="tweakpane-container"
        hidden={isHidden}
        style={{
          position: "absolute",
          top,
          left,
          right,
          bottom: 0,
          zIndex: 10000,
          overflow: "hidden",
        }}
      ></div>
      {children}
    </TweakpaneContext.Provider>
  );
};

export default TweakpaneProvider;
