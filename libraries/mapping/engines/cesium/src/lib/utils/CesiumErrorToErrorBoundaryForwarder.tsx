import {
  type ErrorBoundaryProps,
  useErrorBoundary,
  withErrorBoundary,
} from "react-error-boundary";
import { useState, useEffect } from "react";
import { CesiumWidget } from "cesium";
import { useCesiumContext } from "../hooks/useCesiumContext";
import { snapshotCesiumContext } from "./cesiumContextSnapshot";

export type ForwardedCesiumError = Error & {
  cesiumTitle?: string;
  cesiumMessage?: string;
  // snapshot of useful state at forward-time
  forwarderAt?: string;
  forwarderStack?: string;
  carmaCesiumContext?: Record<string, unknown>;
  originalStack?: string;
};

const overrideCesiumWidgetShowErrorPanel = function (
  setCesiumError: React.Dispatch<
    React.SetStateAction<ForwardedCesiumError | null>
  >
) {
  CesiumWidget.prototype.showErrorPanel = function (
    title: string,
    message: string,
    error: unknown
  ) {
    console.debug("[Cesium] showErrorPanel invoked");
    // Normalize any input (string/object) to a real Error instance
    const base: Error =
      error instanceof Error
        ? error
        : typeof error === "string"
        ? new Error(error)
        : new Error("Cesium error (non-Error thrown)");

    const forwarded = base as ForwardedCesiumError;
    forwarded.cesiumTitle = title;
    forwarded.cesiumMessage = message;
    forwarded.originalStack = base.stack;
    // capture the forwarder stack to aid root-cause tracing
    forwarded.forwarderStack = new Error(
      "Forwarded from CesiumWidget.showErrorPanel"
    ).stack;
    setCesiumError(forwarded);
  };
};

export const CesiumErrorToErrorBoundaryForwarder = withErrorBoundary(
  function CesiumErrorToErrorBoundaryForwarder() {
    const [cesiumError, setCesiumError] = useState<ForwardedCesiumError | null>(
      null
    );

    const { showBoundary } = useErrorBoundary();
    const ctx = useCesiumContext();

    useEffect(() => {
      console.debug(
        "overriding CesiumWidget.showErrorPanel with custom Error forwarder"
      );
      overrideCesiumWidgetShowErrorPanel(setCesiumError);
    }, [showBoundary]);

    useEffect(() => {
      if (cesiumError && showBoundary) {
        cesiumError.forwarderAt = new Date().toISOString();
        cesiumError.carmaCesiumContext = snapshotCesiumContext(ctx);
        showBoundary(cesiumError);
        setCesiumError(null);
      }
    }, [cesiumError, showBoundary, ctx]);

    return null;
  },
  {
    // render component intentionally missing to not override external ErrorBoundary
    // withErrorBoundary is used to allow use of this component outside of ErrorBoundary contexts without causing errors because of the missing context
    onError: (error, info) => {
      console.error(
        "Consider using ErrorBoundary to manage Cesium errors with app context",
        error,
        info
      );
    },
  } as ErrorBoundaryProps
);

export default CesiumErrorToErrorBoundaryForwarder;
