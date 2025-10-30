import { type ReactNode } from "react";
import { Tooltip } from "antd";
import {
  usePortalContext,
  ManagedEngineKeys,
} from "@carma-appframeworks/portals";
import {
  type AvailableEngine,
  isFeatureDisabled,
} from "../../utils/mapEngineAvailability";

interface EngineAwareButtonProps {
  /** Tooltip text */
  tooltip: string | ReactNode;
  /** List of engines this button is available on */
  availableOn: AvailableEngine[];
  /** Click handler */
  onClick: () => void;
  /** Test ID for testing */
  testId?: string;
  /** Button content (icon, image, text, etc.) */
  children: ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** CSS class to apply when disabled */
  disabledClassName?: string;
  /** Override disabled state (for additional conditions) */
  additionalDisabled?: boolean;
}

/**
 * Button wrapper that automatically handles engine availability
 *
 * @example
 * ```tsx
 * <EngineAwareButton
 *   tooltip="Karteninhalte hinzufügen"
 *   availableOn={EngineAvailability.LEAFLET_2D}
 *   onClick={() => dispatch(setShowResourceModal(true))}
 *   testId="kartenebenen-hinzufügen-btn"
 *   className="h-[24.5px] min-w-fit"
 * >
 *   <img src={baseUrl + "icons/add-layers.png"} alt="Kartenebenen hinzufügen" />
 * </EngineAwareButton>
 * ```
 */
export const EngineAwareButton = ({
  tooltip,
  availableOn,
  onClick,
  testId,
  children,
  className = "",
  disabledClassName = "opacity-20",
  additionalDisabled = false,
}: EngineAwareButtonProps) => {
  const { getIsCesiumActive } = usePortalContext();
  const currentEngine = getIsCesiumActive()
    ? ManagedEngineKeys.CESIUM_3D
    : ManagedEngineKeys.LEAFLET_2D;
  const isDisabled =
    isFeatureDisabled(currentEngine, availableOn) || additionalDisabled;

  return (
    <Tooltip title={tooltip}>
      <button
        disabled={isDisabled}
        onClick={onClick}
        className={`${className} ${isDisabled ? disabledClassName : ""}`}
        data-test-id={testId}
      >
        {children}
      </button>
    </Tooltip>
  );
};
