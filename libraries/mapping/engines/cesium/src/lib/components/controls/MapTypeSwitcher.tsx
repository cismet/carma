import { type MouseEvent, type ReactNode, forwardRef, useState } from "react";
import { useSelector } from "react-redux";
import UAParser from "ua-parser-js";

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
  enableMobileWarning?: boolean;
};

const parser = new UAParser();
const isMobileUA = parser.getDevice().type === "mobile";
const isTabletUA = parser.getDevice().type === "tablet";
const isMobileOrTablet = isMobileUA || isTabletUA;

const WARNING_ENABLE_CESIUM_MODE = `Achtung ⚠️

Die 3D-Darstellung stellt hohe Anforderungen an die Speicherausstattung Ihres Endgerätes. Bei leistungsschwächeren Geräten funktioniert der 3D-Modus eventuell nicht stabil.`;

type Ref = HTMLButtonElement;

export const MapTypeSwitcher = forwardRef<Ref, Props>(
  (
    {
      onComplete,
      forceEnabled,
      duration,
      className,
      nativeTooltip = false,
      enableMobileWarning = false,
    },
    ref
  ) => {
    const [hasConfirmed, setHasConfirmed] = useState(false);
    const isMode2d = useSelector(selectViewerIsMode2d);
    const isTransitioning = useSelector(selectViewerIsTransitioning);
    const { transitionToMode2d, transitionToMode3d } = useMapTransition({
      onComplete,
      duration,
    });

    const handleSwitchMapMode = async (e: MouseEvent) => {
      e.preventDefault();

      if (
        // show warning only from 2d mode and not already confirmed
        isMode2d &&
        !hasConfirmed &&
        enableMobileWarning &&
        isMobileOrTablet
      ) {
        const confirmed = window.confirm(WARNING_ENABLE_CESIUM_MODE);
        if (confirmed) {
          setHasConfirmed(true);
        } else {
          return;
        }
      }

      console.debug(
        "CLICKHANDLER: [CESIUM|LEAFLET|2D3D] clicked handleSwitchMapMode zoom",
        isMode2d
      );
      if (isMode2d) {
        await transitionToMode3d();
      } else {
        await transitionToMode2d();
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

MapTypeSwitcher.defaultProps = {
  nativeTooltip: false,
  enableMobileWarning: false,
};

export default MapTypeSwitcher;
