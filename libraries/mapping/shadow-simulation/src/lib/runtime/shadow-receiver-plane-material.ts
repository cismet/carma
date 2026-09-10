import * as THREE from "three";

/** Mesh-only receiver correction; NEVER enable for the raster heightfield.
 * Decision MESH-CONTACT-BIAS-20260908 in three/TILED_SHADOW_PAGES.md: combined
 * with real mesh normals, this removes planar acne without metre-scale offsets.
 * The non-planar heightfield oracle still fails (output/tiled-shadow-acne-20260907).
 * Receiver-plane PCF: compare each texel with the depth of the SAME receiver
 * plane at that texel centre, rather than biasing the whole surface away.
 * See David Tuft, "Plane-Based Depth Bias for PCF", Game Developer May 2010:
 * https://media.gdcvault.com/GD_Mag_Archives/GDM_May_2010.pdf (pp.35-38).
 * Radius remains one bilinear footprint; softness still comes from the sun disc.
 */
const RECEIVER_PLANE_PCF = /* glsl */ `
float carmaReceiverPlaneTap(sampler2DShadow map, vec2 uv, vec3 receiver, vec2 gradient) {
  // Clamp the reference plane AND the depth fetch to the same texel centre.
  // CLAMP_TO_EDGE alone only clamps the fetch, creating false self-shadows for
  // sloped receivers whose bilinear footprint crosses the texture boundary.
  vec2 halfTexel = vec2(0.5) / vec2(textureSize(map, 0));
  uv = clamp(uv, halfTexel, vec2(1.0) - halfTexel);
  return texture(map, vec3(uv, receiver.z + dot(gradient, uv - receiver.xy)));
}
float getShadow(sampler2DShadow map, vec2 size, float intensity, float bias, float radius, vec4 coord) {
  if (!carmaReceiverPlaneShadow) return carmaOriginalGetShadow(map, size, intensity, bias, radius, coord);
  vec3 receiver = coord.xyz / coord.w;
  vec3 dx = dFdx(receiver);
  vec3 dy = dFdy(receiver);
  float determinant = dx.x * dy.y - dx.y * dy.x;
  float scale = max(length(dx.xy) * length(dy.xy), 1e-20);
  vec2 gradient = abs(determinant) > scale * 1e-5
    ? vec2(dy.y * dx.z - dx.y * dy.z, dx.x * dy.z - dy.x * dx.z) / determinant
    : vec2(0.0);
  receiver.z += bias;
  if (any(lessThan(receiver.xy, vec2(0.0))) || any(greaterThan(receiver.xy, vec2(1.0))) || receiver.z > 1.0) return 1.0;
  vec2 pixel = receiver.xy * size - 0.5;
  vec2 fraction = fract(pixel);
  vec2 uv = (floor(pixel) + 0.5) / size;
  vec2 stepUV = 1.0 / size;
  float a = carmaReceiverPlaneTap(map, uv, receiver, gradient);
  float b = carmaReceiverPlaneTap(map, uv + vec2(stepUV.x, 0.0), receiver, gradient);
  float c = carmaReceiverPlaneTap(map, uv + vec2(0.0, stepUV.y), receiver, gradient);
  float d = carmaReceiverPlaneTap(map, uv + stepUV, receiver, gradient);
  return mix(1.0, mix(mix(a, b, fraction.x), mix(c, d, fraction.x), fraction.y), intensity);
}
`;

const PCF_SIGNATURE = "float getShadow( sampler2DShadow shadowMap,";
const PCF_END = "#elif defined( SHADOWMAP_TYPE_VSM )";

/** Public ShaderChunk/onBeforeCompile extension, checked against the installed
 * Three signature. Disabled materials retain stock PCF via a uniform branch.
 */
export const receiverPlaneShadowChunk = () => {
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  if (!chunk.includes(PCF_SIGNATURE) || !chunk.includes(PCF_END)) {
    throw new Error(
      "Three PCF shader changed; validate receiver-plane shadow integration"
    );
  }
  return `uniform bool carmaReceiverPlaneShadow;\n${chunk
    .replace(
      PCF_SIGNATURE,
      "float carmaOriginalGetShadow( sampler2DShadow shadowMap,"
    )
    .replace(PCF_END, `${RECEIVER_PLANE_PCF}\n${PCF_END}`)}`;
};

const materials = new WeakMap<THREE.Material, { value: boolean }>();
export const configureReceiverPlaneShadow = (
  material: THREE.Material,
  receiverPlane?: boolean
) => {
  const existing = materials.get(material);
  if (existing) {
    if (receiverPlane !== undefined && existing.value !== receiverPlane) {
      existing.value = receiverPlane;
      material.needsUpdate = true;
    }
    return existing;
  }
  const enabled = { value: receiverPlane ?? false };
  const previousCompile = material.onBeforeCompile;
  // Capture before replacing onBeforeCompile: Three's default key uses it.
  const previousKey = material.customProgramCacheKey();
  const chunk = receiverPlaneShadowChunk();
  material.onBeforeCompile = function (shader, renderer) {
    previousCompile.call(this, shader, renderer);
    shader.uniforms.carmaReceiverPlaneShadow = enabled;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <shadowmap_pars_fragment>",
      chunk
    );
  };
  material.customProgramCacheKey = () =>
    `${previousKey}|carma-receiver-plane-pcf-v3|${enabled.value ? "mesh" : "stock"}`;
  material.needsUpdate = true;
  materials.set(material, enabled);
  return enabled;
};
