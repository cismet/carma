import {
  BufferAttribute,
  InstancedBufferGeometry,
  ShaderMaterial,
  Vector2,
} from "three";

import {
  SCENE_DARKEN_GLSL,
  applySceneDarkenBlend,
} from "./maplibre-scene-line-materials";
import {
  MAPLIBRE_SCENE_LINE_DEFAULTS,
  MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS,
} from "./maplibre-scene-defaults";

/** Uniforms of one collection's material. */
export type MarkerUniforms = {
  /** Framebuffer size in physical pixels. */
  markerViewport: { value: Vector2 };
  markerPixelRatio: { value: number };
};

export const createMarkerUniforms = (): MarkerUniforms => ({
  markerViewport: { value: new Vector2(1, 1) },
  markerPixelRatio: { value: 1 },
});

/** Per-instance attributes and their item sizes. */
export const MARKER_INSTANCE_ATTRIBUTES = Object.freeze({
  markerCenter: 3,
  markerAcross: 3,
  markerShape: 4,
  markerFill: 4,
  markerOutline: 4,
  markerRing: 4,
  /** Soft ring, occluded look, opacity (`PackedSceneMarkerStyle.look`). */
  markerLook: 3,
});

/** The unit quad every instance expands to its screen box. */
export const createMarkerQuadGeometry = (): InstancedBufferGeometry => {
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(
      new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]),
      3
    )
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.instanceCount = 0;
  return geometry;
};

const VERTEX_SHADER = `
uniform vec2 markerViewport;
uniform float markerPixelRatio;
attribute vec3 markerCenter;
attribute vec3 markerAcross;
attribute vec4 markerShape;
attribute vec4 markerFill;
attribute vec4 markerOutline;
attribute vec4 markerRing;
attribute vec3 markerLook;
varying vec2 vMarkerLocal;
varying vec4 vMarkerShape;
varying vec4 vMarkerFill;
varying vec4 vMarkerOutline;
varying vec4 vMarkerRing;
varying vec3 vMarkerLook;

vec2 toScreenPx( vec4 clip ) {
  return ( clip.xy / clip.w * 0.5 + 0.5 ) * markerViewport;
}

void main() {
  vMarkerShape = markerShape;
  vMarkerFill = markerFill;
  vMarkerOutline = markerOutline;
  vMarkerRing = markerRing;
  vMarkerLook = markerLook;
  vec4 clipCenter = projectionMatrix * ( modelViewMatrix * vec4( markerCenter, 1.0 ) );
  vMarkerLocal = vec2( 0.0 );
  if ( clipCenter.w <= 0.0 ) {
    gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
    return;
  }
  vec2 centerPx = toScreenPx( clipCenter );
  // a bar lies across the screen direction of markerAcross
  vec2 axis = vec2( 1.0, 0.0 );
  if ( dot( markerAcross, markerAcross ) > 0.0 ) {
    vec4 clipAhead = projectionMatrix * ( modelViewMatrix * vec4( markerCenter + markerAcross, 1.0 ) );
    vec2 along = clipAhead.w > 0.0 ? toScreenPx( clipAhead ) - centerPx : vec2( 0.0 );
    if ( dot( along, along ) > 1e-8 ) axis = normalize( vec2( - along.y, along.x ) );
  }
  float radius = markerShape.x;
  float halfBar = markerShape.y;
  // the screen box: the marker, its ring and one pixel to fade the rim over
  float reach = radius + markerShape.w + 1.0;
  #ifdef MARKER_DARKEN_PASS
    reach = radius + ${MAPLIBRE_SCENE_LINE_DEFAULTS.haloWidthPx.toFixed(
      1
    )} + 1.0;
  #endif
  vMarkerLocal = position.xy * vec2( halfBar + reach, reach );
  vec2 offsetPx = ( axis * vMarkerLocal.x + vec2( - axis.y, axis.x ) * vMarkerLocal.y ) * markerPixelRatio;
  vec2 ndc = ( centerPx + offsetPx ) / markerViewport * 2.0 - 1.0;
  // no depth test: any depth inside the clip volume, so near and far planes never cut it
  gl_Position = vec4( ndc, 0.0, 1.0 );
}
`;

/**
 * Coverage from the distance to the bar's core (a point for a disc), faded
 * over one physical pixel: the canvas has no MSAA. The outline paints over
 * the fill like a CSS border and the ring lies outside. The occluded look
 * keeps the outline band (the whole marker without an outline) as dots along
 * the rim, a whole number per quarter so the mirrored pattern closes; the
 * opacity fades the composed marker.
 */
const FRAGMENT_SHADER = `
${SCENE_DARKEN_GLSL}
uniform float markerPixelRatio;
varying vec2 vMarkerLocal;
varying vec4 vMarkerShape;
varying vec4 vMarkerFill;
varying vec4 vMarkerOutline;
varying vec4 vMarkerRing;
varying vec3 vMarkerLook;

void main() {
  float radius = vMarkerShape.x;
  float halfBar = vMarkerShape.y;
  float outlineWidth = vMarkerShape.z;
  float ringWidth = vMarkerShape.w;
  float feather = 0.5 / markerPixelRatio;
  float alongCore = max( abs( vMarkerLocal.x ) - halfBar, 0.0 );
  float distanceToCore = length( vec2( alongCore, vMarkerLocal.y ) );
  #ifdef MARKER_DARKEN_PASS
    if ( vMarkerLook.z <= 0.0 || max( vMarkerFill.a, vMarkerOutline.a ) <= 0.0 ) discard;
    bool outlined = vMarkerOutline.a > 0.0 && outlineWidth > 0.0;
    float bandDistance = outlined && vMarkerFill.a <= 0.0
      ? max( abs( distanceToCore - ( radius - outlineWidth * 0.5 ) ) - outlineWidth * 0.5, 0.0 )
      : max( distanceToCore - radius, 0.0 );
    float fade = clamp( bandDistance / ${MAPLIBRE_SCENE_LINE_DEFAULTS.haloWidthPx.toFixed(
      1
    )}, 0.0, 1.0 );
    if ( fade >= 1.0 ) discard;
    float shade = sceneDarkenShade( ( 1.0 - fade ) * ( 1.0 - fade ) * vMarkerLook.z );
    // Screen grey, like the line halo: no colour-space conversion here.
    gl_FragColor = vec4( vec3( shade ), 1.0 );
  #else
  float inside = 1.0 - smoothstep( radius - feather, radius + feather, distanceToCore );
  bool hasOutline = vMarkerOutline.a > 0.0 && outlineWidth > 0.0;
  float bandWidth = hasOutline ? outlineWidth : radius;
  float band = smoothstep( radius - bandWidth - feather, radius - bandWidth + feather, distanceToCore );
  float outlineAlpha = hasOutline ? vMarkerOutline.a * band : 0.0;
  float fillAlpha = vMarkerFill.a;
  if ( vMarkerLook.y > 0.5 ) {
    float rimRadius = max( radius - 0.5 * bandWidth, 0.0 );
    float perimeter = abs( vMarkerLocal.x ) <= halfBar
      ? abs( vMarkerLocal.x )
      : halfBar + rimRadius * atan( alongCore, abs( vMarkerLocal.y ) );
    float quarter = max( halfBar + rimRadius * 1.5707963, 1e-3 );
    float targetPitch = max( 2.0 * bandWidth, ${MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.markerDotPitchPx.toFixed(
      1
    )} );
    float pitch = quarter / max( 1.0, floor( quarter / targetPitch + 0.5 ) );
    float phase = abs( fract( perimeter / pitch + 0.5 ) - 0.5 );
    float dots = 1.0 - smoothstep( 0.25 - feather / pitch, 0.25 + feather / pitch, phase );
    if ( hasOutline ) outlineAlpha *= dots;
    else fillAlpha *= band * dots;
  }
  float markerAlpha = outlineAlpha + fillAlpha * ( 1.0 - outlineAlpha );
  vec3 marker = vMarkerOutline.rgb * outlineAlpha + vMarkerFill.rgb * fillAlpha * ( 1.0 - outlineAlpha );
  markerAlpha *= inside;
  marker *= inside;
  float ring = 0.0;
  // The common min-blended backdrop replaces the old black alpha shadow.
  bool oldShadow = vMarkerLook.x > 0.5 && dot( vMarkerRing.rgb, vMarkerRing.rgb ) < 1e-8;
  if ( ringWidth > 0.0 && !oldShadow ) {
    float beyond = distanceToCore - radius;
    ring = ( 1.0 - inside ) * ( 1.0 - smoothstep( ringWidth - feather, ringWidth + feather, beyond ) );
    if ( vMarkerLook.x > 0.5 ) {
      float fade = 1.0 - clamp( beyond / ringWidth, 0.0, 1.0 );
      ring *= fade * fade;
    }
  }
  float ringAlpha = vMarkerRing.a * ring * ( 1.0 - markerAlpha );
  float coverage = markerAlpha + ringAlpha;
  float alpha = coverage * vMarkerLook.z;
  if ( alpha <= 0.0 ) discard;
  gl_FragColor = vec4( ( marker + vMarkerRing.rgb * ringAlpha ) / coverage, alpha );
  #include <colorspace_fragment>
  #endif
}
`;

/**
 * The one material of a marker collection: drawn over the scene without depth
 * test or depth write, like the DOM markers it stands in for (the caller's
 * occlusion verdict picks the look), so occlusion probes stay valid.
 */
export const createMarkerMaterial = (
  uniforms: MarkerUniforms,
  darkenPass = false
): ShaderMaterial => {
  const material = new ShaderMaterial({
    defines: darkenPass ? { MARKER_DARKEN_PASS: 1 } : {},
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  if (darkenPass) applySceneDarkenBlend(material);
  return material;
};
