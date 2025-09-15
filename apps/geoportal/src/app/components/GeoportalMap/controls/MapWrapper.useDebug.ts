import { useMemo } from "react";

import { useTweakpaneCtx } from "@carma-commons/debug";
import { useCesiumContext } from "@carma-mapping/engines/cesium";

export function useDebug() {
  // Register metrics folder/inputs

  const viewerRef = useCesiumContext().viewerRef;

  useTweakpaneCtx(
    useMemo(
      () => ({
        folder: {
          title: "MapWrapper",
        },
        params: {
          dpr: window.devicePixelRatio,
          resolutionScale: viewerRef.current
            ? viewerRef.current.resolutionScale
            : 0,
        },
        inputs: [
          { name: "dpr", readonly: true, format: (v: number) => v.toFixed(1) },
          {
            name: "resolutionScale",
            readonly: true,
            format: (v: number) => v.toFixed(1),
          },
        ],
      }),
      [viewerRef]
    )
  );
}
