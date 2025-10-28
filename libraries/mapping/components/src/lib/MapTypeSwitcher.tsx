import {
  type MouseEvent,
  type ReactNode,
  forwardRef,
  useRef,
  useCallback,
} from "react";
import { Tooltip } from "antd";

import UAParser from "ua-parser-js";

import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { useMapModeToggle } from "@carma-mapping/map-transition-2d-3d";
import {
  usePortalMapEngine,
  ManagedEngineKeys,
} from "@carma-appframeworks/portals";

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
    // Use ref to avoid re-renders on confirmation state change
    const hasConfirmedRef = useRef(false);

    // Get current engine from PortalContext - this is the source of truth
    const { current: currentEngine, set: setCurrentEngine } =
      usePortalMapEngine();

    // Derive mode from portal's current engine (any non-cesium engine = 2D)
    const isMode2d = currentEngine !== ManagedEngineKeys.CESIUM_3D;

    // Use the mode toggle hook from transition library (for transition logic only)
    const { isTransitioning, toggleMode } = useMapModeToggle({
      currentEngine, // Pass portal's current engine to hook
      duration,
      onComplete,
      onCancel,
      onEngineChange: (engine) => {
        // Sync to PortalContext/URL on transition complete
        setCurrentEngine(
          engine === "cesium3d"
            ? ManagedEngineKeys.CESIUM_3D
            : ManagedEngineKeys.LEAFLET_2D
        );
      },
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
          !hasConfirmedRef.current &&
          enableMobileWarning &&
          isMobileOrTablet
        ) {
          const confirmed = window.confirm(
            LOCALE_DE_WARNING_ENABLE_CESIUM_MODE
          );
          if (confirmed) {
            hasConfirmedRef.current = true;
          } else {
            return;
          }
        }

        // Core transition logic delegated to hook
        try {
          await toggleMode();
        } catch (error) {
          console.error("[MapTypeSwitcher] Transition failed:", error);
        }
      },
      [isMode2d, enableMobileWarning, toggleMode]
    );

    console.debug("[MapTypeSwitcher] Render", {
      currentEngine,
      isMode2d,
      isTransitioning,
    });

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
