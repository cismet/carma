import {
  type MouseEvent,
  type ReactNode,
  forwardRef,
  useState,
  useCallback,
} from "react";
import { Tooltip } from "antd";

import UAParser from "ua-parser-js";

import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { useMapModeToggle } from "@carma-mapping/map-transition-2d-3d";

type Props = {
  duration?: number;
  onComplete?: (isTo2D: boolean) => void;
  onCancel?: (isTo2D: boolean) => void;
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
      onCancel,
      duration,
      className,
      nativeTooltip = false,
      enableMobileWarning = false,
    },
    ref
  ) => {
    const [hasConfirmed, setHasConfirmed] = useState(false);

    // Use the mode toggle hook from transition library
    const { isMode2d, isTransitioning, toggleMode } = useMapModeToggle({
      duration,
      onComplete,
      onCancel,
    });

    const switchInfoText = isMode2d
      ? LOCALE_DE_SWITCH_TO_3D_MODE
      : LOCALE_DE_SWITCH_TO_2D_MODE;

    const handleSwitchMapMode = useCallback(
      async (e: MouseEvent) => {
        e.preventDefault();

        // Mobile/tablet warning (UI concern - stays in component)
        if (
          isMode2d &&
          !hasConfirmed &&
          enableMobileWarning &&
          isMobileOrTablet
        ) {
          const confirmed = window.confirm(
            LOCALE_DE_WARNING_ENABLE_CESIUM_MODE
          );
          if (confirmed) {
            setHasConfirmed(true);
          } else {
            return;
          }
        }

        // Core transition logic now in hook
        try {
          await toggleMode();
        } catch (error) {
          console.error("[MapTypeSwitcher] Transition failed:", error);
        }
      },
      [isMode2d, hasConfirmed, enableMobileWarning, toggleMode]
    );

    console.debug(
      "RENDER: [CESIUM|LEAFLET|2D3D] MapTypeSwitcher",
      isMode2d,
      isTransitioning
    );

    const cbs = (
      <ControlButtonStyler
        className={"font-semibold " + className}
        onClick={handleSwitchMapMode}
        disabled={isTransitioning}
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
