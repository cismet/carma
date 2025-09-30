import React from "react";
import { Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearchLocation } from "@fortawesome/free-solid-svg-icons";

interface PointSearchButtonProps {
  setMode: (mode: string) => void;
  iconStyle?: string;
  active?: boolean;
  mode: string;
  activeIndicatorColor?: string;
}

export const PointSearchButton = ({
  setMode,
  iconStyle = "text-lg h-5 cursor-pointer",
  active = false,
  mode,
  activeIndicatorColor = "primary",
}: PointSearchButtonProps) => {
  return (
    <div className="relative flex items-center" style={{ height: "24px" }}>
      <Tooltip title="Flurstücksinfo">
        <FontAwesomeIcon
          icon={faSearchLocation}
          className={iconStyle}
          onClick={() =>
            mode === "default" ? setMode("point") : setMode("default")
          }
        />
      </Tooltip>
      {
        <div
          className={`w-3 h-3 rounded-full bg-${activeIndicatorColor} ${
            active ? "absolute" : "hidden"
          } bottom-0 -right-1 cursor-pointer`}
        />
      }
    </div>
  );
};
