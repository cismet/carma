import { useState, type MouseEvent as ReactMouseEvent } from "react";

import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";
import {
  resolveRuntimeAnnotationInfoBoxVisualOptions,
  type RuntimeAnnotationInfoBoxVisualOptions,
} from "./annotationInfoBoxVisualDefaults";

type RuntimeAnnotationInfoBoxActionIconProps = {
  title: string;
  icon: IconDefinition;
  onClick: (event: ReactMouseEvent<SVGSVGElement, MouseEvent>) => void;
  dataTestId?: string;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
  visualOptions?: RuntimeAnnotationInfoBoxVisualOptions;
};

export const RuntimeAnnotationInfoBoxActionIcon = ({
  title,
  icon,
  onClick,
  dataTestId,
  className,
  ariaLabel,
  disabled = false,
  visualOptions,
}: RuntimeAnnotationInfoBoxActionIconProps) => {
  const resolvedVisualOptions =
    resolveRuntimeAnnotationInfoBoxVisualOptions(visualOptions);
  const [hovered, setHovered] = useState(false);

  return (
    <Tooltip title={title}>
      <FontAwesomeIcon
        onClick={(event) => {
          if (disabled) {
            event.stopPropagation();
            return;
          }

          onClick(event);
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`${resolvedVisualOptions.actionIconClassName}${
          className ? ` ${className}` : ""
        }${disabled ? " cursor-not-allowed opacity-50" : " cursor-pointer"}`}
        style={{
          fontSize: resolvedVisualOptions.actionIconFontSize,
          color:
            hovered && !disabled
              ? resolvedVisualOptions.actionIconHoverColor
              : resolvedVisualOptions.actionIconColor,
        }}
        icon={icon}
        data-test-id={dataTestId}
        aria-label={ariaLabel}
        aria-disabled={disabled}
      />
    </Tooltip>
  );
};
