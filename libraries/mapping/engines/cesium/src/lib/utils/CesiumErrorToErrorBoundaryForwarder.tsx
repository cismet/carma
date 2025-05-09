import {
  type ErrorBoundaryProps,
  useErrorBoundary,
  withErrorBoundary,
} from "react-error-boundary";
import { useState, useEffect } from "react";
import { CesiumWidget } from "cesium";

export type ForwardedCesiumError = Error & {
  cesiumTitle?: string;
  cesiumMessage?: string;
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
    console.log("showErrorPanel");
    (error as ForwardedCesiumError).cesiumTitle = title;
    (error as ForwardedCesiumError).cesiumMessage = message;
    setCesiumError(error as ForwardedCesiumError);
  };
};

export const CesiumErrorToErrorBoundaryForwarder = withErrorBoundary(
  function CesiumErrorToErrorBoundaryForwarder() {
    const [cesiumError, setCesiumError] = useState<ForwardedCesiumError | null>(
      null
    );

    const { showBoundary } = useErrorBoundary();

    useEffect(() => {
      console.debug(
        "overriding CesiumWidget.showErrorPanel with custom Error forwarder"
      );
      overrideCesiumWidgetShowErrorPanel(setCesiumError);
    }, [showBoundary]);

    useEffect(() => {
      if (cesiumError && showBoundary) {
        showBoundary(cesiumError);
        setCesiumError(null);
      }
    }, [cesiumError, showBoundary]);

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
