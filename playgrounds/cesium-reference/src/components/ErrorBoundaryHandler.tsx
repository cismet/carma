
import { useErrorBoundary } from "react-error-boundary";

export type ForwardedCesiumError = Error & {
  cesiumTitle?: string;
  cesiumMessage?: string;
};

const ErrorBoundaryHandler = ({
  error,
  message,
  title,
}: {
  error: ForwardedCesiumError;
  title: string;
  message: string;
}) => {
  console.log("ErrorBoundaryHandler", title, message, error);
  error.cesiumTitle = title;
  error.cesiumMessage = message;
  const { showBoundary } = useErrorBoundary();

  showBoundary(error);

  return null;
};

export default ErrorBoundaryHandler;
