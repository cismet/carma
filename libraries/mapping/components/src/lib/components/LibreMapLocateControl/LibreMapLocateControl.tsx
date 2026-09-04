import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { faLocationArrow, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";
import { isDesktop } from "react-device-detect";
import type { Map as MapLibreMap } from "maplibre-gl";

import { useLibreMapLocateControl } from "./hooks/useLibreMapLocateControl";

type LibreMapLocateControlProps = {
  map: MapLibreMap | null;
  disabled?: boolean;
  nativeTooltip?: boolean;
  /** Render on desktop too. The control is mobile-only by default, which
   * makes it impossible to look at on a developer machine. */
  showOnDesktop?: boolean;
};

export const LibreMapLocateControl = ({
  map,
  disabled = false,
  nativeTooltip = false,
  showOnDesktop = false,
}: LibreMapLocateControlProps) => {
  const { isLocationActive, hasMapMoved, setIsLocationActive, isLoading } =
    useLibreMapLocateControl({ map });

  const cbs =
    !isDesktop || showOnDesktop ? (
      <ControlButtonStyler
        disabled={disabled}
        onClick={() => setIsLocationActive((prev) => !prev)}
        dataTestId="libre-location-control"
      >
        <FontAwesomeIcon
          icon={isLoading ? faSpinner : faLocationArrow}
          className={`text-2xl ${
            isLocationActive && !isLoading
              ? hasMapMoved
                ? "text-blue-500"
                : "text-orange-500"
              : ""
          } ${isLoading ? "animate-spin" : ""}`}
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
