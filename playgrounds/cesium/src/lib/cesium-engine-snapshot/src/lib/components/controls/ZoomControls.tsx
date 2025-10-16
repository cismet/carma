/* eslint-disable jsx-a11y/anchor-is-valid */
import { ReactNode } from "react";
import { useZoomControls } from "../../hooks/useZoomControls";

type ZoomControlsProps = {
  children?: ReactNode;
  role?: string;
  ariaLabel?: string;
  viewer?: any;
};

const ZoomControls = (props: ZoomControlsProps) => {
  const { handleZoomIn, handleZoomOut } = useZoomControls();

  return (
    <div className="leaflet-control-zoom leaflet-bar leaflet-control">
      <a
        className="leaflet-control-zoom-in"
        href="#"
        title="Vergrößern"
        aria-label="Vergrößern"
        onClick={handleZoomIn}
      >
        +
      </a>
      <a
        className="leaflet-control-zoom-out"
        href="#"
        title="Verkleinern"
        aria-label="Verkleinern"
        onClick={handleZoomOut}
      >
        −
      </a>
    </div>
  );
};

export default ZoomControls;
