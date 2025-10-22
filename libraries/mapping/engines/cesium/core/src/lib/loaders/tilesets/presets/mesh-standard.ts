import type { Cesium3DTileset, ShadowMode } from "@carma/cesium";

// Avoid static import
const DISABLED: ShadowMode.DISABLED = 0;

/**
 * Performance defaults for 3D mesh tilesets (photogrammetry, terrain meshes)
 *
 * Performance optimizations:
 * - backFaceCulling: true (Cesium default) - cull back faces for better performance
 * - enableCollision: false - NO tileset collision (use terrain collision instead!)
 * - enablePick: false - no CPU picking in WebGL 1 (saves memory)
 * - shadows: DISABLED - no shadow calculations
 *
 * COLLISION STRATEGY:
 * - Tilesets: enableCollision = false (expensive, rough collision)
 * - Terrain: Use terrain collision instead (faster, smoother, more accurate)
 * - For 2020+ styles with tilesets, enable terrain collision for camera
 *
 * NOTE: heightReference and classificationType are NOT set here because:
 * - They should NOT vary per style (global scene-level settings)
 * - Default values (NONE/undefined) are least taxing for performance
 * - heightReference: NONE = no terrain clamping (fastest)
 * - classificationType: undefined = no classification (fastest)
 */
export const MESH_PERFORMANCE_PRESET: Cesium3DTileset.ConstructorOptions = {
  preloadWhenHidden: false,
  shadows: DISABLED,

  // Performance: Disable expensive operations
  enableCollision: false, // Use terrain collision instead (faster + smoother)
  enablePick: false, // No CPU picking (WebGL 1)
  backFaceCulling: true, // Cull back faces (Cesium default)

  maximumScreenSpaceError: 6, // target 100% quality
  // TODO expose this via UI: 2 is like 3x the data of 6
  // HQ: 4 or higher
  // LQ: 16 or worse

  // dynamicScreenSpaceError: true, // only needed for low angle views

  // Foveated rendering optimizations
  foveatedScreenSpaceError: true,
  foveatedConeSize: 0.25,
  foveatedMinimumScreenSpaceErrorRelaxation: 32,

  // Skip Level of Detail optimizations
  skipLevelOfDetail: true,
  skipScreenSpaceErrorFactor: 128,
  baseScreenSpaceError: 4096, // minimum quality to load before skipping
  // loadSiblings: true, // with SkipLevelOfDetail not useful for initial load speed
  // immediatelyLoadDesiredLevelOfDetail: true,
};
