import React from "react";
import { Button, Tooltip } from "antd";

export type SelectorAnchorProps = {
  translate3d: string; // e.g. `translate3d(0px, 80px, 0px)`
  tooltip: string;
  aria: string;
  onClick: () => void;
  label: React.ReactNode;
  billboardTransform: string; // transform that billboards to the viewer
  disabled?: boolean;
};

const SelectorAnchor: React.FC<SelectorAnchorProps> = ({
  translate3d,
  tooltip,
  aria,
  onClick,
  label,
  billboardTransform,
  disabled = false,
}) => (
  <div
    className="absolute"
    style={{
      left: "50%",
      top: "50%",
      transformStyle: "preserve-3d",
      transform: `translate(-50%, -50%) ${translate3d}`,
      pointerEvents: "none",
    }}
  >
    <div
      style={{
        transform: billboardTransform,
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      <Tooltip title={tooltip} open={disabled ? false : undefined}>
        <Button
          size="small"
          shape="circle"
          onClick={onClick}
          aria-label={aria}
          disabled={disabled}
          aria-disabled={disabled}
        >
          {label}
        </Button>
      </Tooltip>
    </div>
  </div>
);

export default SelectorAnchor;
