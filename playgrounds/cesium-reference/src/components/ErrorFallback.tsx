import { ForwardedCesiumError } from "@carma-mapping/cesium-engine";

const ErrorFallback = ({
  error,
  resetErrorBoundary,
}: {
  error: ForwardedCesiumError;
  resetErrorBoundary: () => void;
}) => {
  console.log("ErrorFallback", error);

  return (
    <div
      style={{
        position: "absolute",
        top: 10,
        right: 10,
        left: 10,
        border: "1px solid red",
        padding: "10px",
        backgroundColor: "#ffe6e6",
      }}
    >
      Ein Fehler ist aufgetreten.
      <h2>3D-Komponente (Cesium): {error.cesiumTitle}</h2>
      <em>Fehlermeldung: {error.cesiumMessage}</em>
      <h4>Fehlermeldungstyp: {error.name}</h4>
      <pre>{error.stack}</pre>
      <button onClick={resetErrorBoundary}>Reset</button>
    </div>
  );
};

export default ErrorFallback;
