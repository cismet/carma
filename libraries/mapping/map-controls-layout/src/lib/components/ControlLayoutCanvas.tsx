import React, { ReactNode, useEffect, forwardRef, ForwardedRef } from "react";
import { useControlContext } from "../map-control";
import ControlRenderer from "./ControlRenderer";
import { DEFAULT_CONTROL_STYLE_OPTIONS } from "./control-styles";

interface ControlLayoutCanvasProps {
  children: ReactNode;
}

const ControlLayoutCanvas = forwardRef(function ControlLayoutCanvas(
  { children }: ControlLayoutCanvasProps,
  ref?: ForwardedRef<HTMLDivElement>
) {
  const { registry, addCanvas, removeCanvas } = useControlContext();
  const { mapContentZIndex } = DEFAULT_CONTROL_STYLE_OPTIONS.layout;

  useEffect(() => {
    addCanvas();

    return () => {
      removeCanvas();
    };
  }, [addCanvas, removeCanvas]);

  return (
    <div
      ref={ref}
      style={{
        height: "100%",
        isolation: "isolate",
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
          zIndex: mapContentZIndex,
        }}
      >
        {children}
      </div>

      <ControlRenderer registry={registry} />
    </div>
  );
});

export default ControlLayoutCanvas;
