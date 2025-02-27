import { useMemo } from "react";
import { Viewer } from "cesium";
import { useTweakpaneCtx } from "@carma-commons/debug";

export const useTweakpane = (
  viewerRef: React.MutableRefObject<Viewer | null>,
  rerenderCountRef: React.MutableRefObject<number>,
  lastRenderIntervalRef: React.MutableRefObject<number>
) => {
  return useTweakpaneCtx(
    useMemo(
      () => ({
        folder: {
          title: "GeoportalMap",
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
          { name: "renderCount", readonly: true, format: (v) => v.toFixed(0) },
          {
            name: "renderInterval",
            readonly: true,
            format: (v) => v.toFixed(0),
          },
          { name: "dpr", readonly: true, format: (v) => v.toFixed(1) },
          {
            name: "resolutionScale",
            readonly: true,
            format: (v) => v.toFixed(1),
          },
        ],
      }),
      [viewerRef, rerenderCountRef, lastRenderIntervalRef]
    )
  );
};
