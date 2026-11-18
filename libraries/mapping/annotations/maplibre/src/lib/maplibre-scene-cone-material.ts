import { Color, FrontSide, GreaterDepth, MeshBasicMaterial } from "three";

import { parseCssColor } from "./maplibre-css-color";
import { MAPLIBRE_SCENE_LINE_DEFAULTS } from "./maplibre-scene-defaults";

export const CONE_PASS = {
  /** Depth-tested: shaded fill with a solid outline. */
  VISIBLE: "visible",
  /** Depth-fail: only the outline, dotted like an occluded line. */
  OCCLUDED: "occluded",
} as const;

export type ConePass = (typeof CONE_PASS)[keyof typeof CONE_PASS];

/** Uniforms both passes of one cone share; widths and dashes in physical pixels. */
export type ConeOutlineUniforms = {
  coneOutlineColor: { value: Color };
  coneOutlineOpacity: { value: number };
  coneOutlineWidthPx: { value: number };
  coneDashPx: { value: number };
  coneGapPx: { value: number };
};

export const createConeOutlineUniforms = (
  outlineColor: string
): ConeOutlineUniforms => {
  const { color, opacity } = parseCssColor(outlineColor);
  return {
    coneOutlineColor: { value: color },
    coneOutlineOpacity: { value: opacity },
    coneOutlineWidthPx: { value: 1 },
    coneDashPx: { value: MAPLIBRE_SCENE_LINE_DEFAULTS.occludedDashPx },
    coneGapPx: { value: MAPLIBRE_SCENE_LINE_DEFAULTS.occludedGapPx },
  };
};

/** Follows the canvas pixel ratio: the outline keeps its CSS width, the dots their CSS pitch. */
export const setConeOutlinePixelRatio = (
  uniforms: ConeOutlineUniforms,
  outlineWidthCssPx: number,
  pixelRatio: number
) => {
  uniforms.coneOutlineWidthPx.value = outlineWidthCssPx * pixelRatio;
  uniforms.coneDashPx.value =
    MAPLIBRE_SCENE_LINE_DEFAULTS.occludedDashPx * pixelRatio;
  uniforms.coneGapPx.value =
    MAPLIBRE_SCENE_LINE_DEFAULTS.occludedGapPx * pixelRatio;
};

const VERTEX_PARS = `varying vec3 vConeNormal;
varying vec3 vConeView;
varying vec2 vConeLocal;
varying float vConeHeight;
varying float vConeCap;
void main() {`;

// The unit cone: base in the xy plane at z = 0, apex at z = 1, cap normal -z.
const VERTEX_MAIN = `#include <project_vertex>
  vConeView = - mvPosition.xyz;
  vConeNormal = normalMatrix * normal;
  vConeLocal = position.xy;
  vConeHeight = position.z;
  vConeCap = step( 0.999, - normal.z );`;

const FRAGMENT_PARS = `uniform vec3 coneOutlineColor;
uniform float coneOutlineOpacity;
uniform float coneOutlineWidthPx;
uniform float coneDashPx;
uniform float coneGapPx;
varying vec3 vConeNormal;
varying vec3 vConeView;
varying vec2 vConeLocal;
varying float vConeHeight;
varying float vConeCap;
void main() {`;

/**
 * Pixel distance to the outline from screen derivatives, so it keeps its
 * width at any size: the lateral silhouette (the surface turns edge-on), the
 * base edge (on the cap, or where the lateral surface ends) and the tip. The
 * last pixel fades out: the canvas has no MSAA.
 */
const FRAGMENT_OUTLINE = `{
    float facing = abs( dot( normalize( vConeNormal ), normalize( vConeView ) ) );
    float radial = length( vConeLocal );
    vec2 facingGradient = vec2( dFdx( facing ), dFdy( facing ) );
    vec2 heightGradient = vec2( dFdx( vConeHeight ), dFdy( vConeHeight ) );
    vec2 radialGradient = vec2( dFdx( radial ), dFdy( radial ) );
    float silhouettePx = facing / max( length( facingGradient ), 1e-6 );
    float basePx = vConeHeight / max( length( heightGradient ), 1e-6 );
    float tipPx = ( 1.0 - vConeHeight ) / max( length( heightGradient ), 1e-6 );
    float rimPx = ( 1.0 - radial ) / max( length( radialGradient ), 1e-6 );
    float lateralPx = min( min( silhouettePx, basePx ), tipPx );
    float edgePx = vConeCap > 0.5 ? rimPx : lateralPx;
    float outline = 1.0 - smoothstep( coneOutlineWidthPx - 0.5, coneOutlineWidthPx + 0.5, edgePx );
    #ifdef CONE_OCCLUDED
      // Dots along the screen axis the edge runs closest to (it runs across
      // its gradient), at the pitch of the occluded line pass.
      vec2 edgeGradient = vConeCap > 0.5
        ? radialGradient
        : ( silhouettePx < basePx ? facingGradient : heightGradient );
      float along = abs( edgeGradient.y ) >= abs( edgeGradient.x ) ? gl_FragCoord.x : gl_FragCoord.y;
      float dash = step( mod( along, coneDashPx + coneGapPx ), coneDashPx );
      outgoingLight = coneOutlineColor;
      diffuseColor.a = coneOutlineOpacity * ${MAPLIBRE_SCENE_LINE_DEFAULTS.occludedOpacity.toFixed(
        3
      )} * outline * dash;
    #else
      outgoingLight = mix( outgoingLight * ( 0.7 + 0.3 * facing ), coneOutlineColor, outline * coneOutlineOpacity );
    #endif
  }
  #include <opaque_fragment>`;

/** One pass of a cone: front faces only, so the convex body never blends with itself. */
export const createConeMaterial = (
  fillColor: string,
  fillOpacity: number,
  uniforms: ConeOutlineUniforms,
  pass: ConePass
): MeshBasicMaterial => {
  const { color, opacity } = parseCssColor(fillColor);
  const occluded = pass === CONE_PASS.OCCLUDED;
  const material = new MeshBasicMaterial({
    color,
    opacity: opacity * fillOpacity,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: FrontSide,
  });
  if (occluded) {
    material.depthFunc = GreaterDepth;
    material.defines = { CONE_OCCLUDED: "" };
  }
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", VERTEX_PARS)
      .replace("#include <project_vertex>", VERTEX_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", FRAGMENT_PARS)
      .replace("#include <opaque_fragment>", FRAGMENT_OUTLINE);
  };
  return material;
};
