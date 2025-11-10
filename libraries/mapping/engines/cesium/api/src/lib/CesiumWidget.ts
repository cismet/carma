/**
 * CesiumWidget with helper utilities
 */

import { CesiumTerrainProvider, CesiumWidget } from "cesium";

export { CesiumWidget };

/**
 * Minimal widget constructor options with no default assets loaded.
 *
 * Overrides Cesium defaults to create a lightweight widget:
 * - scene3DOnly: true (default: false) - Forces 3D-only mode
 * - baseLayer: false (default: true) - No default imagery
 * - globe: false (default: true) - No globe rendering
 * - skyAtmosphere: false (default: true) - No atmosphere rendering
 * - requestRenderMode: true (default: false) - Render only on request for performance
 * - useBrowserRecommendedResolution: false (default: true) - Use device pixels for crisp rendering
 *   NOTE: When false, Cesium's drawingBuffer is in device pixels, but viewer.resolutionScale reports 1.0.
 *   For transitions: Pass window.devicePixelRatio as resolutionScale because Leaflet uses CSS pixels.
 *   frustum.getPixelDimensions() needs resolutionScale to convert device pixels → CSS pixels.
 * - contextOptions.webgl.alpha: true (default: false) - Transparent background support
 * - contextOptions.webgl.antialias: true (default: true) - Smooth edges
 *
 * Not set (uses Cesium defaults):
 * // skyBox: undefined (default: new SkyBox with stars) - Keep stars for visual context
 * // clock: new Clock()
 * // shouldAnimate: false
 * // ellipsoid: Ellipsoid.WGS84
 * // terrainProvider: new EllipsoidTerrainProvider()
 * // sceneMode: SceneMode.SCENE3D
 * // orderIndependentTranslucency: true
 * // useDefaultRenderLoop: true
 * // targetFrameRate: undefined
 * // showRenderLoopErrors: true
 * // automaticallyTrackDataSourceClocks: true
 * // msaaSamples: 4
 * // maximumRenderTimeChange: 0.0
 */
const MINIMAL_WIDGET_OPTIONS = {
  scene3DOnly: true,
  baseLayer: false,
  requestRenderMode: true,
  useBrowserRecommendedResolution: false,
  // we handle attribution externally in the apps, and use no default Ion Assets
  creditContainer: document.createElement("div"),
  contextOptions: {
    webgl: {
      alpha: true,
      antialias: true,
    },
  },
};

// todo consider setting up initial style on load or always start clean due to tilesets being extra?
// like wrapping setup of providers into this minimal widget?
// so tileset terrain and baselayer get constructed here just before widget creation from urls
/*
type ConvenienceOptions = {
    baseLayer?: {url?: string; options: ImageryProvider.ConstructorOptions };
    terrain?: {url: string; options: CesiumTerrainProvider.ConstructorOptions };
    tileset?: {url: string; options: Cesium3DTileset.ConstructorOptions };
    cameraRectangle?: Rectangle | BBox; 
}
    see also regular
    CesiumWidget ConstructorOptions terrain and baseLayer
**/

/**
 * Creates a new CesiumWidget with minimal defaults (no terrain, no imagery, no globe)
 * but allows custom options to override any defaults.
 *
 * @param container - The DOM element to contain the widget
 * @param options - Optional overrides for the default minimal options
 * @returns A new CesiumWidget instance
 *
 */
export const createMinimalCesiumWidget = (
  container: HTMLElement | string,
  options?: Record<string, unknown>
  // extraOptions?: ConvenienceOptions
): CesiumWidget => {
  const contextOptions = options?.["contextOptions"] as
    | Record<string, unknown>
    | undefined;
  const webglOptions = contextOptions?.["webgl"] as
    | Record<string, unknown>
    | undefined;

  const mergedOptions = {
    ...MINIMAL_WIDGET_OPTIONS,
    ...options,
    // Deep merge contextOptions if provided
    contextOptions: {
      ...MINIMAL_WIDGET_OPTIONS.contextOptions,
      ...(contextOptions || {}),
      webgl: {
        ...MINIMAL_WIDGET_OPTIONS.contextOptions.webgl,
        ...(webglOptions || {}),
      },
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new CesiumWidget(container, mergedOptions as any);
};
