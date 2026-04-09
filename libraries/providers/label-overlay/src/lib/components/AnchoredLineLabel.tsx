import React, { CSSProperties, ReactNode } from "react";

const defaultStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  transform: "translate(-50%, -50%)",
  transformOrigin: "center center",
  whiteSpace: "nowrap",
  lineHeight: 1,
  userSelect: "none",
  pointerEvents: "none",
};

export interface AnchoredLineLabelProps {
  content: ReactNode;
  style: CSSProperties;
  onClick?: () => void;
}

export const AnchoredLineLabel = React.memo(
  ({ content, style, onClick }: AnchoredLineLabelProps) => {
    const isInteractive = typeof onClick === "function";

    return (
      <div
        data-anchored-line-label-root="true"
        style={{
          ...defaultStyle,
          ...style,
        }}
      >
        {content}
      </div>
    );
  }
);

AnchoredLineLabel.displayName = "AnchoredLineLabel";
