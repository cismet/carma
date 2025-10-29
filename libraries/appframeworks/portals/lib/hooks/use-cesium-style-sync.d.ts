/**
 * Hook to sync Cesium scene style ID with portal context
 *
 * Maps portal MapStyleKey to Cesium style IDs using portalConfig.mapStyleMappings.cesium
 * and sets the current style in the Cesium context. This is important for maintaining
 * consistent styling between 2D and 3D views during transitions.
 *
 * ## RESPONSIBILITIES:
 * - Monitors portal mapStyleRef changes
 * - Maps portal styles to Cesium scene styles
 * - Applies styles to Cesium context when active
 * - Handles suspension/activation state changes
 *
 * ## SEPARATION OF CONCERNS:
 * - This hook: Handles ALL Cesium style logic (syncing + setStyle method)
 * - CesiumMapComponentWrapper: Uses setStyle for engine records, no style logic
 * - PortalStateContext: Coordinates setMapStyle calls across all engines
 *
 * Should be used in:
 * - CesiumSceneComponent on initialization (auto-sync only)
 * - CesiumMapComponentWrapper (get setStyle for engine records + auto-sync)
 *
 * @example
 * ```tsx
 * // Get setStyle method for engine records + auto-syncing
 * const { setStyle } = useCesiumStyleSync();
 *
 * // Use setStyle in Cesium engine record
 * const cesiumEngine = {
 *   engine: "cesium3d",
 *   setStyle,
 *   // ... other properties
 * };
 * ```
 */
export declare const useCesiumStyleSync: () => {
  setStyle: (styleId: string) => void;
};
