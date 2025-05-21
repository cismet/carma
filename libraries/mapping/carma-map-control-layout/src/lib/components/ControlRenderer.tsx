import { type CSSProperties } from "react";
import { type ControlComponent } from "../map-control";
import { filterControls, sortControls } from "../utils/controlHelper";

interface ControlRendererProps {
  controls: ControlComponent[];
}

// --- Style Constants ---
const CONTROL_MARGIN_FROM_SAFE_AREA = "10px";
const TOOLBAR_HORIZONTAL_OFFSET = "44px";
const BOTTOM_EXTRA_MARGIN = "0px";

// Safe Area Inset CSS variables
const SAFE_AREA_TOP = "env(safe-area-inset-top, 0px)";
const SAFE_AREA_RIGHT = "env(safe-area-inset-right, 0px)";
const SAFE_AREA_BOTTOM = "env(safe-area-inset-bottom, 0px)";
const SAFE_AREA_LEFT = "env(safe-area-inset-left, 0px)";

const BASE_CONTROL_GROUP_STYLE: CSSProperties = {
  position: "absolute",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  pointerEvents: "auto",
  zIndex: 1500,
};

const BOTTOM_CONTROLS_CONTAINER_STYLE: CSSProperties = {
  position: "absolute",
  bottom: `calc(${SAFE_AREA_BOTTOM} + ${CONTROL_MARGIN_FROM_SAFE_AREA} + ${BOTTOM_EXTRA_MARGIN})`,
  left: `calc(${SAFE_AREA_LEFT} + ${CONTROL_MARGIN_FROM_SAFE_AREA})`,
  right: `calc(${SAFE_AREA_RIGHT} + ${CONTROL_MARGIN_FROM_SAFE_AREA})`,
  display: "flex",
  flexWrap: "wrap-reverse",
  justifyContent: "space-between",
  pointerEvents: "none",
  zIndex: 1500,
  gap: "4px",
};

const BOTTOM_CONTROL_GROUP_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  pointerEvents: "auto",
  height: "100%",
  fontFamily: "Helvetica Neue, Arial, Helvetica, sans-serif",
  fontSize: "0.75rem",
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
    left: `calc(${SAFE_AREA_LEFT} + ${TOOLBAR_HORIZONTAL_OFFSET})`,
    right: `calc(${SAFE_AREA_RIGHT} + ${TOOLBAR_HORIZONTAL_OFFSET})`,
    alignItems: "center",
    display: "flex",
    zIndex: 1000, // Specific zIndex for topCenter
    fontSize: "14px", // Specific fontSize for topCenter
  };

  const bottomLeftStyle: CSSProperties = {
    ...BOTTOM_CONTROL_GROUP_STYLE,
    alignItems: "flex-end",
  };

  const bottomRightStyle: CSSProperties = {
    ...BOTTOM_CONTROL_GROUP_STYLE,
    alignItems: "flex-end",
  };

  const bottomCenterStyle: CSSProperties = {
    ...BOTTOM_CONTROL_GROUP_STYLE,
    alignItems: "center",
  };
  // --- End Specific Style Objects ---

  return (
    <>
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
            <div style={{ width: "100%" }} key={`topCenter-${index}`}>
              {control.component}
            </div>
          ))}
        </div>
      )}

      {(bottomLeftControls.length > 0 ||
        bottomRightControls.length > 0 ||
        bottomCenterControls.length > 0) && (
        <div style={BOTTOM_CONTROLS_CONTAINER_STYLE}>
          {bottomLeftControls.length > 0 && (
            <div style={bottomLeftStyle}>
              {bottomLeftControls.map((control, index) => (
                <div key={`bottomLeft-${index}`}>{control.component}</div>
              ))}
            </div>
          )}

          {bottomCenterControls.length > 0 && (
            <div style={bottomCenterStyle}>
              {bottomCenterControls.map((control, index) => (
                <div style={{ width: "100%" }} key={`bottomCenter-${index}`}>
                  {control.component}
                </div>
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
        </div>
      )}
    </>
  );
}

export default ControlRenderer;
