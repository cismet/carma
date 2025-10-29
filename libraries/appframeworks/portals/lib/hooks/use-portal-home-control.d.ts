/**
 * usePortalHomeControl - Routes home requests to active engine based on engine records
 *
 * Portal delegates to engine records based on current engine state.
 * Uses the flyHome methods from the engine records for all non-suspended frameworks.
 *
 * Engine records provide flyHome callbacks:
 * - LeafletEngineRecord: `flyHome` for Leaflet 2D
 * - CesiumEngineRecord: `flyHome` for Cesium 3D
 *
 * @example
 * ```tsx
 * const { handleHome } = usePortalHomeControl();
 * <button onClick={handleHome}>Home</button>
 * ```
 */
export declare const usePortalHomeControl: () => {
  handleHome: () => void;
};
