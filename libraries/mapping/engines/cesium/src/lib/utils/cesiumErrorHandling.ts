import { Viewer } from "cesium";
import { getCesiumVersion } from "./cesiumEnv";

const tag = Symbol.for("carma.cesium.renderErrorPatch");

type TaggedScene = {
  [key in typeof tag]: true;
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
    if (suppressErrorPanel) {
      // Optional: Suppress Cesium's own error panel
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (viewer.cesiumWidget as any)._showRenderLoopErrors = false;
    }

    const { scene } = viewer;

    const taggedScene = scene as unknown as TaggedScene;
    if (!taggedScene[tag]) {
      taggedScene[tag] = true;

      // Prefer not rethrowing inside render loop
      if (typeof scene.rethrowRenderErrors === "boolean") {
        scene.rethrowRenderErrors = false;
      }

      scene.renderError.addEventListener((err: unknown) => {
        // Allow downstream to choose whether to forward to React ErrorBoundary
        if (suppressErrorBoundaryForwarding) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).CARMA_CESIUM_SUPPRESS_ERROR_BOUNDARY = true;
        }
        const workerBase = (window as unknown as { CESIUM_BASE_URL?: string })
          .CESIUM_BASE_URL;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (viewer.scene.renderError as any).raiseEvent(error);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (viewer.cesiumWidget as any).showErrorPanel(title, message, error);
  } catch (e) {
    console.warn("Failed to trigger showErrorPanel", e);
  }
}
