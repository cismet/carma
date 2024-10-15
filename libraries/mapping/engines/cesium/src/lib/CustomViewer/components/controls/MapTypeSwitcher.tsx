import { MouseEvent, ReactNode } from "react";

import {
  useViewerIsMode2d,
  useViewerIsTransitioning,

} from "../../../CesiumContextProvider/slices/cesium";

import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";

import { useMapTransition } from "../../hooks/useMapTransition";

type Props = {
  duration?: number;
  onComplete?: (isTo2D: boolean) => void;
  forceEnabled?: boolean;
  children?: ReactNode;
};

export const MapTypeSwitcher = ({ onComplete, forceEnabled, duration }: Props) => {

  const isMode2d = useViewerIsMode2d();
  const isTransitioning = useViewerIsTransitioning();
  const { transitionToMode2d, transitionToMode3d } = useMapTransition({ onComplete, duration });

  const handleSwitchMapMode = async (e: MouseEvent) => {
    e.preventDefault();
    console.info(
      "CLICKHANDLER: [CESIUM|LEAFLET|2D3D] clicked handleSwitchMapMode zoom",
      isMode2d,
    );
    if (isMode2d) {
      transitionToMode3d();
    } else {
      transitionToMode2d();
    }
  };



  return (
    <ControlButtonStyler
      title={isMode2d ? "zur 3D Ansicht wechseln" : "zur 2D Ansicht wechseln"}
      className="font-semibold"
      onClick={handleSwitchMapMode}
      disabled={isTransitioning && !forceEnabled}
    >
      {isMode2d ? "3D" : "2D"}
    </ControlButtonStyler>
  );
};

export default MapTypeSwitcher;
