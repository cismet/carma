import { ReactNode, useEffect } from "react";
import { useControlContext } from "./ControlProvider";

interface MainProps {
  children: ReactNode;
}

export function Main({ children }: MainProps) {
  const { controls } = useControlContext();

  console.log("xxx", controls);

  const topLeftControls = controls
    .filter((c) => c.position === "topleft")
    .sort((a, b) => a.order - b.order);
  const topRightControls = controls
    .filter((c) => c.position === "topright")
    .sort((a, b) => a.order - b.order);
  const topCenterControls = controls
    .filter((c) => c.position === "topcenter")
    .sort((a, b) => a.order - b.order);
  const bottomLeftControls = controls
    .filter((c) => c.position === "bottomleft")
    .sort((a, b) => a.order - b.order);
  const bottomRightControls = controls
    .filter((c) => c.position === "bottomright")
    .sort((a, b) => a.order - b.order);
  const bottomCenterControls = controls
    .filter((c) => c.position === "bottomcenter")
    .sort((a, b) => a.order - b.order);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      {children}

      {topLeftControls.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            zIndex: 500,
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            margin: "10px",
          }}
        >
          {topLeftControls.map((control, index) => (
            <div key={`top-left-${index}`}>{control.component}</div>
          ))}
        </div>
      )}

      {topRightControls.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            zIndex: 500,
            margin: "10px",
          }}
        >
          {topRightControls.map((control, index) => (
            <div key={`top-right-${index}`}>{control.component}</div>
          ))}
        </div>
      )}

      {topCenterControls.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "44px",
            right: "44px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            zIndex: 1000,
            margin: "10px",
            fontSize: "14px",
          }}
        >
          {topCenterControls.map((control, index) => (
            <div key={`top-center-${index}`}>{control.component}</div>
          ))}
        </div>
      )}

      {bottomLeftControls.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: "10px",
            left: "10px",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column-reverse",
            gap: "10px",
          }}
        >
          {bottomLeftControls.map((control, index) => (
            <div key={`bottom-left-${index}`}>{control.component}</div>
          ))}
        </div>
      )}

      {bottomRightControls.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: "10px",
            right: "10px",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column-reverse",
            gap: "10px",
            alignItems: "flex-end",
          }}
        >
          {bottomRightControls.map((control, index) => (
            <div key={`bottom-right-${index}`}>{control.component}</div>
          ))}
        </div>
      )}

      {bottomCenterControls.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: "10px",
            left: "50%",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            alignItems: "center",
          }}
        >
          {bottomCenterControls.map((control, index) => (
            <div key={`bottom-center-${index}`}>{control.component}</div>
          ))}
        </div>
      )}
    </div>
  );
}
