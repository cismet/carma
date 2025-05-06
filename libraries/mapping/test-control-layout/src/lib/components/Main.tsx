import { ReactNode, useEffect } from "react";
import { useControlContext } from "./ControlProvider";

interface MainProps {
  children: ReactNode;
}

export function Main({ children }: MainProps) {
  const { controls } = useControlContext();

  const topLeftControls = controls.filter((c) => c.position === "top-left");
  const topRightControls = controls.filter((c) => c.position === "top-right");
  const bottomLeftControls = controls.filter(
    (c) => c.position === "bottom-left"
  );
  const bottomRightControls = controls.filter(
    (c) => c.position === "bottom-right"
  );

  return (
    <div style={{ position: "relative" }}>
      {children}

      {topLeftControls.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "10px",
            left: "10px",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            gap: "10px",
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
            top: "10px",
            right: "10px",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            alignItems: "flex-end",
          }}
        >
          {topRightControls.map((control, index) => (
            <div key={`top-right-${index}`}>{control.component}</div>
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
    </div>
  );
}
