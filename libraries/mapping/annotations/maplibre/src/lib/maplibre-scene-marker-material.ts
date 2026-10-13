import {
  BufferAttribute,
  GreaterDepth,
  InstancedBufferGeometry,
  ShaderMaterial,
  Vector2,
} from "three";

import { MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS } from "./maplibre-scene-defaults";

export const MARKER_PASS = {
  /** Depth-tested: fill, outline and ring. */
  VISIBLE: "visible",
  /** Depth-fail: only the outline, dotted. */
  OCCLUDED: "occluded",
} as const;

export type MarkerPass = (typeof MARKER_PASS)[keyof typeof MARKER_PASS];

/** Uniforms both passes of one collection share. */
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
  markerRingSoft: 1,
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
attribute float markerRingSoft;
varying vec2 vMarkerLocal;
varying vec4 vMarkerShape;
varying vec4 vMarkerFill;
varying vec4 vMarkerOutline;
varying vec4 vMarkerRing;
varying float vMarkerRingSoft;

vec2 toScreenPx( vec4 clip ) {
  return ( clip.xy / clip.w * 0.5 + 0.5 ) * markerViewport;
}

void main() {
  vMarkerShape = markerShape;
  vMarkerFill = markerFill;
  vMarkerOutline = markerOutline;
  vMarkerRing = markerRing;
  vMarkerRingSoft = markerRingSoft;
  vec4 viewCenter = modelViewMatrix * vec4( markerCenter, 1.0 );
  vec4 clipCenter = projectionMatrix * viewCenter;
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
  vMarkerLocal = position.xy * vec2( halfBar + reach, reach );
  vec2 offsetPx = ( axis * vMarkerLocal.x + vec2( - axis.y, axis.x ) * vMarkerLocal.y ) * markerPixelRatio;
  vec2 ndc = ( centerPx + offsetPx ) / markerViewport * 2.0 - 1.0;
  // Depth: the centre pulled toward the eye by a few marker radii in world
  // units at the node (screen pixels per view unit from a short probe).
  float eyeDistance = max( length( viewCenter.xyz ), 1e-6 );
  float probe = 1e-3 * eyeDistance;
  vec4 clipSide = projectionMatrix * ( viewCenter + vec4( probe, 0.0, 0.0, 0.0 ) );
  float cssPxPerViewUnit = clipSide.w > 0.0
    ? length( toScreenPx( clipSide ) - centerPx ) / ( probe * markerPixelRatio )
    : 0.0;
  float lift = cssPxPerViewUnit > 0.0
    ? min( ${MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.markerDepthLiftRadii.toFixed(
      1
    )} * ( radius + halfBar ) / cssPxPerViewUnit, 0.5 * eyeDistance )
    : 0.0;
  vec4 clipLifted = projectionMatrix * vec4( viewCenter.xyz * ( 1.0 - lift / eyeDistance ), 1.0 );
  gl_Position = vec4( ndc, clipLifted.z / clipLifted.w, 1.0 );
}
`;

/**
 * Coverage from the distance to the bar's core (a point for a disc), faded
 * over one physical pixel: the canvas has no MSAA. The visible pass paints
 * the outline over the fill like a CSS border and the ring outside; the
 * occluded pass keeps the outline band (the whole marker without an
 * outline) as dots along the rim, a whole number per quarter so the
 * mirrored pattern closes.
 */
const FRAGMENT_SHADER = `
uniform float markerPixelRatio;
varying vec2 vMarkerLocal;
varying vec4 vMarkerShape;
varying vec4 vMarkerFill;
varying vec4 vMarkerOutline;
varying vec4 vMarkerRing;
varying float vMarkerRingSoft;

void main() {
  float radius = vMarkerShape.x;
  float halfBar = vMarkerShape.y;
  float outlineWidth = vMarkerShape.z;
  float ringWidth = vMarkerShape.w;
  float feather = 0.5 / markerPixelRatio;
  float alongCore = max( abs( vMarkerLocal.x ) - halfBar, 0.0 );
  float distanceToCore = length( vec2( alongCore, vMarkerLocal.y ) );
  float inside = 1.0 - smoothstep( radius - feather, radius + feather, distanceToCore );
  bool hasOutline = vMarkerOutline.a > 0.0 && outlineWidth > 0.0;
  float bandWidth = hasOutline ? outlineWidth : radius;
  float band = smoothstep( radius - bandWidth - feather, radius - bandWidth + feather, distanceToCore );
  #ifdef MARKER_OCCLUDED
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
    vec4 rim = hasOutline ? vMarkerOutline : vMarkerFill;
    float alpha = rim.a * inside * band * dots * ${MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.markerOccludedOpacity.toFixed(
      3
    )};
    if ( alpha <= 0.0 ) discard;
    gl_FragColor = vec4( rim.rgb, alpha );
  #else
    float outlineAlpha = hasOutline ? vMarkerOutline.a * band : 0.0;
    float markerAlpha = outlineAlpha + vMarkerFill.a * ( 1.0 - outlineAlpha );
    vec3 marker = vMarkerOutline.rgb * outlineAlpha + vMarkerFill.rgb * vMarkerFill.a * ( 1.0 - outlineAlpha );
    markerAlpha *= inside;
    marker *= inside;
    float ring = 0.0;
    if ( ringWidth > 0.0 ) {
      float beyond = distanceToCore - radius;
      ring = ( 1.0 - inside ) * ( 1.0 - smoothstep( ringWidth - feather, ringWidth + feather, beyond ) );
      if ( vMarkerRingSoft > 0.5 ) {
        float fade = 1.0 - clamp( beyond / ringWidth, 0.0, 1.0 );
        ring *= fade * fade;
      }
    }
    float ringAlpha = vMarkerRing.a * ring * ( 1.0 - markerAlpha );
    float alpha = markerAlpha + ringAlpha;
    if ( alpha <= 0.0 ) discard;
    gl_FragColor = vec4( ( marker + vMarkerRing.rgb * ringAlpha ) / alpha, alpha );
  #endif
  #include <colorspace_fragment>
}
`;

/** One pass of a marker collection; never writes depth, so occlusion probes stay valid. */
export const createMarkerMaterial = (
  uniforms: MarkerUniforms,
  pass: MarkerPass
): ShaderMaterial => {
  const occluded = pass === MARKER_PASS.OCCLUDED;
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    defines: occluded ? { MARKER_OCCLUDED: "" } : {},
  });
  if (occluded) material.depthFunc = GreaterDepth;
  return material;
};
