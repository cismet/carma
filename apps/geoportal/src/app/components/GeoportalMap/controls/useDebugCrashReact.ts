import { useEffect, useRef, useState } from "react";
import type { ButtonApi } from "tweakpane";
import { useTweakpaneCtx } from "@carma-commons/debug";

/**
 * Registers a top-level Tweakpane button that triggers a React crash to test ErrorBoundary.
 * The error is thrown during render via local state toggle.
 */
export function useDebugCrashReact(source: string = "useDebugCrashReact") {
  const [crash, setCrash] = useState(false);
  const causeRef = useRef<Error | null>(null);

  if (crash) {
    const err = new Error(`Debug UI forced crash (React). source=${source}`);
    if (causeRef.current) {
      (err as unknown as { cause?: Error }).cause = causeRef.current;
    }
    throw err;
  }

  const { paneCallback, paneRef } = useTweakpaneCtx();
  const crashBtnRef = useRef<ButtonApi | null>(null);
  const intervalRef = useRef<number | null>(null);
  useEffect(() => {
    if (!paneCallback) return;
    const clear = () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    const attach = () => {
      if (crashBtnRef.current) {
        clear();
        return;
      }
      if (!paneRef.current) return;
      paneCallback((pane) => {
        if (crashBtnRef.current) return;
        const btn = pane.addButton({ title: "Crash React (ErrorBoundary)" });
        btn.on("click", () => {
          causeRef.current = new Error(
            "Debug UI force crash requested (React click stack)"
          );
          setCrash(true);
        });
        crashBtnRef.current = btn;
        clear();
      });
    };
    attach();
    intervalRef.current = window.setInterval(attach, 250);
    return () => {
      clear();
      crashBtnRef.current?.dispose();
      crashBtnRef.current = null;
    };
  }, [paneCallback, paneRef]);
}

export default useDebugCrashReact;
