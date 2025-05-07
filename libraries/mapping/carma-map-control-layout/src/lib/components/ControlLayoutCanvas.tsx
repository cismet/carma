import React, { ReactNode, useEffect, forwardRef, ForwardedRef } from "react";
import { ControlComponent, useControlContext } from "../map-control";
import ControlRenderer from "./ControlRenderer";

interface ControlLayoutCanvasProps {
  children: ReactNode;
}

const ControlLayoutCanvas = forwardRef(function ControlLayoutCanvas(
  { children }: ControlLayoutCanvasProps,
  ref?: ForwardedRef<HTMLDivElement>
) {
  const { controls, addCanvas, removeCanvas } = useControlContext();

  useEffect(() => {
    addCanvas(children);

    return () => {
      removeCanvas();
    };
  }, []);

  return (
    <div
      ref={ref}
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

      <ControlRenderer controls={controls} />
    </div>
  );
});

export default ControlLayoutCanvas;
