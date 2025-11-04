import { type MouseEvent, useState } from "react";
import { Tooltip } from "antd";
import UAParser from "ua-parser-js";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";

type MapFrameworkSwitcherProps = {
  /** Current active framework: 'leaflet' (2D) or 'cesium' (3D) */
  activeFramework: "leaflet" | "cesium";
  /** Whether a transition is currently in progress */
  isTransitioning?: boolean;
  /** Callback when the switch button is clicked */
  onToggle: () => void;
  /** Force button to be enabled even during transitions */
  forceEnabled?: boolean;
  /** Additional CSS class */
  className?: string;
  /** Use native browser tooltip instead of antd Tooltip */
  nativeTooltip?: boolean;
  /** Show warning on mobile devices before enabling 3D mode */
  enableMobileWarning?: boolean;
  /** Custom tooltip text for switching to 3D */
  switchTo3DText?: string;
  /** Custom tooltip text for switching to 2D */
  switchTo2DText?: string;
};

export type { MapFrameworkSwitcherProps };

const parser = new UAParser();
const isMobileUA = parser.getDevice().type === "mobile";
const isTabletUA = parser.getDevice().type === "tablet";
const isMobileOrTablet = isMobileUA || isTabletUA;

const LOCALE_DE_WARNING_ENABLE_CESIUM_MODE = `Achtung ⚠️\n\nDie 3D-Darstellung stellt hohe Anforderungen an die Speicherausstattung Ihres Endgerätes. Bei leistungsschwächeren Geräten funktioniert der 3D-Modus eventuell nicht stabil.`;

const LOCALE_DE_SWITCH_TO_3D_MODE = `Zur 3D-Ansicht wechseln`;
const LOCALE_DE_SWITCH_TO_2D_MODE = `Zur 2D-Ansicht wechseln`;

export const MapFrameworkSwitcher = ({
  activeFramework,
  isTransitioning = false,
  onToggle,
  forceEnabled,
  className,
  nativeTooltip = false,
  enableMobileWarning = false,
  switchTo3DText = LOCALE_DE_SWITCH_TO_3D_MODE,
  switchTo2DText = LOCALE_DE_SWITCH_TO_2D_MODE,
}: MapFrameworkSwitcherProps) => {
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const isMode2d = activeFramework === "leaflet";

  const handleSwitchMapMode = async (e: MouseEvent) => {
    e.preventDefault();

    if (isMode2d && !hasConfirmed && enableMobileWarning && isMobileOrTablet) {
      const confirmed = window.confirm(LOCALE_DE_WARNING_ENABLE_CESIUM_MODE);
      if (confirmed) setHasConfirmed(true);
      else return;
    }

    onToggle();
  };

  const switchInfoText = isMode2d ? switchTo3DText : switchTo2DText;

  return nativeTooltip ? (
    <ControlButtonStyler
      className={("font-semibold " + (className || "")).trim()}
      onClick={handleSwitchMapMode}
      disabled={isTransitioning && !forceEnabled}
      title={switchInfoText}
      dataTestId={isMode2d ? "3d-control" : "2d-control"}
    >
      {isMode2d ? "3D" : "2D"}
    </ControlButtonStyler>
  ) : (
    <Tooltip title={switchInfoText} placement="right">
      <ControlButtonStyler
        className={("font-semibold " + (className || "")).trim()}
        onClick={handleSwitchMapMode}
        disabled={isTransitioning && !forceEnabled}
        dataTestId={isMode2d ? "3d-control" : "2d-control"}
      >
        {isMode2d ? "3D" : "2D"}
      </ControlButtonStyler>
    </Tooltip>
  );
};
