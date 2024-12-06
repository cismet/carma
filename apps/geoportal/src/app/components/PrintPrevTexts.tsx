import { divIcon } from "leaflet";

const PrintPrevTexts = ({ scale, dpi, format, hide = false }) => {
  return (
    <>
      {!hide && (
        <div id="preview-tooltip-text" className="print-tooltip-text">
          <div className="print-tooltip-text">Format: {format}</div>
          <div className="print-tooltip-text">1:{scale}</div>
          <div className="print-tooltip-text">Auflösung:{dpi}</div>
        </div>
      )}
    </>
  );
};

export default PrintPrevTexts;
