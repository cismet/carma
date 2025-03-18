import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { faLocationArrow } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";
import { useRoutedMapLocateControl } from "./hooks/useRoutedMapLocateControl";

type RouteMapControlProps = {
  tourRefLabels: any;
};

export const RoutedMapLocateControl = ({
  tourRefLabels,
}: RouteMapControlProps) => {
  const { isLocationActive, hasMapMoved, setIsLocationActive } =
    useRoutedMapLocateControl(true);

  console.debug("isLocationActive RENDER LOCATOR", isLocationActive);

  return (
    <Tooltip
      title={
        isLocationActive
          ? "Standortanzeige ausschalten"
          : "Standortanzeige einschalten"
      }
      placement="right"
    >
      <ControlButtonStyler
        //ref={tourRefLabels.navigator}
        onClick={() => setIsLocationActive((prev) => !prev)}
        dataTestId="location-control"
      >
        <FontAwesomeIcon
          icon={faLocationArrow}
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
  );
};
