import React, { forwardRef } from "react";

interface LabelOverlayContainerProps
  extends React.HTMLAttributes<HTMLDivElement> {}

export const LabelOverlayContainer = forwardRef<
  HTMLDivElement,
  LabelOverlayContainerProps
>(({ style, ...props }, ref) => {
  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        ...style,
      }}
      {...props}
    />
  );
});

LabelOverlayContainer.displayName = "LabelOverlayContainer";
