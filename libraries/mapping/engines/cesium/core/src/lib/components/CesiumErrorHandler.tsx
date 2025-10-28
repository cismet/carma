import { useEffect, type MutableRefObject } from "react";
import type { CesiumWidget } from "@carma/cesium";

/**
 * Intercepts Cesium errors for a specific widget instance and dispatches them as custom events.
 * The CesiumErrorIndicator component listens to these events and displays them.
 *
 * Architecture:
 * - Instance-specific override (not global prototype pollution)
 * - Waits for widget to be ready before overriding
 * - Restores original method on unmount (proper cleanup)
 */
export const CesiumErrorHandler = ({
  widgetRef,
}: {
  widgetRef?: MutableRefObject<CesiumWidget | null>;
}) => {
  useEffect(() => {
    const widget = widgetRef?.current;
    if (!widget) {
      console.warn(
        "[CesiumErrorHandler] Widget not available, skipping error handler setup"
      );
      return;
    }

    console.log(
      "[CesiumErrorHandler] Overriding showErrorPanel for widget instance"
    );

    // Store original method for restoration
    const originalShowErrorPanel = widget.showErrorPanel.bind(widget);

    // Override only THIS widget instance
    widget.showErrorPanel = function (
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

    // Cleanup: restore original method on unmount
    return () => {
      if (widget && !widget.isDestroyed()) {
        widget.showErrorPanel = originalShowErrorPanel;
        console.log("[CesiumErrorHandler] Restored original showErrorPanel");
      }
    };
  }, [widgetRef]);

  return null;
};

export default CesiumErrorHandler;
