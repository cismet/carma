import { useMemo } from "react";
import type { RefObject } from "react";
import type { Viewer } from "cesium";

import { useTweakpaneCtx } from "@carma-commons/debug";

type UseDebugMapWrapperOptions = {
  viewerRef: RefObject<Viewer | null>;
  rerenderCountRef: React.MutableRefObject<number>;
  lastRenderIntervalRef: React.MutableRefObject<number>;
};

/**
 * Adds MapWrapper debug entries to the Tweakpane and a React crash test button.
 */
export function useDebug({
  viewerRef,
  rerenderCountRef,
  lastRenderIntervalRef,
}: UseDebugMapWrapperOptions) {
  // Register metrics folder/inputs
  useTweakpaneCtx(
    useMemo(
      () => ({
        folder: {
          title: "MapWrapper",
        },
        params: {
          get renderCount() {
            return rerenderCountRef.current;
          },
          get renderInterval() {
            return lastRenderIntervalRef.current;
          },
          dpr: window.devicePixelRatio,
          resolutionScale: viewerRef.current
            ? viewerRef.current.resolutionScale
            : 0,
        },
        inputs: [
          {
            name: "renderCount",
            readonly: true,
            format: (v: number) => v.toFixed(0),
          },
          {
            name: "renderInterval",
            readonly: true,
            format: (v: number) => v.toFixed(0),
          },
          { name: "dpr", readonly: true, format: (v: number) => v.toFixed(1) },
          {
            name: "resolutionScale",
            readonly: true,
            format: (v: number) => v.toFixed(1),
          },
        ],
      }),
      [viewerRef, rerenderCountRef, lastRenderIntervalRef]
    )
  );
}
