import { useErrorBoundary } from "react-error-boundary";
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

export const CesiumErrorToErrorBoundaryForwarder = () => {
  const [cesiumError, setCesiumError] = useState<ForwardedCesiumError | null>(
    null
  );

  const { showBoundary } = useErrorBoundary();

  useEffect(() => {
    if (!showBoundary) {
      console.warn(
        "CesiumErrorToErrorBoundaryForwarder used outside of error boundary"
      );
      return;
    }
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
};

export default CesiumErrorToErrorBoundaryForwarder;
