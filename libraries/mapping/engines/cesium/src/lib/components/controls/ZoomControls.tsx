/* eslint-disable jsx-a11y/anchor-is-valid */
import { ReactNode } from "react";
import { Viewer } from "cesium";

import { useZoomControls } from "../../hooks/useZoomControls";
import { ViewerAnimationMap } from "../../utils/viewerAnimationMap";

type ZoomControlsProps = {
  children?: ReactNode;
  role?: string;
  ariaLabel?: string;
  viewerRef: React.RefObject<Viewer | null>;
  viewerAnimationMapRef: React.RefObject<ViewerAnimationMap | null>;
};

const ZoomControls = (props: ZoomControlsProps) => {
  const { handleZoomIn, handleZoomOut } = useZoomControls(
    props.viewerRef,
    props.viewerAnimationMapRef
  );

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
