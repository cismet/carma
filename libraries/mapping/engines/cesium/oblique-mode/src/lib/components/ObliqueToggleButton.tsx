import { faImages, faPlane } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Tooltip } from "antd";

import { useOblique } from "../hooks/useOblique";

type ObliqueToggleButtonProps = {
  className?: string;
};

export const ObliqueToggleButton = ({
  className = "mr-2 select-none",
}: ObliqueToggleButtonProps) => {
  const { isObliqueMode, toggleObliqueMode } = useOblique();

  return (
    <Tooltip
      title={
        isObliqueMode
          ? "Schrägansicht deaktivieren"
          : "Schrägansicht aktivieren"
      }
    >
      <Button
        type={isObliqueMode ? "primary" : "default"}
        onClick={toggleObliqueMode}
        className={className}
      >
        <FontAwesomeIcon icon={faPlane} rotation={270} />
        <FontAwesomeIcon icon={faImages} />
      </Button>
    </Tooltip>
  );
};
