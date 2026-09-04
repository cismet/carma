import { useLocate } from "@carma-mapping/contexts";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { faLocationArrow, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";
import { isDesktop } from "react-device-detect";

type LibreMapLocateControlProps = {
  disabled?: boolean;
  nativeTooltip?: boolean;
};

export const LibreMapLocateControl = ({
  disabled = false,
  nativeTooltip = false,
}: LibreMapLocateControlProps) => {
  const { isLocationActive, hasMapMoved, toggle, isLoading } = useLocate();

  const show = !isDesktop || isLocationActive || isLoading;

  const cbs = show ? (
    <ControlButtonStyler
      disabled={disabled}
      onClick={toggle}
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
