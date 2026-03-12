import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import type { MouseEvent as ReactMouseEvent } from "react";

const DEFAULT_ICON_CLASSNAME =
  "cursor-pointer text-base text-[#808080] hover:text-[#a0a0a0]";

type AnnotationInfoBoxActionIconProps = {
  title: string;
  icon: IconDefinition;
  onClick: (event: ReactMouseEvent<SVGSVGElement, MouseEvent>) => void;
  dataTestId?: string;
  className?: string;
  ariaLabel?: string;
};

export const AnnotationInfoBoxActionIcon = ({
  title,
  icon,
  onClick,
  dataTestId,
  className,
  ariaLabel,
}: AnnotationInfoBoxActionIconProps) => {
  return (
    <Tooltip title={title}>
      <FontAwesomeIcon
        onClick={onClick}
        className={className ?? DEFAULT_ICON_CLASSNAME}
        icon={icon}
        data-test-id={dataTestId}
        aria-label={ariaLabel}
      />
    </Tooltip>
  );
};
