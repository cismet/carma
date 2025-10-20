import { Cesium3DTileset, ShadowMode } from "@carma/cesium";

/**
 * Performance defaults for LOD2 building tilesets
 *
 * Performance optimizations (same as MESH):
 * - backFaceCulling: true (Cesium default) - cull back faces
 * - enableCollision: false - NO tileset collision (use terrain instead)
 * - enablePick: false - no CPU picking (saves memory)
 *
 * COLLISION: Always use terrain collision, not tileset collision
 *
 * NOTE: heightReference and classificationType defaults are used (NONE/undefined)
 * for best performance. These should NOT be style-specific settings.
 */
export const LOD2_PERFORMANCE_PRESET: Cesium3DTileset.ConstructorOptions = {
  maximumScreenSpaceError: 4,
  dynamicScreenSpaceError: false,
  foveatedScreenSpaceError: true,
  preloadWhenHidden: false, // only set this to true sometime after initial load

  // Performance: Disable expensive operations
  enableCollision: false, // Use terrain collision instead
  enablePick: false,
  backFaceCulling: true,
  shadows: ShadowMode.DISABLED,
};
