import React, { useState } from "react";
import { Button, Tooltip } from "antd";

export type SelectorAnchorProps = {
  translate3d: string; // e.g. `translate3d(0px, 80px, 0px)`
  tooltip: string;
  aria: string;
  onClick: () => void;
  label: React.ReactNode;
  billboardTransform: string; // transform that billboards to the viewer
  disabled?: boolean;
  color?: string;
  hoverColor?: string;
  rotateRad?: number;
};

const SelectorAnchor: React.FC<SelectorAnchorProps> = ({
  translate3d,
  tooltip,
  aria,
  onClick,
  label,
  billboardTransform,
  disabled = false,
  color,
  hoverColor,
  rotateRad,
}) => {
  const [hover, setHover] = useState(false);
  const effectiveColor = hover && !disabled ? hoverColor ?? color : color;
  return (
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
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
              color: effectiveColor,
              cursor: disabled ? "not-allowed" : "pointer",
              transition: "color 150ms ease-in-out",
              transform:
                rotateRad !== undefined ? `rotate(${rotateRad}rad)` : undefined,
              transformOrigin: "50% 50%",
            }}
          >
            {label}
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};

export default SelectorAnchor;
