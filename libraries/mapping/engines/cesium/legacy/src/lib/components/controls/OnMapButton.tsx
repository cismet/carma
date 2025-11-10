/* eslint-disable jsx-a11y/anchor-is-valid */

/* 
   this component should eventually be replaced with a button component 
   but to leverage the leaflet css classes and style nesting as-is, we are using an anchor tag
*/

import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ReactNode, MouseEvent, HTMLAttributes } from "react";

type OnMapButtonProps = HTMLAttributes<HTMLAnchorElement> & {
  icon?: IconDefinition;
  children?: ReactNode;
  title: string;
  ariaLabel?: string;
  disabled?: boolean;
  onClick?: (event: MouseEvent) => void;
};

const OnMapButton = (props: OnMapButtonProps) => {
  const {
    icon,
    disabled,
    children,
    title,
    ariaLabel,
    onClick,
    ...anchorProps
  } = props;
  return (
    <a
      {...anchorProps}
      className="leaflet-bar-part"
      href="#"
      title={title}
      role="button"
      aria-label={ariaLabel ?? title}
      aria-disabled={disabled === true ? "true" : "false"}
      onClick={disabled === true ? undefined : onClick}
    >
      {icon && <FontAwesomeIcon icon={icon} />}
      {children}
    </a>
  );
};

export default OnMapButton;
