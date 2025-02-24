import { Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearchLocation } from "@fortawesome/free-solid-svg-icons";

interface PointSearchButtonProps {
  setMode: () => void;
  iconStyle?: string;
}

export const PointSearchButton = ({
  setMode,
  iconStyle = "text-lg h-5",
}: PointSearchButtonProps) => {
  return (
    <Tooltip title="Flurstücksuche">
      <FontAwesomeIcon
        icon={faSearchLocation}
        className={iconStyle}
        onClick={setMode}
      />
    </Tooltip>
  );
};
