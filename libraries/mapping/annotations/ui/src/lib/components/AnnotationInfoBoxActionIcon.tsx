import { useState, type MouseEvent as ReactMouseEvent } from "react";

import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";
import { resolveAnnotationInfoBoxVisualOptions } from "../config/annotation-info-box-visual-defaults";
import type { AnnotationInfoBoxVisualOptions } from "../annotation-info-box.types";

const annotationInfoBoxActionIconDefaults = Object.freeze({
  tooltipZIndex: 1700,
});

type AnnotationInfoBoxActionIconProps = {
  title: string;
  icon: IconDefinition;
  onClick: (event: ReactMouseEvent<SVGSVGElement, MouseEvent>) => void;
  dataTestId?: string;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
  visualOptions?: AnnotationInfoBoxVisualOptions;
};

export const AnnotationInfoBoxActionIcon = ({
  title,
  icon,
  onClick,
  dataTestId,
  className,
  ariaLabel,
  disabled = false,
  visualOptions,
}: AnnotationInfoBoxActionIconProps) => {
  const resolvedVisualOptions =
    resolveAnnotationInfoBoxVisualOptions(visualOptions);
  const [hovered, setHovered] = useState(false);

  return (
    <Tooltip
      title={title}
      zIndex={annotationInfoBoxActionIconDefaults.tooltipZIndex}
      getPopupContainer={(triggerNode) =>
        triggerNode.ownerDocument?.body ?? document.body
      }
    >
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
