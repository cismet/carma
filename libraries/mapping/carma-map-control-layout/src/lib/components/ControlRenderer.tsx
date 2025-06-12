import { type CSSProperties } from "react";
import { type ControlComponent } from "../map-control";
import { filterControls, sortControls } from "../utils/controlHelper";

interface ControlRendererProps {
  controls: ControlComponent[];
}

// --- Style Constants ---
const MIN_MARGIN = "12.5px";

// Safe area inset constants with fallback values (matching Tailwind config logic)
const SAFE_AREA_TOP = `max(${MIN_MARGIN}, env(safe-area-inset-top))`;
const SAFE_AREA_BOTTOM = `max(${MIN_MARGIN}, env(safe-area-inset-bottom))`;
const SAFE_AREA_LEFT = `max(${MIN_MARGIN}, env(safe-area-inset-left))`;
const SAFE_AREA_RIGHT = `max(${MIN_MARGIN}, env(safe-area-inset-right))`;

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
  bottom: SAFE_AREA_BOTTOM,
  left: SAFE_AREA_LEFT,
  right: SAFE_AREA_RIGHT,
  display: "flex",
  flexWrap: "wrap-reverse",
  justifyContent: "space-between",
  pointerEvents: "none",
  zIndex: 1500,
  gap: "1px",
  rowGap: "4px",
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
    top: SAFE_AREA_TOP,
    left: SAFE_AREA_LEFT,
    flexWrap: "wrap",
    maxHeight: `calc(100svh - 8rem)`,
  };

  const topRightStyle: CSSProperties = {
    ...BASE_CONTROL_GROUP_STYLE,
    top: SAFE_AREA_TOP,
    right: SAFE_AREA_RIGHT,
    flexWrap: "wrap",
    maxHeight: `calc(100svh - 8rem)`,
  };

  const topCenterStyle: CSSProperties = {
    ...BASE_CONTROL_GROUP_STYLE,
    top: SAFE_AREA_TOP,
    left: "50%",
    width: `calc(100vw - ${SAFE_AREA_LEFT} - ${SAFE_AREA_RIGHT} - 4rem)`,
    transform: "translateX(-50%)",
    flexDirection: "row",
    display: "flex",
    zIndex: 1600, // should be above map controls on left and right if pressed
    fontSize: "14px",
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
            <div
              style={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
              key={`topCenter-${index}`}
            >
              {control.component}
            </div>
          ))}
        </div>
      )}

      {(bottomLeftControls.length > 0 ||
        bottomRightControls.length > 0 ||
        bottomCenterControls.length > 0) && (
        <div
          style={{
            ...BOTTOM_CONTROLS_CONTAINER_STYLE,
            justifyContent:
              bottomLeftControls.length > 0 ? "space-between" : "flex-end",
          }}
        >
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
