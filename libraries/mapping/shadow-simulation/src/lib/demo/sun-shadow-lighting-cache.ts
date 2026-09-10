import {
  FloatType,
  NearestFilter,
  WebGLRenderTarget,
  type Camera,
  type DirectionalLight,
  type Scene,
  type WebGLRenderer,
} from "three";

/**
 * Experimental opaque-scene factorization: cache unshadowed and indirect RGB
 * at the central sun direction. Per-direction BRDF variation is intentionally
 * omitted and must be measured against full RGB sun integration, not assumed.
 */
export const createSunShadowLightingCache = (
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  light: DirectionalLight
) => {
  const targetOptions = {
    type: FloatType,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
  };
  const unshadowed = new WebGLRenderTarget(1, 1, targetOptions);
  const indirect = new WebGLRenderTarget(1, 1, targetOptions);
  return {
    lighting: {
      unshadowed: unshadowed.texture,
      indirect: indirect.texture,
    },
    render(width: number, height: number) {
      unshadowed.setSize(width, height);
      indirect.setSize(width, height);
      const previousTarget = renderer.getRenderTarget();
      const previousMaterial = scene.overrideMaterial;
      const previousIntensity = light.intensity;
      const previousCastShadow = light.castShadow;
      const previousNeedsUpdate = light.shadow.needsUpdate;
      try {
        scene.overrideMaterial = null;
        light.castShadow = false;
        renderer.setRenderTarget(unshadowed);
        renderer.clear(true, true, false);
        renderer.render(scene, camera);
        light.intensity = 0;
        renderer.setRenderTarget(indirect);
        renderer.clear(true, true, false);
        renderer.render(scene, camera);
      } finally {
        light.intensity = previousIntensity;
        light.castShadow = previousCastShadow;
        light.shadow.needsUpdate = previousNeedsUpdate;
        scene.overrideMaterial = previousMaterial;
        renderer.setRenderTarget(previousTarget);
      }
    },
    dispose() {
      unshadowed.dispose();
      indirect.dispose();
    },
  };
};
