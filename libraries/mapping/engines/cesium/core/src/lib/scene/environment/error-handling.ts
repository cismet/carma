import { CesiumWidget } from "@carma/cesium";
import { checkWindowEnv, getCesiumVersion } from "./env";

const patchedScenes = new WeakSet<object>();

const normalizeError = (e: unknown): Error =>
  e instanceof Error ? e : new Error(String(e));

const disableCesiumErrorPanel = (widget: CesiumWidget) => {
  const w = widget as { showRenderLoopErrors?: boolean };
  if (typeof w.showRenderLoopErrors === "boolean") {
    w.showRenderLoopErrors = false;
  }
};

const callRenderErrorRaise = (widget: CesiumWidget, error: Error) => {
  const ev = widget.scene.renderError as { raiseEvent?: (e: Error) => void };
  ev?.raiseEvent?.(error);
};

const callShowErrorPanel = (
  widget: CesiumWidget,
  title: string,
  message: string,
  error: Error
) => {
  const w = widget as {
    showErrorPanel?: (title: string, message: string, error?: unknown) => void;
  };
  w.showErrorPanel?.(title, message, error);
};

/**
 * Configure Cesium to avoid disruptive error panels and centralize render error logging.
 * - Suppresses Cesium's default render loop error panel
 * - Ensures render errors are logged as warnings with useful metadata
 * - Exposes a global flag to optionally suppress forwarding to the React ErrorBoundary
 */
export type ConfigureCesiumErrorHandlingOptions = {
  suppressErrorPanel?: boolean; // default: true
  suppressErrorBoundaryForwarding?: boolean; // default: true (silently log)
  logLevel?: "warn" | "error"; // default: "warn"
};

export function configureCesiumErrorHandling(
  widget: CesiumWidget,
  options: ConfigureCesiumErrorHandlingOptions = {}
) {
  const {
    suppressErrorPanel = true,
    suppressErrorBoundaryForwarding = true,
    logLevel = "warn",
  } = options;

  try {
    if (suppressErrorPanel) disableCesiumErrorPanel(widget);

    const { scene } = widget;

    if (!patchedScenes.has(scene)) {
      patchedScenes.add(scene);

      // Prefer not rethrowing inside render loop
      if (typeof scene.rethrowRenderErrors === "boolean") {
        scene.rethrowRenderErrors = false;
      }

      scene.renderError.addEventListener((err: unknown) => {
        // Allow downstream to choose whether to forward to React ErrorBoundary
        if (suppressErrorBoundaryForwarding) {
          (window as any).CARMA_CESIUM_SUPPRESS_ERROR_BOUNDARY = true;
        }
        const workerBase = checkWindowEnv().cesiumBaseUrl;
        const meta = {
          cesiumVersion: getCesiumVersion(),
          workersBaseUrl: workerBase ? `${workerBase}/Workers` : undefined,
          baseUrl: workerBase,
          requestRenderMode: widget.scene.requestRenderMode,
          canvasSize: {
            width: widget.canvas.width,
            height: widget.canvas.height,
          },
          sceneMode: scene.mode,
        };

        // Enhanced error details - check if it's the Scene object bug
        let errorDetails;
        if (err instanceof Error) {
          errorDetails = {
            message: err.message,
            stack: err.stack,
            name: err.name,
          };
        } else if (
          err &&
          typeof err === "object" &&
          !("message" in err) &&
          ("primitives" in err || "camera" in err || "globe" in err)
        ) {
          // Cesium bug: Scene passed as error instead of actual Error
          // This is a known Cesium bug that happens occasionally but doesn't indicate a real problem
          errorDetails = {
            type: "Scene object (Cesium false positive)",
            warning:
              "Cesium passed Scene object instead of Error - this is typically harmless",
            note: "Scene is rendering successfully despite this event",
            sceneInfo: {
              mode: scene.mode,
              requestRenderMode: scene.requestRenderMode,
              primitives: scene.primitives.length,
              imageryLayers: scene.imageryLayers.length,
            },
          };
        } else {
          errorDetails = { raw: err, type: typeof err };
        }

        const msg = "[Cesium] renderError intercepted";
        if (logLevel === "error") {
          console.error(msg, errorDetails, meta);
        } else {
          console.warn(msg, errorDetails, meta);
        }

        // Notify application to optionally take stronger action (e.g., remount viewer)
        try {
          window.dispatchEvent(
            new CustomEvent("carma:cesium:renderError", {
              detail: { error: err, meta },
            })
          );
        } catch {}
      });
    }
  } catch (e) {
    console.warn("Failed to configure Cesium error handling", e);
  }
}

/**
 * Manually raise a Scene.renderError event to test error handling.
 */
export function triggerCesiumRenderError(
  widget: CesiumWidget,
  error: unknown = new Error("Manual test renderError")
) {
  try {
    const normalized = normalizeError(error);
    callRenderErrorRaise(widget, normalized);
  } catch (e) {
    console.warn("Failed to trigger renderError", e);
  }
}

/**
 * Manually invoke CesiumWidget.showErrorPanel path to test the forwarder.
 */
export function triggerCesiumShowErrorPanel(
  widget: CesiumWidget,
  title = "Manual Cesium error",
  message = "Triggered by cesiumErrorTest",
  error: unknown = new Error("Manual showErrorPanel test")
) {
  try {
    const normalized = normalizeError(error);
    callShowErrorPanel(widget, title, message, normalized);
  } catch (e) {
    console.warn("Failed to trigger showErrorPanel", e);
  }
}

/**
 * Detects if an error is a WebGL error that requires scene reinitialization.
 * 
 * Common WebGL errors that indicate the scene needs to be recreated:
 * - INVALID_OPERATION: Operation not allowed in current WebGL state
 * - INVALID_FRAMEBUFFER_OPERATION: Framebuffer is incomplete
 * - "deleted object": Attempting to use deleted WebGL resources
 * - "framebuffer": Generic framebuffer errors
 * 
 * @param error - The error to check (can be Error, string, or unknown)
 * @returns true if the error indicates a WebGL issue requiring scene reinit
 */
export function isWebGLErrorRequiringReinit(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  return (
    errorMessage.includes("INVALID_OPERATION") ||
    errorMessage.includes("INVALID_FRAMEBUFFER_OPERATION") ||
    errorMessage.includes("deleted object") ||
    errorMessage.includes("framebuffer")
  );
}
