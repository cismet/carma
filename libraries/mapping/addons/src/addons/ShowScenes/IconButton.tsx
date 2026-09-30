import { Button } from "antd";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

/** `title` names the button for screen readers; the panel shows no tooltips for now */
export const IconButton = ({
  title,
  icon,
  onClick,
  disabled,
  danger,
}: {
  title: string;
  icon: IconDefinition;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) => (
  <Button
    size="small"
    type="text"
    danger={danger}
    disabled={disabled}
    onClick={onClick}
    icon={<FontAwesomeIcon icon={icon} />}
    aria-label={title}
  />
);
