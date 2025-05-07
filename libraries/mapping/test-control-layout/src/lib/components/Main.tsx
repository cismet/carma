import React, { ReactNode, useEffect } from "react";
import { ControlComponent, useControlContext } from "./ControlProvider";

interface MainProps {
  children: ReactNode;
}

export function Main({ children }: MainProps) {
  const { controls } = useControlContext();

  const filterControls = (control: ControlComponent, position: string) => {
    return (
      control.position === position && React.isValidElement(control.component)
    );
  };

  const sortControls = (a: ControlComponent, b: ControlComponent) => {
    return a.order - b.order;
  };

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

  return (
    <div
      style={{
        height: "100%",
        position: "relative",
        width: "100%",
      }}
    >
      <div
        style={{
          height: "100%",
          position: "relative",
          width: "100%",
        }}
      ></div>
      <div
        style={{
          position: "absolute",
          maxWidth: "100%",
          maxHeight: "100%",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      >
        {children}
      </div>

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
            alignItems: "center",
          }}
        >
          {topCenterControls.map((control, index) => (
            <>{control.component}</>
          ))}
        </div>
      )}

      {bottomLeftControls.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: "0",
            left: "0",
            zIndex: 500,
            margin: "10px 10px 5px 10px",
          }}
        >
          {bottomLeftControls.map((control, index) => (
            <>{control.component}</>
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
