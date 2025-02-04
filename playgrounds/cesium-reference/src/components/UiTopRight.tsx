import React from "react";

interface Props {
  children?: React.ReactNode;
}

const UiTopRight = React.forwardRef<HTMLDivElement, Props>(
  ({ children }, ref) => {
    return (
      <div
        ref={ref}
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          padding: "10px",
          background: "rgba(255, 255, 255, 0.85)",
        }}
      >
        {children}
      </div>
    );
  }
);

export default UiTopRight;
