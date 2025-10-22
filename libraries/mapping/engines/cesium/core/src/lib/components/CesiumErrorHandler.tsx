import { useEffect } from "react";

/**
 * Intercepts Cesium errors and dispatches them as custom events.
 * The CesiumErrorIndicator component listens to these events and displays them.
 */
export const CesiumErrorHandler = () => {
  useEffect(() => {
    (async () => {
      const { CesiumWidget } = await import("@carma/cesium");
      console.debug(
        "[CesiumErrorHandler] Overriding CesiumWidget.showErrorPanel"
      );

      // Override Cesium's default error panel with custom event dispatch
      CesiumWidget.prototype.showErrorPanel = function (
        title: string,
        message: string,
        error: unknown
      ) {
        // Normalize to Error instance
        const errorObj =
          error instanceof Error
            ? error
            : typeof error === "string"
            ? new Error(error)
            : new Error("Cesium error (non-Error thrown)");

        console.error("[Cesium Error]", {
          title,
          message,
          error: errorObj,
        });

        // Dispatch event for CesiumErrorIndicator to catch
        window.dispatchEvent(
          new CustomEvent("carma:cesium:renderError", {
            detail: {
              error: errorObj,
              meta: {
                cesiumTitle: title,
                cesiumMessage: message,
                timestamp: Date.now(),
              },
            },
          })
        );
      };
    })();
  }, []);

  return null;
};

export default CesiumErrorHandler;
