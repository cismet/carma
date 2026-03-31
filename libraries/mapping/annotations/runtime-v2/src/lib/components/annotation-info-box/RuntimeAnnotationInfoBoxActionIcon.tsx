import type { MouseEvent as ReactMouseEvent } from "react";

import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";
const DEFAULT_ICON_CLASSNAME =
  "cursor-pointer text-base text-[#808080] hover:text-[#a0a0a0]";

type RuntimeAnnotationInfoBoxActionIconProps = {
  title: string;
  icon: IconDefinition;
  onClick: (event: ReactMouseEvent<SVGSVGElement, MouseEvent>) => void;
  dataTestId?: string;
  className?: string;
  ariaLabel?: string;
};

export const RuntimeAnnotationInfoBoxActionIcon = ({
  title,
  icon,
  onClick,
  dataTestId,
  className,
  ariaLabel,
}: RuntimeAnnotationInfoBoxActionIconProps) => {
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
