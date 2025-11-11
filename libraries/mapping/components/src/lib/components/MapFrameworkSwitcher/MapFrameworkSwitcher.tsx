import { type CSSProperties, type MouseEvent, useState } from "react";
import { Tooltip } from "antd";
import UAParser from "ua-parser-js";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { useMapFrameworkSwitcherContext } from "./MapFrameworkSwitcherContext";

type MapFrameworkSwitcherProps = {
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
  /** Optional style object for positioning */
  style?: CSSProperties;
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
  forceEnabled,
  className,
  nativeTooltip = false,
  enableMobileWarning = false,
  switchTo3DText = LOCALE_DE_SWITCH_TO_3D_MODE,
  switchTo2DText = LOCALE_DE_SWITCH_TO_2D_MODE,
  style,
}: MapFrameworkSwitcherProps) => {
  const { isTransitioning, toggle, isReady, isLeaflet } =
    useMapFrameworkSwitcherContext();
  const [hasConfirmed, setHasConfirmed] = useState(false);

  const handleSwitchMapMode = async (e: MouseEvent) => {
    e.preventDefault();

    if (isLeaflet && !hasConfirmed && enableMobileWarning && isMobileOrTablet) {
      const confirmed = window.confirm(LOCALE_DE_WARNING_ENABLE_CESIUM_MODE);
      if (confirmed) setHasConfirmed(true);
      else return;
    }

    await toggle();
  };

  const switchInfoText = isLeaflet ? switchTo3DText : switchTo2DText;

  // Disable button if not ready or transitioning (unless forceEnabled)
  const isDisabled = (!isReady || isTransitioning) && !forceEnabled;

  const button = (
    <ControlButtonStyler
      className={("font-semibold " + (className || "")).trim()}
      onClick={handleSwitchMapMode}
      disabled={isDisabled}
      title={nativeTooltip ? switchInfoText : undefined}
      dataTestId={isLeaflet ? "3d-control" : "2d-control"}
    >
      {isLeaflet ? "3D" : "2D"}
    </ControlButtonStyler>
  );

  const content = nativeTooltip ? (
    button
  ) : (
    <Tooltip title={switchInfoText} placement="right">
      {button}
    </Tooltip>
  );

  return style ? <div style={style}>{content}</div> : content;
};
