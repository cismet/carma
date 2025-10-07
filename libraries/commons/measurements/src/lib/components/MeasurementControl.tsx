import React from "react";
import {
  Control,
  ControlButtonStyler,
} from "@carma-mapping/map-controls-layout";
import { InfoBoxMeasurement } from "./InfoBoxMeasurement";
import { MeasurementControlProps } from "../../index.d";
export const MeasurementControl: React.FC<MeasurementControlProps> = ({
  isActive,
  onToggle,
  position = "topleft",
  order = 10,
  iconBaseUrl,
  icons = {
    active: "measure-active.png",
    inactive: "measure.png",
  },
  altText = "Measure",
  iconClassName = "w-6",
}) => {
  const getUrlPrefix = () => {
    if (iconBaseUrl) {
      return iconBaseUrl.endsWith("/") ? iconBaseUrl : `${iconBaseUrl}/`;
    }
    const baseUrl = window.location.origin + window.location.pathname;
    return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  };

  return (
    <>
      <Control position={position} order={order}>
        <ControlButtonStyler onClick={onToggle}>
          <img
            src={`${getUrlPrefix()}${isActive ? icons.active : icons.inactive}`}
            alt={altText}
            className={iconClassName}
          />
        </ControlButtonStyler>
      </Control>
      {isActive && <InfoBoxMeasurement />}
    </>
  );
};
