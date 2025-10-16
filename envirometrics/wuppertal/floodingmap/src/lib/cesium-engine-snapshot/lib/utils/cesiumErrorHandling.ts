import { Viewer } from "cesium";
import { getCesiumVersion, checkWindowEnv } from "./cesiumEnv";

const patchedScenes = new WeakSet<object>();

const normalizeError = (e: unknown): Error =>
  e instanceof Error ? e : new Error(String(e));

const disableCesiumErrorPanel = (viewer: Viewer) => {
  const w = viewer.cesiumWidget as { showRenderLoopErrors?: boolean };
  if (typeof w.showRenderLoopErrors === "boolean") {
    w.showRenderLoopErrors = false;
  }
};

const callRenderErrorRaise = (viewer: Viewer, error: Error) => {
  const ev = viewer.scene.renderError as { raiseEvent?: (e: Error) => void };
  ev?.raiseEvent?.(error);
};

const callShowErrorPanel = (
  viewer: Viewer,
  title: string,
  message: string,
  error: Error
) => {
  const w = viewer.cesiumWidget as {
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
  viewer: Viewer,
  options: ConfigureCesiumErrorHandlingOptions = {}
) {
  const {
    suppressErrorPanel = true,
    suppressErrorBoundaryForwarding = true,
    logLevel = "warn",
  } = options;

  try {
    if (suppressErrorPanel) disableCesiumErrorPanel(viewer);

    const { scene } = viewer;

    if (!patchedScenes.has(scene)) {
      patchedScenes.add(scene);

      // Prefer not rethrowing inside render loop
      if (typeof scene.rethrowRenderErrors === "boolean") {
        scene.rethrowRenderErrors = false;
      }

      scene.renderError.addEventListener((err: unknown) => {
        // Allow downstream to choose whether to forward to React ErrorBoundary
        if (suppressErrorBoundaryForwarding) {
          window.CARMA_CESIUM_SUPPRESS_ERROR_BOUNDARY = true;
        }
        const workerBase = checkWindowEnv().cesiumBaseUrl;
        const meta = {
          cesiumVersion: getCesiumVersion(),
          workersBaseUrl: workerBase ? `${workerBase}/Workers` : undefined,
          baseUrl: workerBase,
          requestRenderMode: viewer.scene.requestRenderMode,
        };

        const msg = "[Cesium] renderError intercepted";
        if (logLevel === "error") {
          console.error(msg, err, meta);
        } else {
          console.warn(msg, err, meta);
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
  viewer: Viewer,
  error: unknown = new Error("Manual test renderError")
) {
  try {
    const normalized = normalizeError(error);
    callRenderErrorRaise(viewer, normalized);
  } catch (e) {
    console.warn("Failed to trigger renderError", e);
  }
}

/**
 * Manually invoke CesiumWidget.showErrorPanel path to test the forwarder.
 */
export function triggerCesiumShowErrorPanel(
  viewer: Viewer,
  title = "Manual Cesium error",
  message = "Triggered by cesiumErrorTest",
  error: unknown = new Error("Manual showErrorPanel test")
) {
  try {
    const normalized = normalizeError(error);
    callShowErrorPanel(viewer, title, message, normalized);
  } catch (e) {
    console.warn("Failed to trigger showErrorPanel", e);
  }
}
