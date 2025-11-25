import React, { forwardRef } from "react";
import { Tooltip } from "antd";
import {
  Control,
  ControlButtonStyler,
} from "@carma-mapping/map-controls-layout";
import { InfoBoxMeasurement } from "./InfoBoxMeasurement";
import { MeasurementControlProps, MEASUREMENT_MODE } from "../../index.d";
import { useMapMeasurementsContext } from "./MapMeasurementsProvider";
import measureActive from "../assets/measure-active.png";
import measureInactive from "../assets/measure.png";

export const MeasurementControl = forwardRef<
  HTMLButtonElement,
  MeasurementControlProps
>(
  (
    {
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

      // Universal features
      disabled = false,
      useDisabledStyle = true,
      tooltip,
      tooltipPlacement = "right",
      className = "",
      showInfoBox = true,
    },
    ref
  ) => {
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

    const controlButton = (
      <ControlButtonStyler
        ref={ref}
        onClick={disabled ? undefined : onToggle}
        disabled={disabled}
        useDisabledStyle={useDisabledStyle}
        dataTestId="measurement-control"
        className={className}
      >
        <img
          src={isActive ? icons.active : icons.inactive}
          alt={altText}
          className={iconClassName}
        />
      </ControlButtonStyler>
    );

    return (
      <div>
        <Control position={position} order={order}>
          {tooltip ? (
            <Tooltip title={tooltip} placement={tooltipPlacement}>
              {controlButton}
            </Tooltip>
          ) : (
            controlButton
          )}
        </Control>
        {isActive && showInfoBox && <InfoBoxMeasurement />}
      </div>
    );
  }
);
