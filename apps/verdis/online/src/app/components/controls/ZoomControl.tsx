import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
import { useLeafletZoomControls } from "../../../hooks/useLeafletZoomControls";

export const ZoomControl = ({ routedMapRef }) => {
  const { zoomInLeaflet, zoomOutLeaflet } =
    useLeafletZoomControls(routedMapRef);

  return (
    <div className="flex flex-col">
      <ControlButtonStyler
        onClick={zoomInLeaflet}
        className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
        dataTestId="zoom-in-control"
        title="Vergrößern"
      >
        <FontAwesomeIcon icon={faPlus} className="text-base" />
      </ControlButtonStyler>
      <ControlButtonStyler
        onClick={zoomOutLeaflet}
        className="!rounded-t-none !border-t-[1px]"
        dataTestId="zoom-out-control"
        title="Verkleinern"
      >
        <FontAwesomeIcon icon={faMinus} className="text-base" />
      </ControlButtonStyler>
    </div>
  );
};
