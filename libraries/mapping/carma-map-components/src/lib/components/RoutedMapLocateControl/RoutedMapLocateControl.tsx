import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { faLocationArrow } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect } from "react";
import { Tooltip } from "antd";
import { isDesktop } from "react-device-detect";

import { useRoutedMapLocateControl } from "./hooks/useRoutedMapLocateControl";
import "./leaflet-locate-overrides.css";

type RouteMapControlProps = {
  disabled: boolean;
  tourRefLabels: any;
  nativeTooltip?: boolean;
  backgroundColor?: string;
};

// Function to set CSS custom property for dynamic background color
const setLeafletBackgroundColor = (backgroundColor: string) => {
  document.documentElement.style.setProperty(
    "--leaflet-bg-color",
    backgroundColor
  );

  // Also set the data attribute for containers that exist
  const containers = document.querySelectorAll(".leaflet-container");
  containers.forEach((container) => {
    (container as HTMLElement).setAttribute("data-bg-color", "true");
    (container as HTMLElement).style.setProperty(
      "--leaflet-bg-color",
      backgroundColor
    );
  });
};

export const RoutedMapLocateControl = ({
  disabled = false,
  tourRefLabels,
  nativeTooltip = false,
  backgroundColor = "white",
}: RouteMapControlProps) => {
  const { isLocationActive, hasMapMoved, setIsLocationActive } =
    useRoutedMapLocateControl();

  // Set background color using CSS custom properties
  useEffect(() => {
    if (backgroundColor) {
      setLeafletBackgroundColor(backgroundColor);
    }
  }, [backgroundColor]);

  console.debug("isLocationActive RENDER LOCATOR", isLocationActive);

  const cbs = !isDesktop ? (
    <ControlButtonStyler
      ref={tourRefLabels?.navigator ?? null}
      disabled={disabled}
      onClick={() => setIsLocationActive((prev) => !prev)}
      dataTestId="location-control"
    >
      <FontAwesomeIcon
        icon={faLocationArrow}
        //color={              isLocationActive ? (hasMapMoved ? "blue" : "orange") : ""            }
        className={`text-2xl ${
          isLocationActive
            ? hasMapMoved
              ? "text-blue-500"
              : "text-orange-500"
            : ""
        }`}
        title={
          nativeTooltip
            ? isLocationActive
              ? "Standortanzeige ausschalten"
              : "Standortanzeige einschalten"
            : undefined
        }
      />
    </ControlButtonStyler>
  ) : null;

  return (
    <>
      {nativeTooltip ? (
        cbs
      ) : (
        <Tooltip
          title={
            isLocationActive
              ? "Standortanzeige ausschalten"
              : "Standortanzeige einschalten"
          }
          placement="right"
        >
          {cbs}
        </Tooltip>
      )}
    </>
  );
};
