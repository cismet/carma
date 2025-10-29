/**
 * usePortalZoomControls - Routes zoom requests to active engine based on engine records
 *
 * Portal delegates to engine records based on current engine state.
 * Uses zoom methods from engine records for all non-suspended frameworks.
 * Handles FOV zooming for Cesium in oblique mode when available.
 *
 * Engine records provide zoom callbacks:
 * - LeafletEngineRecord: `zoomIn/zoomOut` for Leaflet 2D
 * - CesiumEngineRecord: `zoomIn/zoomOut` for normal 3D, `fovZoomIn/fovZoomOut` for oblique mode
 *
 * @example
 * ```tsx
 * const { handleZoomIn, handleZoomOut } = usePortalZoomControls();
 *
 * <UnifiedZoomControl onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} />
 * ```
 */
export declare const usePortalZoomControls: () => {
  handleZoomIn: () => void;
  handleZoomOut: () => void;
};
