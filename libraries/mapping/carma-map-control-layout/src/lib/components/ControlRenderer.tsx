import { type CSSProperties } from "react";
import { type ControlComponent } from "../map-control";
import { filterControls, sortControls } from "../utils/controlHelper";

interface ControlRendererProps {
  controls: ControlComponent[];
}

// --- Style Constants ---
const CONTROL_MARGIN_FROM_SAFE_AREA = "10px";
const TOP_CENTER_HORIZONTAL_OFFSET_FROM_SAFE_AREA_EDGE = "44px";

// Safe Area Inset CSS variables
const SAFE_AREA_TOP = "env(safe-area-inset-top, 0px)";
const SAFE_AREA_RIGHT = "env(safe-area-inset-right, 0px)";
const SAFE_AREA_BOTTOM = "env(safe-area-inset-bottom, 0px)";
const SAFE_AREA_LEFT = "env(safe-area-inset-left, 0px)";

const BASE_CONTROL_GROUP_STYLE: CSSProperties = {
  position: "absolute",
  display: "flex",
  border: "1px dashed limegreen", // Debug border
  flexDirection: "column",
  gap: "10px",
  pointerEvents: "auto",
  zIndex: 1500,
};
// --- End Style Constants ---

function ControlRenderer({ controls }: ControlRendererProps) {
  const topLeftControls = controls
    .filter((c) => filterControls(c, "topleft"))
    .sort(sortControls);
  const topRightControls = controls
    .filter((c) => filterControls(c, "topright"))
    .sort(sortControls);
  const topCenterControls = controls
    .filter((c) => filterControls(c, "topcenter"))
    .sort(sortControls);
  const bottomLeftControls = controls
    .filter((c) => filterControls(c, "bottomleft"))
    .sort(sortControls);
  const bottomRightControls = controls
    .filter((c) => filterControls(c, "bottomright"))
    .sort(sortControls);
  const bottomCenterControls = controls
    .filter((c) => filterControls(c, "bottomcenter"))
    .sort(sortControls);

  // --- Specific Style Objects for control groups ---
  const topLeftStyle: CSSProperties = {
    ...BASE_CONTROL_GROUP_STYLE,
    top: `calc(${SAFE_AREA_TOP} + ${CONTROL_MARGIN_FROM_SAFE_AREA})`,
    left: `calc(${SAFE_AREA_LEFT} + ${CONTROL_MARGIN_FROM_SAFE_AREA})`,
  };

  const topRightStyle: CSSProperties = {
    ...BASE_CONTROL_GROUP_STYLE,
    top: `calc(${SAFE_AREA_TOP} + ${CONTROL_MARGIN_FROM_SAFE_AREA})`,
    right: `calc(${SAFE_AREA_RIGHT} + ${CONTROL_MARGIN_FROM_SAFE_AREA})`,
  };

  const topCenterStyle: CSSProperties = {
    ...BASE_CONTROL_GROUP_STYLE,
    top: `calc(${SAFE_AREA_TOP} + ${CONTROL_MARGIN_FROM_SAFE_AREA})`,
    left: `calc(${SAFE_AREA_LEFT} + ${TOP_CENTER_HORIZONTAL_OFFSET_FROM_SAFE_AREA_EDGE})`,
    right: `calc(${SAFE_AREA_RIGHT} + ${TOP_CENTER_HORIZONTAL_OFFSET_FROM_SAFE_AREA_EDGE})`,
    alignItems: "center",
    zIndex: 1000, // Specific zIndex for topCenter
    fontSize: "14px", // Specific fontSize for topCenter
  };

  const bottomLeftStyle: CSSProperties = {
    ...BASE_CONTROL_GROUP_STYLE,
    bottom: `calc(${SAFE_AREA_BOTTOM} + ${CONTROL_MARGIN_FROM_SAFE_AREA})`,
    left: `calc(${SAFE_AREA_LEFT} + ${CONTROL_MARGIN_FROM_SAFE_AREA})`,
  };

  const bottomRightStyle: CSSProperties = {
    ...BASE_CONTROL_GROUP_STYLE,
    bottom: `calc(${SAFE_AREA_BOTTOM} + ${CONTROL_MARGIN_FROM_SAFE_AREA})`,
    right: `calc(${SAFE_AREA_RIGHT} + ${CONTROL_MARGIN_FROM_SAFE_AREA})`,
  };

  const bottomCenterStyle: CSSProperties = {
    ...BASE_CONTROL_GROUP_STYLE,
    bottom: `calc(${SAFE_AREA_BOTTOM} + ${CONTROL_MARGIN_FROM_SAFE_AREA})`,
    left: "50%",
    transform: "translateX(-50%)",
    alignItems: "center", // Center items within the column
  };
  // --- End Specific Style Objects ---

  return (
    <div
      className="w-full h-full pointer-events-none"
      style={{ zIndex: 400, border: "1px solid magenta" }} // Debug border for root container
    >
      {topLeftControls.length > 0 && (
        <div style={topLeftStyle}>
          {topLeftControls.map((control, index) => (
            <div key={`topLeft-${index}`}>{control.component}</div>
          ))}
        </div>
      )}

      {topRightControls.length > 0 && (
        <div style={topRightStyle}>
          {topRightControls.map((control, index) => (
            <div key={`topRight-${index}`}>{control.component}</div>
          ))}
        </div>
      )}

      {topCenterControls.length > 0 && (
        <div style={topCenterStyle}>
          {topCenterControls.map((control, index) => (
            <div key={`topCenter-${index}`}>{control.component}</div>
          ))}
        </div>
      )}

      {bottomLeftControls.length > 0 && (
        <div style={bottomLeftStyle}>
          {bottomLeftControls.map((control, index) => (
            <div key={`bottomLeft-${index}`}>{control.component}</div>
          ))}
        </div>
      )}

      {bottomRightControls.length > 0 && (
        <div style={bottomRightStyle}>
          {bottomRightControls.map((control, index) => (
            <div key={`bottomRight-${index}`}>{control.component}</div>
          ))}
        </div>
      )}

      {bottomCenterControls.length > 0 && (
        <div style={bottomCenterStyle}>
          {bottomCenterControls.map((control, index) => (
            <div key={`bottomCenter-${index}`}>{control.component}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ControlRenderer;
