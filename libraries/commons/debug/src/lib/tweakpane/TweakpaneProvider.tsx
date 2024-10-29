import React, { useRef, useEffect, useState, useMemo } from "react";
import type { ReactNode } from "react";
import { Pane } from "tweakpane";
import localForage from "localforage";
import { hasHashParam, removeHashParam } from "../utils";
import { TweakpaneContext } from "./TweakpaneContext";

const eventKeys = ["~", "F12"];
const DEFAULT_DEBUG_PARAM = "dev";
const localForageKey = "tweakpaneEnabled";

export const TweakpaneProvider: React.FC<{
  children: ReactNode;
  hashparam?: string;
  position?: {
    top?: number;
    left?: number;
    right?: number;
  };
}> = ({
  children,
  hashparam = DEFAULT_DEBUG_PARAM,
  position = { top: 64, left: 64 },
}) => {
  const [hidden, setHidden] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<Pane | null>(null);

  useEffect(() => {
    const checkHashAndStoredState = async () => {
      const isEnabledFromHash = hasHashParam(hashparam);
      if (isEnabledFromHash) {
        // If 'dev' is in the URL, enable debug view immediately
        console.log("Dev mode enabled from hash");
        setHidden(true);
        await localForage.setItem(localForageKey, true);
      } else {
        // If 'dev' is not in the URL, check localForage
        const storedIsEnabled = await localForage.getItem(localForageKey);
        setHidden(storedIsEnabled === true);
      }
    };

    checkHashAndStoredState();

    const toggleTweakpane = (event: KeyboardEvent) => {
      if (eventKeys.includes(event.key)) {
        // dev state should not be persited in URL when sharing
        setHidden((prevState) => {
          const newState = !prevState;
          localForage.setItem(localForageKey, newState);
          newState === false && removeHashParam(hashparam);
          return newState;
        });
      }
    };
    window.addEventListener("keydown", toggleTweakpane);
    return () => {
      window.removeEventListener("keydown", toggleTweakpane);
    };
  }, [hashparam]);

  useEffect(() => {
    const disableTweakpane = () => {
      setHidden(true);
      localForage.removeItem(localForageKey);
      removeHashParam(hashparam);
    };

    if (!paneRef.current && containerRef.current) {
      const pane = new Pane({
        title: "Developer Options",
        container: containerRef.current,
      });
      paneRef.current = pane;

      const closeButton = pane.addButton({
        title: "Close This Dev GUI",
        label: "Toggle with F12 or ~",
      });
      closeButton.on("click", () => {
        disableTweakpane();
      });
    }

    return () => {
      if (paneRef.current) {
        paneRef.current.dispose();
        paneRef.current = null;
      }
    };
  }, [containerRef, hashparam]);

  const { top, left, right } = position ?? {};

  console.debug("RENDER: [DEBUG] TweakpaneProvider", hidden);

  // prevent re-rendering of children on change of isEnabled
  const memoizedChildren = useMemo(() => {
    return children;
  }, [children]);

  return (
    <TweakpaneContext.Provider value={{ paneRef }}>
      <div
        ref={containerRef}
        id="tweakpane-container"
        hidden={hidden}
        style={{
          position: "absolute",
          top,
          left,
          right,
          zIndex: 10000,
        }}
      ></div>
      {memoizedChildren}
    </TweakpaneContext.Provider>
  );
};

export default TweakpaneProvider;
