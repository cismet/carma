import { type MouseEvent, type ReactNode, forwardRef, useState } from "react";
import { useSelector } from "react-redux";
import { Tooltip } from "antd";

import UAParser from "ua-parser-js";

import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";

import { useMapTransition } from "../../hooks/useMapTransition";
import {
  selectViewerIsMode2d,
  selectViewerIsTransitioning,
} from "../../slices/cesium";

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

const LOCALE_DE_WARNING_ENABLE_CESIUM_MODE = `Achtung ⚠️

Die 3D-Darstellung stellt hohe Anforderungen an die Speicherausstattung Ihres Endgerätes. Bei leistungsschwächeren Geräten funktioniert der 3D-Modus eventuell nicht stabil.`;

const LOCALE_DE_SWITCH_TO_3D_MODE = `Zur 3D-Ansicht wechseln`;
const LOCALE_DE_SWITCH_TO_2D_MODE = `Zur 2D-Ansicht wechseln`;

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
        const confirmed = window.confirm(LOCALE_DE_WARNING_ENABLE_CESIUM_MODE);
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

    const switchInfoText = isMode2d
      ? LOCALE_DE_SWITCH_TO_3D_MODE
      : LOCALE_DE_SWITCH_TO_2D_MODE;

    const cbs = (
      <ControlButtonStyler
        className={"font-semibold " + className}
        onClick={handleSwitchMapMode}
        disabled={isTransitioning && !forceEnabled}
        ref={ref}
        title={nativeTooltip ? switchInfoText : undefined}
        dataTestId={isMode2d ? "3d-control" : "2d-control"}
      >
        {isMode2d ? "3D" : "2D"}
      </ControlButtonStyler>
    );
    return nativeTooltip ? (
      cbs
    ) : (
      <Tooltip title={switchInfoText} placement="right">
        {cbs}
      </Tooltip>
    );
  }
);

export default MapTypeSwitcher;
