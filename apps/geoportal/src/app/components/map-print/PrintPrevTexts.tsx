import { divIcon } from "leaflet";

const PrintPrevTexts = ({
  scale,
  dpi,
  format,
  hide = false,
  smallMode = false,
}) => {
  return (
    <>
      {!hide && !smallMode && (
        <div
          id="preview-tooltip-text"
          className="print-tooltip-text"
          style={{
            flexGrow: "1",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            margin: "auto",
            gap: "1rem",
          }}
        >
          <div className="print-tooltip-text">
            Format: {format === "portrait" ? "Hoch" : "Quer"}
          </div>
          <div className="print-tooltip-text">Maßstab: 1:{scale}</div>
          <div className="print-tooltip-text">Auflösung:{dpi}</div>
        </div>
      )}
    </>
  );
};

export default PrintPrevTexts;
