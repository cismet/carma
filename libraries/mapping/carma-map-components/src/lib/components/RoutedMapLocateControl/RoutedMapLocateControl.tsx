import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { faLocationArrow } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { createGlobalStyle } from "styled-components";
import { Tooltip } from "antd";
import { isDesktop } from "react-device-detect";

import { useRoutedMapLocateControl } from "./hooks/useRoutedMapLocateControl";

type RouteMapControlProps = {
  disabled: boolean;
  tourRefLabels: any;
};

const GlobalLocatorStyle = createGlobalStyle<{ backgroundColor?: string }>`
.dont-show {
  display: none !important;
}

.leaflet-control-locate {
  visibility: hidden !important;
}

.leaflet-container {
  background: ${({ backgroundColor = "white" }) => backgroundColor};
}`;

export const RoutedMapLocateControl = ({
  disabled = false,
  tourRefLabels,
}: RouteMapControlProps) => {
  const { isLocationActive, hasMapMoved, setIsLocationActive } =
    useRoutedMapLocateControl();

  console.debug("isLocationActive RENDER LOCATOR", isLocationActive);

  return (
    <>
      <GlobalLocatorStyle />
      {!isDesktop && (
        <Tooltip
          title={
            isLocationActive
              ? "Standortanzeige ausschalten"
              : "Standortanzeige einschalten"
          }
          placement="right"
        >
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
            />
          </ControlButtonStyler>
        </Tooltip>
      )}
    </>
  );
};
