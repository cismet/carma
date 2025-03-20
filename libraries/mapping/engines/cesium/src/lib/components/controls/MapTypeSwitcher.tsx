import { type MouseEvent, type ReactNode, forwardRef } from "react";
import { useSelector } from "react-redux";

import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";

import { useMapTransition } from "../../hooks/useMapTransition";
import {
  selectViewerIsMode2d,
  selectViewerIsTransitioning,
} from "../../slices/cesium";
import { Tooltip } from "antd";

type Props = {
  duration?: number;
  onComplete?: (isTo2D: boolean) => void;
  forceEnabled?: boolean;
  children?: ReactNode;
  className?: string;
  nativeTooltip?: boolean;
};

type Ref = HTMLButtonElement;

export const MapTypeSwitcher = forwardRef<Ref, Props>(
  (
    { onComplete, forceEnabled, duration, className, nativeTooltip = false },
    ref
  ) => {
    const isMode2d = useSelector(selectViewerIsMode2d);
    const isTransitioning = useSelector(selectViewerIsTransitioning);
    const { transitionToMode2d, transitionToMode3d } = useMapTransition({
      onComplete,
      duration,
    });

    const handleSwitchMapMode = async (e: MouseEvent) => {
      e.preventDefault();
      console.debug(
        "CLICKHANDLER: [CESIUM|LEAFLET|2D3D] clicked handleSwitchMapMode zoom",
        isMode2d
      );
      if (isMode2d) {
        await transitionToMode3d();
      } else {
        transitionToMode2d();
      }
    };
    const cbs = (
      <ControlButtonStyler
        className={"font-semibold " + className}
        onClick={handleSwitchMapMode}
        disabled={isTransitioning && !forceEnabled}
        ref={ref}
        title={
          nativeTooltip
            ? isMode2d
              ? "Zur 3D-Ansicht wechseln"
              : "Zur 2D-Ansicht wechseln"
            : undefined
        }
        dataTestId={isMode2d ? "3d-control" : "2d-control"}
      >
        {isMode2d ? "3D" : "2D"}
      </ControlButtonStyler>
    );
    return nativeTooltip ? (
      cbs
    ) : (
      <Tooltip
        title={isMode2d ? "Zur 3D-Ansicht wechseln" : "Zur 2D-Ansicht wechseln"}
        placement="right"
      >
        {cbs}
      </Tooltip>
    );
  }
);

export default MapTypeSwitcher;
