import { useRef, useState, useEffect } from "react";
import type { ButtonApi } from "tweakpane";
import { useTweakpaneCtx } from "@carma-commons/debug";
import { useCesiumContext } from "./useCesiumContext";
import { snapshotCesiumContext } from "../utils/cesiumContextSnapshot";

/**
 * Registers a Debug UI button that intentionally crashes the app to test ErrorBoundary handling.
 * The error is thrown during render by toggling local state.
 */
export function useDebugCrashControl(source: string = "useDebugCrashControl") {
  const [crash, setCrash] = useState<boolean>(false);
  const causeRef = useRef<Error | null>(null);
  const cesium = useCesiumContext();

  if (crash) {
    const err = new Error(`Debug UI forced crash (Cesium). source=${source}`);
    if (causeRef.current) {
      (err as unknown as { cause?: Error }).cause = causeRef.current;
    }
    // Attach Cesium context snapshot and additional runtime metrics
    (
      err as unknown as { carmaCesiumContext?: Record<string, unknown> }
    ).carmaCesiumContext = snapshotCesiumContext(cesium);

    const v = cesium.viewerRef.current as
      | Partial<{
          scene: Partial<{
            requestRenderMode: boolean;
            frameState: Partial<{ frameNumber: number }>;
            canvas: Partial<
              Pick<
                HTMLCanvasElement,
                "clientWidth" | "clientHeight" | "width" | "height"
              >
            >;
          }>;
          clock: Partial<{ currentTime: { toString: () => string } }>;
          cesiumWidget: Partial<{
            useDefaultRenderLoop: boolean;
            useBrowserRecommendedResolution: boolean;
            targetFrameRate: number;
            resolutionScale: number;
          }>;
        }>
      | undefined;
    const scene = v?.scene;
    const canvas = scene?.canvas;
    const widget = v?.cesiumWidget;
    (
      err as unknown as { carmaCesiumRuntime?: Record<string, unknown> }
    ).carmaCesiumRuntime = {
      requestRenderMode: scene?.requestRenderMode,
      frameNumber: scene?.frameState?.frameNumber,
      currentTime: v?.clock?.currentTime?.toString?.(),
      dpr: typeof window !== "undefined" ? window.devicePixelRatio : undefined,
      canvasClient: canvas && {
        w: canvas.clientWidth,
        h: canvas.clientHeight,
      },
      drawingBuffer: canvas && {
        w: canvas.width,
        h: canvas.height,
      },
      widget: widget && {
        useDefaultRenderLoop: widget.useDefaultRenderLoop,
        useBrowserRecommendedResolution: widget.useBrowserRecommendedResolution,
        targetFrameRate: widget.targetFrameRate,
        resolutionScale: widget.resolutionScale,
      },
    };
    (err as unknown as { forwarderAt?: string }).forwarderAt =
      new Date().toISOString();
    (err as unknown as { forwarderStack?: string }).forwarderStack = new Error(
      "DebugCrashControl render throw"
    ).stack;
    throw err;
  }

  const { paneCallback } = useTweakpaneCtx();
  useEffect(() => {
    if (!paneCallback) return;
    let crashCesiumButton: ButtonApi | null = null;
    paneCallback((pane) => {
      crashCesiumButton = pane.addButton({
        title: "Crash Cesium (ErrorBoundary)",
      });
      crashCesiumButton.on("click", () => {
        causeRef.current = new Error(
          "Debug UI force crash requested (Cesium click stack)"
        );
        setCrash(true);
      });
    });
    return () => {
      crashCesiumButton?.dispose();
    };
  }, [paneCallback]);
}
