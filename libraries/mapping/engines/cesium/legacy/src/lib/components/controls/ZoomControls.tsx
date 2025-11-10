/* eslint-disable jsx-a11y/anchor-is-valid */
import { ReactNode } from "react";
import { useZoomControls } from "../../hooks/useZoomControls";
import { useCesiumContext } from "../../hooks/useCesiumContext";

type ZoomControlsProps = {
  children?: ReactNode;
  role?: string;
  ariaLabel?: string;
};

const ZoomControls = (props: ZoomControlsProps) => {
  const ctx = useCesiumContext();
  const { handleZoomIn, handleZoomOut } = useZoomControls(ctx);

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
