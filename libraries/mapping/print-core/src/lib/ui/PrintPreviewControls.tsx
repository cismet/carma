// Presentational overlay rendered on top of the print preview rectangle.
// Engine-agnostic and Redux-free — it is a controlled component fed sizes /
// values as props and emitting intent via callbacks. This consolidates the
// four small geoportal map-print components (UpdateScalePrintButton,
// ClosePrintButton, PrintPrevTexts, PrintButton) into one piece so both the
// Leaflet and MapLibre previews render an identical overlay.

import type { CSSProperties } from "react";
import { faArrowsAlt, faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button } from "antd";

import type { Orientation } from "../core";

export interface PrintPreviewControlsProps {
  orientation: Orientation;
  /** Scale denominator as string (e.g. "250"); shown as "1:250". */
  scale: string;
  /** Resolution as string (e.g. "72"). */
  dpi: string;
  /** A print job is in flight — disable the print button / drag affordances. */
  loading?: boolean;
  /** Hide the text + buttons while the map is being dragged / zoomed. */
  hideContent?: boolean;
  /** Compact layout: the rectangle is too small for the full overlay. */
  smallMode?: boolean;
  /** Current pixel width of the preview rectangle (drives the move-icon fallback). */
  previewWidth: number;
  /** Current pixel height of the preview rectangle. */
  previewHeight: number;
  /** Overlay text size; computed by the engine via getPreviewFontSize. */
  fontSize?: string;

  onClose: () => void;
  onPrint: () => void;
  /** Re-center / redraw the rectangle at the current scale (the move handle). */
  onUpdateScale: () => void;

  closeLabel?: string;
  printLabel?: string;
}

const wrapperStyle: CSSProperties = {
  padding: "7px 7px",
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  flexGrow: 1,
  pointerEvents: "none",
};

const smallWrapperStyle: CSSProperties = {
  padding: "0px",
  width: "100%",
  height: "100%",
  display: "flex",
  flexGrow: 1,
  justifyContent: "center",
  alignItems: "center",
  pointerEvents: "none",
};

const textStyle: CSSProperties = {
  flexGrow: 1,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  margin: "auto",
  gap: "1rem",
  textAlign: "center",
};

export const PrintPreviewControls = ({
  orientation,
  scale,
  dpi,
  loading = false,
  hideContent = false,
  smallMode = false,
  previewWidth,
  previewHeight,
  fontSize,
  onClose,
  onPrint,
  onUpdateScale,
  printLabel = "Drucken",
}: PrintPreviewControlsProps) => {
  // Below this width the move icon would not fit; fall back to a full-rect
  // clickable surface (matches the geoportal UpdateScalePrintButton).
  const hideMoveIcon = previewWidth < 40;

  const moveIconStyle: CSSProperties = smallMode
    ? {
        fontSize: "20px",
        pointerEvents: "auto",
        transform: "rotate(45deg)",
        margin: "auto",
        cursor: loading ? "not-allowed" : "pointer",
      }
    : {
        fontSize: "24px",
        pointerEvents: "auto",
        transform: "rotate(45deg)",
        cursor: loading ? "not-allowed" : "pointer",
      };

  return (
    <div
      id="btn-wrapper-print"
      style={smallMode ? smallWrapperStyle : wrapperStyle}
    >
      <div style={{ display: "flex", width: "100%" }}>
        {!hideContent && !hideMoveIcon && (
          <FontAwesomeIcon
            icon={faArrowsAlt}
            style={moveIconStyle}
            onClick={loading ? undefined : onUpdateScale}
          />
        )}
        {hideMoveIcon && (
          <div
            role="button"
            tabIndex={0}
            aria-label="Vorschau neu zeichnen"
            style={{
              width: previewWidth,
              height: previewHeight,
              pointerEvents: "auto",
              cursor: loading ? "not-allowed" : "pointer",
            }}
            onClick={loading ? undefined : onUpdateScale}
            onKeyDown={
              loading
                ? undefined
                : (e) => {
                    if (e.key === "Enter" || e.key === " ") onUpdateScale();
                  }
            }
          />
        )}
        {!hideContent && !smallMode && (
          <FontAwesomeIcon
            icon={faTimes}
            className="text-xl cursor-pointer"
            style={{
              fontSize: "28px",
              marginLeft: "auto",
              pointerEvents: "auto",
            }}
            onClick={onClose}
          />
        )}
      </div>

      {!hideContent && !smallMode && (
        <div
          className="print-tooltip-text"
          style={{ ...textStyle, fontSize }}
        >
          <div className="print-tooltip-text">
            Format: {orientation === "portrait" ? "hoch" : "quer"}
          </div>
          <div className="print-tooltip-text">Maßstab: 1:{scale}</div>
          <div className="print-tooltip-text">Auflösung: {dpi} dpi</div>
        </div>
      )}

      {!hideContent && !smallMode && (
        <div className="flex items-center justify-end gap-4">
          <Button
            type="primary"
            loading={loading}
            onClick={onPrint}
            style={{ pointerEvents: "auto" }}
          >
            {printLabel}
          </Button>
        </div>
      )}
    </div>
  );
};

export default PrintPreviewControls;
