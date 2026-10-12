import { CustomBlending, GreaterDepth, MinEquation } from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { AnnotationSceneLineStyle } from "@carma-mapping/annotations/core";

import { parseCssColor } from "./css-color";
import { MAPLIBRE_SCENE_LINE_DEFAULTS } from "./maplibre-scene-line-defaults";

export const LINE_PASS = {
  /** Depth-tested, continuous. */
  VISIBLE: "visible",
  /** Depth-fail, dashed in CSS pixels, faint, on top. */
  OCCLUDED: "occluded",
} as const;

export type LinePass = (typeof LINE_PASS)[keyof typeof LINE_PASS];

/** Distance of a fragment from the line axis: 0 on it, 1 at the rim of the quad (round caps included). */
const ACROSS_GLSL = `float capB = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
        float across = abs( vUv.y ) > 1.0
          ? sqrt( vUv.x * vUv.x + capB * capB )
          : abs( vUv.x );`;

/** Dots a line stops under: at most this many per line. */
const RULER_CUT_MAX = 128;

type LineCutUniforms = {
  rulerCuts: { value: Float32Array };
  rulerCutCount: { value: number };
};

const lineCutUniforms = (material: LineMaterial): LineCutUniforms =>
  material.userData["lineCuts"] as LineCutUniforms;

/**
 * Hands a line the screen circles of its ruler dots, in physical pixels from
 * the bottom left as `gl_FragCoord` counts them, as flat x, y, radius
 * triples. The line fades out inside them, so it stops under a dot instead
 * of showing through its see-through core.
 */
export const setLineCuts = (
  material: LineMaterial,
  cuts: readonly number[]
) => {
  const uniforms = lineCutUniforms(material);
  const count = Math.min(cuts.length / 3, RULER_CUT_MAX);
  if (count === 0 && uniforms.rulerCutCount.value === 0) return;
  uniforms.rulerCuts.value.set(cuts.slice(0, count * 3));
  uniforms.rulerCutCount.value = count;
};

/**
 * The MapLibre canvas has no MSAA and `LineMaterial` cuts its sides hard,
 * so the sides fade out over one physical pixel instead. The quad is drawn
 * `edgeFeatherPx` wider than the line (see the width update), the coverage
 * ramp runs over that rim and the line keeps its width. The same pass
 * leaves out the circles of the line's ruler dots, see `setLineCuts`.
 */
const featherLineEdges = (material: LineMaterial): void => {
  const cuts: LineCutUniforms = {
    rulerCuts: { value: new Float32Array(RULER_CUT_MAX * 3) },
    rulerCutCount: { value: 0 },
  };
  material.userData["lineCuts"] = cuts;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, cuts);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        `uniform vec3 rulerCuts[ ${RULER_CUT_MAX} ];
      uniform int rulerCutCount;
      void main() {`
      )
      .replace(
        "#include <logdepthbuf_fragment>",
        `{
        ${ACROSS_GLSL}
        alpha *= clamp( ( 1.0 - across ) * 0.5 * linewidth, 0.0, 1.0 );
        for ( int i = 0; i < ${RULER_CUT_MAX}; i ++ ) {
          if ( i >= rulerCutCount ) break;
          vec3 cut = rulerCuts[ i ];
          alpha *= smoothstep( cut.z - 0.75, cut.z + 0.75, distance( gl_FragCoord.xy, cut.xy ) );
        }
      }
      #include <logdepthbuf_fragment>`
      );
  };
};

type LineHaloUniforms = { haloInner: { value: number } };

/** Where the halo starts to fade, as a share of the quad half width (the line width over the halo width). */
export const setLineHaloInner = (material: LineMaterial, inner: number) => {
  (material.userData["halo"] as LineHaloUniforms).haloInner.value = inner;
};

/**
 * The halo of a visible line: the same quad drawn wider before the line,
 * with min blending. Its colour is grey haloDarkness across the line and
 * runs out to white (no effect) at the rim; the framebuffer keeps whichever
 * is darker per channel. The value is written after the colour space
 * conversion, so the grey is the grey on screen.
 */
export const createLineHaloMaterial = (): LineMaterial => {
  const uniforms: LineHaloUniforms = { haloInner: { value: 0.5 } };
  const material = new LineMaterial({
    color: 0xffffff,
    linewidth: 1,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  material.blending = CustomBlending;
  material.blendEquation = MinEquation;
  material.polygonOffset = true;
  material.polygonOffsetFactor =
    MAPLIBRE_SCENE_LINE_DEFAULTS.polygonOffsetFactor;
  material.polygonOffsetUnits = MAPLIBRE_SCENE_LINE_DEFAULTS.polygonOffsetUnits;
  material.userData["halo"] = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        `uniform float haloInner;
      void main() {`
      )
      .replace(
        "#include <premultiplied_alpha_fragment>",
        `{
        ${ACROSS_GLSL}
        // full strength at the line, then an ease-out to nothing at the rim,
        // so the halo reads as a soft shadow rather than an outline
        float fade = clamp( ( across - haloInner ) / ( 1.0 - haloInner ), 0.0, 1.0 );
        float strength = ( 1.0 - fade ) * ( 1.0 - fade );
        float shade = 1.0 - ( 1.0 - ${MAPLIBRE_SCENE_LINE_DEFAULTS.haloDarkness.toFixed(
          3
        )} ) * strength;
        gl_FragColor = vec4( vec3( shade ), 1.0 );
      }`
      );
  };
  return material;
};

export const createLineMaterial = (
  style: AnnotationSceneLineStyle,
  pass: LinePass
): LineMaterial => {
  const { color, opacity } = parseCssColor(style.color);
  const occluded = pass === LINE_PASS.OCCLUDED;
  const material = new LineMaterial({
    color: color.getHex(),
    linewidth: style.width,
    transparent: true,
    opacity: occluded
      ? opacity * MAPLIBRE_SCENE_LINE_DEFAULTS.occludedOpacity
      : opacity,
    depthWrite: false,
    depthTest: true,
    dashed: occluded,
  });
  featherLineEdges(material);
  if (occluded) {
    material.depthFunc = GreaterDepth;
    material.dashSize = MAPLIBRE_SCENE_LINE_DEFAULTS.occludedDashPx;
    material.gapSize = MAPLIBRE_SCENE_LINE_DEFAULTS.occludedGapPx;
  } else {
    material.polygonOffset = true;
    material.polygonOffsetFactor =
      MAPLIBRE_SCENE_LINE_DEFAULTS.polygonOffsetFactor;
    material.polygonOffsetUnits =
      MAPLIBRE_SCENE_LINE_DEFAULTS.polygonOffsetUnits;
  }
  return material;
};
