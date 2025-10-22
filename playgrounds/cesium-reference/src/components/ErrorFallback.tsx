const ErrorFallback = ({
  error,
  resetErrorBoundary,
}: {
  error: Error;
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
      <h2>
        3D-Komponente (Cesium): {(error as any).cesiumTitle || error.name}
      </h2>
      <em>Fehlermeldung: {(error as any).cesiumMessage || error.message}</em>
      <h4>Fehlermeldungstyp: {error.name}</h4>
      <pre>{error.stack}</pre>
      <button onClick={resetErrorBoundary}>Reset</button>
    </div>
  );
};

export default ErrorFallback;
