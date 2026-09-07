import { ShaderLib, ShaderMaterial, UniformsUtils } from "three";

/**
 * Direct-sun visibility only, using Three's actual shadow-mask shader chunks.
 * This scalar is NOT final radiance: sky light, colour and the BRDF must be
 * evaluated separately. No inverse-luminance estimate or thresholded RGB image.
 */
export const createShadowVisibilityMaterial = () => {
  const source = ShaderLib.shadow;
  return new ShaderMaterial({
    uniforms: UniformsUtils.clone(source.uniforms),
    vertexShader: source.vertexShader,
    fragmentShader: source.fragmentShader
      .replace(
        "gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );",
        "gl_FragColor = vec4(vec3(getShadowMask()), 1.0);"
      )
      .replace("#include <tonemapping_fragment>", ""),
    lights: true,
    fog: false,
    toneMapped: false,
  });
};
