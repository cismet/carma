import { CSSProperties, MouseEvent, ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";

export interface VisibilityToggleButtonProps {
  isVisible: boolean;
  onToggle: (nextVisible: boolean) => void;
  leadingIcon?: ReactNode;
  fontSize?: number | string;
  iconSlotWidth?: number | string;
  iconSlotHeight?: number | string;
  disabled?: boolean;
  ariaLabel?: string;
  dataTestId?: string;
  style?: CSSProperties;
  className?: string;
  stopPropagation?: boolean;
}

export const VisibilityToggleButton = ({
  isVisible,
  onToggle,
  leadingIcon,
  fontSize = 11,
  iconSlotWidth = "1.2em",
  iconSlotHeight,
  disabled = false,
  ariaLabel,
  dataTestId,
  style,
  className,
  stopPropagation = false,
}: VisibilityToggleButtonProps) => {
  const resolvedIconSlotHeight = iconSlotHeight ?? iconSlotWidth;

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (stopPropagation) {
      event.stopPropagation();
    }
    if (disabled) return;
    onToggle(!isVisible);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel}
      data-test-id={dataTestId}
      disabled={disabled}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        ...style,
      }}
    >
      {leadingIcon ? (
        <span style={{ display: "inline-flex", alignItems: "center" }}>
          {leadingIcon}
        </span>
      ) : null}
      <span
        style={{
          display: "inline-flex",
          width: iconSlotWidth,
          height: resolvedIconSlotHeight,
          justifyContent: "center",
          alignItems: "center",
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        <FontAwesomeIcon
          icon={isVisible ? faEye : faEyeSlash}
          fixedWidth
          style={{
            fontSize,
            lineHeight: 1,
            width: "1em",
            height: "1em",
            display: "block",
          }}
        />
      </span>
    </button>
  );
};

export default VisibilityToggleButton;
