import { forwardRef, type MouseEventHandler } from "react";
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
  /** replaces the engine's default zoom in, for hosts with their own logic */
  onZoomIn?: MouseEventHandler<HTMLButtonElement>;
  /** replaces the engine's default zoom out, for hosts with their own logic */
  onZoomOut?: MouseEventHandler<HTMLButtonElement>;
}

export const ZoomControl = forwardRef<HTMLDivElement, ZoomControlProps>(
  ({ mapEngine = "leaflet", libreMap, onZoomIn, onZoomOut }, ref) => {
    const { zoomInLeaflet, zoomOutLeaflet } = useLeafletZoomControls();
    const { zoomInLibre, zoomOutLibre } = useLibreZoomControls({
      map: libreMap,
    });

    return (
      <div ref={ref} data-test-id="zoom-control" className="flex flex-col">
        <Tooltip title="Maßstab vergrößern (Zoom in)" placement="right">
          <ControlButtonStyler
            onClick={
              onZoomIn ?? (mapEngine === "leaflet" ? zoomInLeaflet : zoomInLibre)
            }
            className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
            dataTestId="zoom-in-control"
            aria-label="Vergrößern"
          >
            <FontAwesomeIcon icon={faPlus} className="text-base" />
          </ControlButtonStyler>
        </Tooltip>
        <Tooltip title="Maßstab verkleinern (Zoom out)" placement="right">
          <ControlButtonStyler
            onClick={
              onZoomOut ??
              (mapEngine === "leaflet" ? zoomOutLeaflet : zoomOutLibre)
            }
            className="!rounded-t-none !border-t-[1px]"
            dataTestId="zoom-out-control"
            aria-label="Verkleinern"
          >
            <FontAwesomeIcon icon={faMinus} className="text-base" />
          </ControlButtonStyler>
        </Tooltip>
      </div>
    );
  }
);
