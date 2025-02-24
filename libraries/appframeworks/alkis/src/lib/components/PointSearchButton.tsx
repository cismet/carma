import React from "react";
import { Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearchLocation } from "@fortawesome/free-solid-svg-icons";

interface PointSearchButtonProps {
  setMode: (mode: string) => void;
  iconStyle?: string;
}

export const PointSearchButton = ({
  setMode,
  iconStyle = "text-lg h-5 cursor-pointer",
}: PointSearchButtonProps) => {
  return (
    <Tooltip title="Flurstücksuche">
      <FontAwesomeIcon
        icon={faSearchLocation}
        className={iconStyle}
        onClick={() => setMode("point")}
      />
    </Tooltip>
  );
};
