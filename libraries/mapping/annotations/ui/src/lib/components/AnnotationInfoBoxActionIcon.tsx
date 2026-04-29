import { useState, type MouseEvent as ReactMouseEvent } from "react";

import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";
import { resolveAnnotationInfoBoxVisualOptions } from "../config/annotation-info-box-visual-defaults";
import type {
  AnnotationInfoBoxActionId,
  AnnotationInfoBoxVisualOptions,
} from "../annotation-info-box.types";

const annotationInfoBoxActionIconDefaults = Object.freeze({
  tooltipZIndex: 1700,
});

type AnnotationInfoBoxActionIconProps = {
  actionId: AnnotationInfoBoxActionId;
  title: string;
  icon: IconDefinition;
  onClick: (event: ReactMouseEvent<HTMLElement, MouseEvent>) => void;
  dataTestId?: string;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
  visualOptions?: AnnotationInfoBoxVisualOptions;
};

export const AnnotationInfoBoxActionIcon = ({
  actionId,
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
  const iconClassName = `${resolvedVisualOptions.actionIconClassName}${
    className ? ` ${className}` : ""
  }${disabled ? " cursor-not-allowed opacity-50" : " cursor-pointer"}`;
  const iconStyle = {
    fontSize: resolvedVisualOptions.actionIconFontSize,
    color:
      hovered && !disabled
        ? resolvedVisualOptions.actionIconHoverColor
        : resolvedVisualOptions.actionIconColor,
  };
  const renderedCustomIcon = resolvedVisualOptions.renderActionIcon?.({
    actionId,
    icon,
    className: iconClassName,
    style: iconStyle,
    dataTestId,
    ariaLabel,
    disabled,
  });

  return (
    <Tooltip
      title={title}
      zIndex={annotationInfoBoxActionIconDefaults.tooltipZIndex}
      getPopupContainer={(triggerNode) => {
        const fallbackTriggerNode =
          triggerNode instanceof HTMLElement ? triggerNode : document.body;

        return resolvedVisualOptions.resolveActionTooltipPopupContainer(
          fallbackTriggerNode
        );
      }}
    >
      <span
        onClick={(event) => {
          if (disabled) {
            event.stopPropagation();
            return;
          }

          onClick(event);
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="inline-flex items-center leading-none"
        aria-label={ariaLabel}
        aria-disabled={disabled}
      >
        {renderedCustomIcon ?? (
          <FontAwesomeIcon
            className={iconClassName}
            style={iconStyle}
            icon={icon}
            data-test-id={dataTestId}
            aria-hidden={ariaLabel ? undefined : true}
          />
        )}
      </span>
    </Tooltip>
  );
};
