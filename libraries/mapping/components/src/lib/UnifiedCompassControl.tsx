import { useMemo } from "react";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { Tooltip } from "antd";
import {
  CesiumPitchingCompass,
  LibrePitchingCompass,
} from "@carma-mapping/ui/pitching-compass";

interface UnifiedCompassControlProps {
  /** Optional ref for tour integration */
  tourRef?: React.Ref<HTMLButtonElement>;
  /** Optional custom className */
  className?: string;
  /** Enable tooltips (default: true) */
  showTooltips?: boolean;
  /** Tooltip text (default: "mit gedrückter Maustaste drehen und kippen") */
  tooltipText?: string;
  /** Tooltip placement (default: "right") */
  tooltipPlacement?: "top" | "right" | "bottom" | "left";
  /** Is 2D mode active (default: true) */
  isMode2d?: boolean;
  /** Is LibreMap enabled (default: false) */
  showLibreMap?: boolean;
  /** LibreMap ref for compass */
  libreMapRef?: React.RefObject<any> | null;
  /** Disable compass (default: false) */
  disabled?: boolean;
}

/**
 * UnifiedCompassControl - Unified compass/orientation control for all map engines
 *
 * Automatically handles compass for:
 * - LibreMap (vector 2D maps with LibrePitchingCompass)
 * - Cesium (3D maps with CesiumPitchingCompass)
 *
 * Example usage in geoportal:
 * ```tsx
 * <UnifiedCompassControl
 *   tourRef={tourRefLabels.alignNorth}
 *   isMode2d={isMode2d}
 *   showLibreMap={showLibreMap}
 *   libreMapRef={libreMapRef}
 *   disabled={isMode2d && !showLibreMap}
 * />
 * ```
 */
export const UnifiedCompassControl = ({
  tourRef,
  className = "",
  showTooltips = true,
  tooltipText = "mit gedrückter Maustaste drehen und kippen",
  tooltipPlacement = "right",
  isMode2d = true,
  showLibreMap = false,
  libreMapRef,
  disabled = false,
}: UnifiedCompassControlProps) => {
  const compassComponent = useMemo(() => {
    if (showLibreMap && libreMapRef) {
      return <LibrePitchingCompass mapRef={libreMapRef} />;
    }
    return <CesiumPitchingCompass />;
  }, [showLibreMap, libreMapRef]);

  const button = useMemo(
    () => (
      <ControlButtonStyler
        useDisabledStyle={false}
        className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
        ref={tourRef}
        dataTestId="compass-control"
        disabled={disabled}
      >
        {compassComponent}
      </ControlButtonStyler>
    ),
    [tourRef, disabled, compassComponent]
  );

  if (showTooltips) {
    return (
      <Tooltip title={tooltipText} placement={tooltipPlacement}>
        {button}
      </Tooltip>
    );
  }

  return button;
};
