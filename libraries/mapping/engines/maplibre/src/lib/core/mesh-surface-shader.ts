/**
 * Albedo only, after texture/vertex colors and before Three's physical lighting.
 * The mixed color receives the real surface-normal-dependent diffuse response
 * (max(N dot L, 0)), sky irradiance and occlusion through MeshStandardMaterial.
 * Do not multiply by another N dot L here: that would square the cosine and
 * double-darken grazing faces. Do not mix into outgoingLight: that paints over
 * shadows. Applying the mix after vertex colors also removes baked vertex tint
 * at 100% color, instead of modulating the selected albedo a second time.
 *
 * The optional Cesium 2024 transfer is tone/color correction, not de-lighting.
 * Recovering true albedo from baked photography needs capture illumination and
 * visibility; dividing by today's N dot L would amplify noise and invent data.
 */
export const MESH_SURFACE_ALBEDO_GLSL = `
if (uShadowTextureColorCorrection) {
  diffuseColor.rgb = pow(
    clamp((diffuseColor.rgb - uShadowTextureBlackPoint) /
      (uShadowTextureWhitePoint - uShadowTextureBlackPoint), 0.0, 1.0),
    uShadowTextureGamma
  );
}
float shadowTextureLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
diffuseColor.rgb = mix(vec3(shadowTextureLuma), diffuseColor.rgb, uShadowTextureSaturation);
diffuseColor.rgb = mix(diffuseColor.rgb, uShadowUniformColor, uShadowUniformColorMix);
`;
