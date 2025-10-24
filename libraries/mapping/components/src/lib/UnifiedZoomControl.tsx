import { useMemo } from "react";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";

interface UnifiedZoomControlProps {
  tourRef?: React.Ref<HTMLDivElement>;
  className?: string;
  showTooltips?: boolean;
  tooltipPlacement?: "top" | "right" | "bottom" | "left";
  zoomInTooltip?: string;
  zoomOutTooltip?: string;
  onZoomIn: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onZoomOut: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/**
 * UnifiedZoomControl - Pure UI component for zoom buttons
 *
 * Just renders two buttons. All logic (which engine, what to do) is handled
 * by the parent via onZoomIn/onZoomOut callbacks.
 *
 * Example usage:
 * ```tsx
 * const { handleZoomIn, handleZoomOut } = usePortalZoomControls();
 * <UnifiedZoomControl
 *   tourRef={tourRefLabels.zoom}
 *   onZoomIn={handleZoomIn}
 *   onZoomOut={handleZoomOut}
 * />
 * ```
 */
export const UnifiedZoomControl = ({
  tourRef,
  className = "",
  showTooltips = true,
  tooltipPlacement = "right",
  zoomInTooltip = "Maßstab vergrößern (Zoom in)",
  zoomOutTooltip = "Maßstab verkleinern (Zoom out)",
  onZoomIn,
  onZoomOut,
}: UnifiedZoomControlProps) => {
  const zoomInButton = useMemo(
    () => (
      <ControlButtonStyler
        onClick={onZoomIn}
        className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
        dataTestId="zoom-in-control"
        title="Vergrößern"
      >
        <FontAwesomeIcon icon={faPlus} className="text-base" />
      </ControlButtonStyler>
    ),
    [onZoomIn]
  );

  const zoomOutButton = useMemo(
    () => (
      <ControlButtonStyler
        onClick={onZoomOut}
        className="!rounded-t-none !border-t-[1px]"
        dataTestId="zoom-out-control"
        title="Verkleinern"
      >
        <FontAwesomeIcon icon={faMinus} className="text-base" />
      </ControlButtonStyler>
    ),
    [onZoomOut]
  );

  return (
    <div
      ref={tourRef}
      data-test-id="unified-zoom-control"
      className={`flex flex-col ${className}`}
    >
      {showTooltips ? (
        <>
          <Tooltip title={zoomInTooltip} placement={tooltipPlacement}>
            {zoomInButton}
          </Tooltip>
          <Tooltip title={zoomOutTooltip} placement={tooltipPlacement}>
            {zoomOutButton}
          </Tooltip>
        </>
      ) : (
        <>
          {zoomInButton}
          {zoomOutButton}
        </>
      )}
    </div>
  );
};
