import { useCallback, useMemo } from "react";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";
import { useLeafletZoomControls } from "@carma/mapping/engines/leaflet";
import { useZoomControls } from "@carma/mapping/engines/cesium/core";
import { useCarmaTopicMapContext } from "@carma/mapping/engines/carma-cismap";

interface UnifiedZoomControlProps {
  tourRef?: React.Ref<HTMLDivElement>;
  className?: string;
  showTooltips?: boolean;
  fovMode?: boolean;
  zoomInTooltip?: string;
  zoomOutTooltip?: string;
  tooltipPlacement?: "top" | "right" | "bottom" | "left";
  onZoomIn?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onZoomOut?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  libreMapRef?: React.RefObject<{ zoomIn: () => void; zoomOut: () => void }>;
  isMode2d?: boolean;
  showLibreMap?: boolean;
}

/**
 * UnifiedZoomControl - Unified zoom control for all map engines
 *
 * Automatically handles zoom for:
 * - Leaflet (2D maps)
 * - LibreMap (vector 2D maps)
 * - Cesium (3D maps with FOV zoom support)
 *
 * Consumers can pass handlers that decide what to do based on:
 * - Active map engine (from usePortal().currentEngine)
 * - Cesium suspension state (from useCesiumContext().isSuspendedRef)
 * - LibreMap availability (from useSelector(getLibreMapRef))
 *
 * Example usage in geoportal:
 * ```tsx
 * const { currentEngine } = usePortal();
 * const { isSuspendedRef } = useCesiumContext();
 * const libreMapRef = useSelector(getLibreMapRef);
 * const { zoomInLeaflet, zoomOutLeaflet } = useLeafletZoomControls(leafletMapRef);
 * const { handleZoomIn: handleZoomInCesium, handleZoomOut: handleZoomOutCesium } = useZoomControls();
 *
 * <UnifiedZoomControl
 *   tourRef={tourRefLabels.zoom}
 *   onZoomIn={(event) => {
 *     if (currentEngine === "leaflet2d") {
 *       if (libreMapRef.current) {
 *         libreMapRef.current.zoomIn();
 *       } else {
 *         zoomInLeaflet();
 *       }
 *     } else {
 *       handleZoomInCesium(event);
 *     }
 *   }}
 *   onZoomOut={(event) => {
 *     if (currentEngine === "leaflet2d") {
 *       if (libreMapRef.current) {
 *         libreMapRef.current.zoomOut();
 *       } else {
 *         zoomOutLeaflet();
 *       }
 *     } else {
 *       handleZoomOutCesium(event);
 *     }
 *   }}
 * />
 * ```
 */
export const UnifiedZoomControl = ({
  tourRef,
  className = "",
  showTooltips = true,
  fovMode = false,
  zoomInTooltip,
  zoomOutTooltip,
  tooltipPlacement = "right",
  onZoomIn,
  onZoomOut,
  libreMapRef,
  isMode2d = true,
  showLibreMap = false,
}: UnifiedZoomControlProps) => {
  const {
    handleZoomIn: handleZoomInCesium,
    handleZoomOut: handleZoomOutCesium,
  } = useZoomControls({
    fovMode: false, // TODO: Hook up to oblique mode state when needed
  });
  const { leafletMapRef } = useCarmaTopicMapContext();

  const { zoomInLeaflet, zoomOutLeaflet } =
    useLeafletZoomControls(leafletMapRef);

  // Determine default tooltips based on fovMode
  const defaultZoomInTooltip = fovMode
    ? "Zoom in (FOV)"
    : "Maßstab vergrößern (Zoom in)";
  const defaultZoomOutTooltip = fovMode
    ? "Zoom out (FOV)"
    : "Maßstab verkleinern (Zoom out)";
  const finalZoomInTooltip = zoomInTooltip ?? defaultZoomInTooltip;
  const finalZoomOutTooltip = zoomOutTooltip ?? defaultZoomOutTooltip;

  // Built-in handler that uses all the map engine props
  const builtInHandleZoomIn = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (isMode2d) {
        if (showLibreMap) {
          if (libreMapRef?.current) {
            libreMapRef.current.zoomIn();
          }
        } else {
          zoomInLeaflet?.();
        }
      } else {
        handleZoomInCesium?.(event);
      }
    },
    [isMode2d, showLibreMap, libreMapRef, zoomInLeaflet, handleZoomInCesium]
  );

  const builtInHandleZoomOut = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (isMode2d) {
        if (showLibreMap) {
          if (libreMapRef?.current) {
            libreMapRef.current.zoomOut();
          }
        } else {
          zoomOutLeaflet?.();
        }
      } else {
        handleZoomOutCesium?.(event);
      }
    },
    [isMode2d, showLibreMap, libreMapRef, zoomOutLeaflet, handleZoomOutCesium]
  );

  // Use custom handlers if provided, otherwise use built-in
  const finalHandleZoomIn = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (onZoomIn) {
        onZoomIn(event);
      } else {
        builtInHandleZoomIn(event);
      }
    },
    [onZoomIn, builtInHandleZoomIn]
  );

  const finalHandleZoomOut = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (onZoomOut) {
        onZoomOut(event);
      } else {
        builtInHandleZoomOut(event);
      }
    },
    [onZoomOut, builtInHandleZoomOut]
  );

  const zoomInButton = useMemo(
    () => (
      <ControlButtonStyler
        onClick={finalHandleZoomIn}
        className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
        dataTestId="zoom-in-control"
        title="Vergrößern"
      >
        <FontAwesomeIcon icon={faPlus} className="text-base" />
      </ControlButtonStyler>
    ),
    [finalHandleZoomIn]
  );

  const zoomOutButton = useMemo(
    () => (
      <ControlButtonStyler
        onClick={finalHandleZoomOut}
        className="!rounded-t-none !border-t-[1px]"
        dataTestId="zoom-out-control"
        title="Verkleinern"
      >
        <FontAwesomeIcon icon={faMinus} className="text-base" />
      </ControlButtonStyler>
    ),
    [finalHandleZoomOut]
  );

  return (
    <div
      ref={tourRef}
      data-test-id="unified-zoom-control"
      className={`flex flex-col ${className}`}
    >
      {showTooltips ? (
        <>
          <Tooltip title={finalZoomInTooltip} placement={tooltipPlacement}>
            {zoomInButton}
          </Tooltip>
          <Tooltip title={finalZoomOutTooltip} placement={tooltipPlacement}>
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
