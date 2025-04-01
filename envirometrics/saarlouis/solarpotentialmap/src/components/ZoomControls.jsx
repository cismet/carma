import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import useLeafletZoomControls from "../hooks/useLeafletZoomControls";
import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const ZoomControls = () => {
  const { zoomInLeaflet, zoomOutLeaflet } = useLeafletZoomControls();

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

export default ZoomControls;
