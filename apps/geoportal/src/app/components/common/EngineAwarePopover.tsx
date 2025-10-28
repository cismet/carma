import type { IconProp } from "@fortawesome/fontawesome-svg-core";
import type { ReactNode } from "react";
import {
  usePortalContext,
  ManagedEngineKeys,
} from "@carma-appframeworks/portals";
import {
  type AvailableEngine,
  isFeatureDisabled,
} from "../../utils/mapEngineAvailability";
import CustomPopover from "../nav-items/CustomPopover";

interface EngineAwarePopoverProps {
  /** Tooltip text */
  tooltip?: string;
  /** Popover content */
  content: ReactNode;
  /** FontAwesome icon */
  icon: IconProp;
  /** Test ID for testing */
  testId?: string;
  /** List of engines this popover is available on */
  availableOn: AvailableEngine[];
  /** Additional CSS classes */
  className?: string;
  /** Shift-click handler */
  shiftClickHandler?: () => void;
  /** Override disabled state (for additional conditions) */
  additionalDisabled?: boolean;
}

/**
 * Popover wrapper that automatically handles engine availability
 *
 * @example
 * ```tsx
 * <EngineAwarePopover
 *   content={<Save layers={activeLayers} />}
 *   icon={faFileExport}
 *   testId="speichern-btn"
 *   tooltip="Karte speichern"
 *   availableOn={EngineAvailability.LEAFLET_2D}
 * />
 * ```
 */
export const EngineAwarePopover = ({
  tooltip,
  content,
  icon,
  testId,
  availableOn,
  className,
  shiftClickHandler,
  additionalDisabled = false,
}: EngineAwarePopoverProps) => {
  const { isCesiumActive } = usePortalContext();
  const currentEngine = isCesiumActive()
    ? ManagedEngineKeys.CESIUM_3D
    : ManagedEngineKeys.LEAFLET_2D;
  const isDisabled =
    isFeatureDisabled(currentEngine, availableOn) || additionalDisabled;

  return (
    <CustomPopover
      tooltip={tooltip}
      content={content}
      icon={icon}
      testId={testId}
      disabled={isDisabled}
      className={className}
      shiftClickHandler={shiftClickHandler}
    />
  );
};
