import type { CSSProperties } from "react";

import {
  faArrowsLeftRightToLine,
  faArrowsUpDown,
  faCamera,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export interface CameraLimiterIconProps {
  requestedDisabledState: boolean;
  fontSize?: number | string;
  color?: string;
  className?: string;
  style?: CSSProperties;
}

export const CameraLimiterIcon = ({
  requestedDisabledState,
  fontSize = "1em",
  color,
  className,
  style,
}: CameraLimiterIconProps) => (
  <span
    aria-hidden="true"
    className={className}
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "0.125em",
      width: "1.75em",
      color,
      fontSize,
      lineHeight: 1,
      ...style,
    }}
  >
    <FontAwesomeIcon
      icon={faCamera}
      style={{
        width: "0.75em",
        height: "0.75em",
        lineHeight: 1,
        display: "block",
      }}
    />
    <FontAwesomeIcon
      icon={requestedDisabledState ? faArrowsUpDown : faArrowsLeftRightToLine}
      rotation={requestedDisabledState ? undefined : 90}
      style={{
        width: "1em",
        height: "1em",
        lineHeight: 1,
        display: "block",
      }}
    />
  </span>
);

export default CameraLimiterIcon;
