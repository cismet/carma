import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import type { MouseEvent as ReactMouseEvent } from "react";
import { annotationTooltipProps } from "../../shared/annotationTooltip";

const DEFAULT_ICON_CLASSNAME =
  "cursor-pointer text-base text-[#808080] hover:text-[#a0a0a0]";
const DISABLED_ICON_CLASSNAME =
  "cursor-not-allowed text-base text-[#b8b8b8] opacity-50";

type AnnotationInfoBoxActionIconProps = {
  title: string;
  icon: IconDefinition;
  onClick: (event: ReactMouseEvent<SVGSVGElement, MouseEvent>) => void;
  dataTestId?: string;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
  fixedWidth?: boolean;
};

export const AnnotationInfoBoxActionIcon = ({
  title,
  icon,
  onClick,
  dataTestId,
  className,
  ariaLabel,
  disabled = false,
  fixedWidth = false,
}: AnnotationInfoBoxActionIconProps) => {
  return (
    <Tooltip {...annotationTooltipProps} title={title}>
      <FontAwesomeIcon
        onClick={(event) => {
          if (disabled) {
            event.stopPropagation();
            return;
          }
          onClick(event);
        }}
        className={
          className ?? (disabled ? DISABLED_ICON_CLASSNAME : DEFAULT_ICON_CLASSNAME)
        }
        icon={icon}
        data-test-id={dataTestId}
        aria-label={ariaLabel}
        aria-disabled={disabled}
        fixedWidth={fixedWidth}
      />
    </Tooltip>
  );
};
