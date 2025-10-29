import { ReactNode } from "react";
/**
 * CesiumMapComponentWrapper - Portal-level wrapper for Cesium 3D scene
 *
 * ## RESPONSIBILITIES:
 *
 * ### 1. Container Management
 * - Provide container element for Cesium scene
 * - Handle proper positioning and styling
 *
 * ### 2. Style Synchronization
 * - Bridge portal MapStyleKey to Cesium scene styles
 * - Provide setStyle method for Cesium engine records
 * - Handle style changes during 2D↔3D transitions
 *
 * ### 3. Engine Record Management
 * - Create/update Cesium engine record with proper setStyle method
 * - Register engine with PortalContext's enginesRef
 * - Handle engine readiness state changes
 *
 * ### 4. Context Bridging
 * - Connect portal callbacks to Cesium context
 * - Coordinate activation/suspension between systems
 *
 * ### 5. Hash Updates (for URL synchronization)
 * - Update URL hash when camera position changes
 * - Listen for navigation events and update Cesium camera
 *
 * ## STATE MANAGEMENT:
 * - Scene handles its own activation/suspension via CesiumContext
 * - PortalContext manages all state (currentMapStyle, camera, etc.)
 * - Wrapper bridges callbacks and provides engine integration
 * - Camera initialization handled by CesiumContext from portal config
 *
 * ## STYLE SYNC FLOW:
 * 1. PortalStateContext calls setMapStyle(styleId) for all engines
 * 2. Cesium engine's setStyle() calls useCesiumStyleSync().setStyle()
 * 3. useCesiumStyleSync handles ALL style logic:
 *    - Updates portal mapStyleRef
 *    - Detects changes via useEffect
 *    - Maps portal styles to Cesium styles
 *    - Applies to Cesium context via sceneStyleApplierRef
 *
 * ## CLEAN SEPARATION:
 * - useCesiumStyleSync: ALL style logic (syncing + setStyle method)
 * - CesiumMapComponentWrapper: Just uses setStyle, no style logic
 * - PortalStateContext: Coordinates across engines
 *
 * ## ADDITIONAL RESPONSIBILITIES TO IMPLEMENT:
 *
 * ### Hash/URL Synchronization:
 
 * ### Error Handling:
 * reinit cesium on cesium crash
 *
 * ### Memory Management:
 */
export declare const CesiumMapComponentWrapper: ({
  children,
}: {
  children?: ReactNode;
}) => import("react/jsx-runtime").JSX.Element;
export default CesiumMapComponentWrapper;
