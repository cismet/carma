import React from "react";
import {
  Control,
  ControlButtonStyler,
} from "@carma-mapping/map-controls-layout";
import { InfoBoxMeasurement } from "./InfoBoxMeasurement";
import { MeasurementControlProps, MEASUREMENT_MODE } from "../../index.d";
import { useMapMeasurementsContext } from "./MapMeasurementsProvider";
import measureActive from "../assets/measure-active.png";
import measureInactive from "../assets/measure.png";

export const MeasurementControl: React.FC<Partial<MeasurementControlProps>> = ({
  isActive: propIsActive,
  onToggle: propOnToggle,
  position = "topleft",
  order = 10,
  iconBaseUrl,
  icons = {
    active: measureActive,
    inactive: measureInactive,
  },
  altText = "Measure",
  iconClassName = "w-6",
}) => {
  const { mode, toggleMeasurementMode } = useMapMeasurementsContext();

  // Use context values if props are not provided
  const isActive =
    propIsActive !== undefined
      ? propIsActive
      : mode === MEASUREMENT_MODE.MEASUREMENT;
  const onToggle = propOnToggle || toggleMeasurementMode;

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
            src={isActive ? icons.active : icons.inactive}
            alt={altText}
            className={iconClassName}
          />
        </ControlButtonStyler>
      </Control>
      {isActive && <InfoBoxMeasurement />}
    </>
  );
};
