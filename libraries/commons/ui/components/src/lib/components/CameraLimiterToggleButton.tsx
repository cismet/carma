import type { CSSProperties, MouseEvent } from "react";

import {
  CameraLimiterIcon,
  type CameraLimiterIconProps,
} from "./CameraLimiterIcon";

export interface CameraLimiterToggleButtonProps {
  areLimitersDisabled: boolean;
  onToggle: (nextDisabled: boolean) => void;
  fontSize?: CameraLimiterIconProps["fontSize"];
  color?: CameraLimiterIconProps["color"];
  iconClassName?: string;
  iconStyle?: CSSProperties;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  stopPropagation?: boolean;
}

export const CameraLimiterToggleButton = ({
  areLimitersDisabled,
  onToggle,
  fontSize,
  color,
  iconClassName,
  iconStyle,
  disabled = false,
  ariaLabel,
  className,
  style,
  stopPropagation = false,
}: CameraLimiterToggleButtonProps) => {
  const requestedDisabledState = !areLimitersDisabled;

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (stopPropagation) {
      event.stopPropagation();
    }
    if (disabled) return;
    onToggle(requestedDisabledState);
  };

  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={handleClick}
      disabled={disabled}
      aria-pressed={areLimitersDisabled}
      aria-label={ariaLabel}
    >
      <CameraLimiterIcon
        requestedDisabledState={requestedDisabledState}
        fontSize={fontSize}
        color={color}
        className={iconClassName}
        style={iconStyle}
      />
    </button>
  );
};

export default CameraLimiterToggleButton;
