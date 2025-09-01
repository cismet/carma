import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
import { useLeafletZoomControls } from "@carma-mapping/utils";

export const ZoomControl = () => {
  const { zoomInLeaflet, zoomOutLeaflet } = useLeafletZoomControls();

  return (
    <div data-test-id="zoom-control" className="flex flex-col">
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
