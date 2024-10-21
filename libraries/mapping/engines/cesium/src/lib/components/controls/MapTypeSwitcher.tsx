import { type MouseEvent, type ReactNode, forwardRef } from "react";
import { useSelector } from "react-redux";

import type { Map as LeafletMap } from "leaflet";

import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";

import { useMapTransition } from "../../hooks/useMapTransition";
import {
  selectViewerIsMode2d,
  selectViewerIsTransitioning,
} from "../../slices/cesium";

type Props = {
  leafletElement: LeafletMap | null,
  duration?: number;
  onComplete?: (isTo2D: boolean) => void;
  forceEnabled?: boolean;
  children?: ReactNode;
};

type Ref = HTMLButtonElement;

export const MapTypeSwitcher = forwardRef<Ref, Props>(
  ({leafletElement, onComplete, forceEnabled, duration }, ref) => {
    const isMode2d = useSelector(selectViewerIsMode2d);
    const isTransitioning = useSelector(selectViewerIsTransitioning);
    const { transitionToMode2d, transitionToMode3d } = useMapTransition(leafletElement, {
      onComplete,
      duration,
    });

    const handleSwitchMapMode = async (e: MouseEvent) => {
      e.preventDefault();
      console.info(
        "CLICKHANDLER: [CESIUM|LEAFLET|2D3D] clicked handleSwitchMapMode zoom",
        isMode2d,
      );
      if (isMode2d) {
        await transitionToMode3d();
      } else {
        transitionToMode2d();
      }
    };

    return (
      <ControlButtonStyler
        ref={ref}
        title={isMode2d ? "zur 3D Ansicht wechseln" : "zur 2D Ansicht wechseln"}
        className="font-semibold"
        disabled={leafletElement == null || isTransitioning && !forceEnabled}
        onClick={handleSwitchMapMode}
      >
        {isMode2d ? "3D" : "2D"}
      </ControlButtonStyler>
    );
  },
);

export default MapTypeSwitcher;
