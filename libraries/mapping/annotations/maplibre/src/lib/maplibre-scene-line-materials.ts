import {
  CustomBlending,
  GreaterDepth,
  MinEquation,
  type Material,
} from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { AnnotationSceneLineStyle } from "@carma-mapping/annotations/core";

import { parseCssColor } from "./maplibre-css-color";
import { MAPLIBRE_SCENE_LINE_DEFAULTS } from "./maplibre-scene-defaults";

/** Shared screen-space cap: repeated halos cannot accumulate darkening. */
export const SCENE_DARKEN_GLSL = `
float sceneDarkenShade( float strength ) {
  return 1.0 - ( 1.0 - ${MAPLIBRE_SCENE_LINE_DEFAULTS.haloDarkness.toFixed(
    3
  )} ) * clamp( strength, 0.0, 1.0 );
}
`;

export const applySceneDarkenBlend = (material: Material): void => {
  material.blending = CustomBlending;
  material.blendEquation = MinEquation;
};

export const LINE_PASS = {
  /** Depth-tested, continuous unless the style dashes it; an `overlay` line ignores depth. */
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
  applySceneDarkenBlend(material);
  material.polygonOffset = true;
  material.polygonOffsetFactor =
    MAPLIBRE_SCENE_LINE_DEFAULTS.polygonOffsetFactor;
  material.polygonOffsetUnits = MAPLIBRE_SCENE_LINE_DEFAULTS.polygonOffsetUnits;
  material.userData["halo"] = uniforms;
  material.customProgramCacheKey = () =>
    SCENE_DARKEN_GLSL + material.onBeforeCompile.toString();
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        `${SCENE_DARKEN_GLSL}
      uniform float haloInner;
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
        float shade = sceneDarkenShade( strength * opacity );
        gl_FragColor = vec4( vec3( shade ), 1.0 );
      }`
      );
  };
  return material;
};

/** Whether a line draws a depth-fail pass: an `overlay` line is fully visible already. */
export const hasOccludedPass = (style: AnnotationSceneLineStyle): boolean =>
  Boolean(style.occludedDashed) && !style.overlay;

/** The dash of a line in CSS pixels: the style's, else the occluded pass's own. */
export const resolveLineDashPx = (style: AnnotationSceneLineStyle) =>
  style.dash ?? {
    dashPx: MAPLIBRE_SCENE_LINE_DEFAULTS.occludedDashPx,
    gapPx: MAPLIBRE_SCENE_LINE_DEFAULTS.occludedGapPx,
  };

export const resolveLineRenderOrder = (
  style: AnnotationSceneLineStyle,
  pass: LinePass
): number =>
  pass === LINE_PASS.OCCLUDED
    ? MAPLIBRE_SCENE_LINE_DEFAULTS.occludedRenderOrder
    : style.overlay
    ? MAPLIBRE_SCENE_LINE_DEFAULTS.overlayRenderOrder
    : MAPLIBRE_SCENE_LINE_DEFAULTS.renderOrder;

/**
 * Everything of a pass that follows the style but the colour and the width:
 * opacity (the colour's alpha times the style's, faint for the occluded
 * pass), dashing, and the depth state. An `overlay` line neither tests nor
 * writes depth, so it covers the scene and leaves the depth buffer the
 * occlusion probes read as it was. The dash lengths are CSS pixels here; the
 * line collection rescales them to world units every frame.
 */
export const applyLineLook = (
  material: LineMaterial,
  style: AnnotationSceneLineStyle,
  pass: LinePass
): void => {
  const occluded = pass === LINE_PASS.OCCLUDED;
  const { dashPx, gapPx } = resolveLineDashPx(style);
  material.opacity =
    parseCssColor(style.color).opacity *
    Math.min(Math.max(style.opacity ?? 1, 0), 1) *
    (occluded ? MAPLIBRE_SCENE_LINE_DEFAULTS.occludedOpacity : 1);
  material.dashed = occluded || style.dash !== undefined;
  material.dashSize = dashPx;
  material.gapSize = gapPx;
  material.depthWrite = false;
  material.depthTest = !style.overlay;
  material.polygonOffset = !occluded && !style.overlay;
};

export const createLineMaterial = (
  style: AnnotationSceneLineStyle,
  pass: LinePass
): LineMaterial => {
  const material = new LineMaterial({
    color: parseCssColor(style.color).color.getHex(),
    linewidth: style.width,
    transparent: true,
  });
  featherLineEdges(material);
  if (pass === LINE_PASS.OCCLUDED) {
    material.depthFunc = GreaterDepth;
  } else {
    material.polygonOffsetFactor =
      MAPLIBRE_SCENE_LINE_DEFAULTS.polygonOffsetFactor;
    material.polygonOffsetUnits =
      MAPLIBRE_SCENE_LINE_DEFAULTS.polygonOffsetUnits;
  }
  applyLineLook(material, style, pass);
  return material;
};
