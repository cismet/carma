import { useMapMeasurementsContext } from "./MapMeasurementsProvider";

export function MeasurementStatusDebug() {
  const { status, config } = useMapMeasurementsContext();

  if (!config.debugOutputMapStatus) {
    return null;
  }

  const { x, y } = config.debugOutputMapStatusPosition;

  return (
    <div
      style={{
        position: "fixed",
        left: `${x}px`,
        top: `${y}px`,
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        color: "#fff",
        padding: "8px 12px",
        borderRadius: "4px",
        fontFamily: "monospace",
        fontSize: "14px",
        fontWeight: "bold",
        zIndex: 10000,
        pointerEvents: "none",
        userSelect: "none",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
      }}
    >
      {status}
    </div>
  );
}
