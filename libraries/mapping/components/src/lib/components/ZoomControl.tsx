import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";
import {
  useLeafletZoomControls,
  useLibreZoomControls,
} from "@carma-mapping/utils";

interface ZoomControlProps {
  mapEngine?: "leaflet" | "maplibre" | "cesium";
  libreMap?: maplibregl.Map | null;
}

export const ZoomControl = ({
  mapEngine = "leaflet",
  libreMap,
}: ZoomControlProps) => {
  const { zoomInLeaflet, zoomOutLeaflet } = useLeafletZoomControls();
  const { zoomInLibre, zoomOutLibre } = useLibreZoomControls({ map: libreMap });

  return (
    <div data-test-id="zoom-control" className="flex flex-col">
      <Tooltip title="Maßstab vergrößern (Zoom in)" placement="right">
        <ControlButtonStyler
          onClick={mapEngine === "leaflet" ? zoomInLeaflet : zoomInLibre}
          className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
          dataTestId="zoom-in-control"
          title="Vergrößern"
        >
          <FontAwesomeIcon icon={faPlus} className="text-base" />
        </ControlButtonStyler>
      </Tooltip>
      <Tooltip title="Maßstab verkleinern (Zoom out)" placement="right">
        <ControlButtonStyler
          onClick={mapEngine === "leaflet" ? zoomOutLeaflet : zoomOutLibre}
          className="!rounded-t-none !border-t-[1px]"
          dataTestId="zoom-out-control"
          title="Verkleinern"
        >
          <FontAwesomeIcon icon={faMinus} className="text-base" />
        </ControlButtonStyler>
      </Tooltip>
    </div>
  );
};
