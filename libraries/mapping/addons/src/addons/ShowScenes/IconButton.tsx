import { Button, Tooltip } from "antd";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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
  <Tooltip title={title}>
    <Button
      size="small"
      type="text"
      danger={danger}
      disabled={disabled}
      onClick={onClick}
      icon={<FontAwesomeIcon icon={icon} />}
      aria-label={title}
    />
  </Tooltip>
);
