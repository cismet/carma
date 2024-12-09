import { CSSProperties } from "react";
// import { getFontSize } from "../../helper/print";
const TooltipWrapper = ({ northWest, northEast, southWest }) => {
  const previewStyles: CSSProperties = {
    position: "absolute",
    zIndex: 1000,
    top: `${northWest.y}px`,
    left: `${northWest.x}px`,
    width: `${northEast.x - northWest.x}px`,
    height: `${southWest.y - northWest.y}px`,
    pointerEvents: "none",
    opacity: 1,
    // fontSize: getFontSize(northEast.x - northWest.x),
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
    alignItems: "center",
    textAlign: "center",
    padding: "2px",
  };
  return (
    <div id="preview" style={previewStyles}>
      <div id="preview-tooltip-text">
        Verschieben durch Ziehen mit Maus bzw.
      </div>
      <div id="preview-tooltip-text" className="preview-tooltip-text">
        Druck starten mit Doppelklick
      </div>
      <div id="preview-tooltip-text">Abbruch mit &lt;esc&gt;</div>
    </div>
  );
};

export default TooltipWrapper;
