import { Easing, type Easing as EasingFunction } from "@carma-commons/math";
import { Cartesian3, Color, CustomShader, type Model } from "@carma-cesium";
import { COLORS, type UnitRgba } from "@carma-commons/utils";
import { UniformType } from "cesium";

const toCesiumColor = (color: UnitRgba) => new Color(...color);

export const modelShader = {
  defaults: {
    selection: {
      color: new Color(1, 1, 0, 1),
      edge: {
        color: Color.BLACK,
        opacity: 0.5,
        widthPx: 4,
      },
      fade: {
        durationMs: 220,
        easing: Easing.CUBIC_OUT,
      },
      flash: {
        color: new Color(1, 1, 1, 1),
        inDurationMs: 50,
        inEasing: Easing.CUBIC_OUT,
        opacity: 1,
        outDurationMs: 800,
        outEasing: Easing.CUBIC_OUT,
      },
      hoverClearDelayMs: 40,
      opacity: 1,
      silhouetteSizeFadeExponent: 1.5,
    },
    sampling: {
      color: toCesiumColor(COLORS.NEUTRAL_WHITE),
      fadeDurationMs: 180,
      opacity: 0.8,
    },
  },
} as const;

const MODEL_SHADER_EDGE_MODE_PROPERTY = "modelShaderEdgeMode";
const MODEL_SELECTION_SILHOUETTE_SIZE_FADE_EXPONENT =
  modelShader.defaults.selection.silhouetteSizeFadeExponent;

export type ModelShaderEdgeMode = "silhouette" | "none";
export type ModelShaderFlashStyle = "selectionFlash" | "highlightFlash";

const MODEL_HIGHLIGHT_COLOR_UNIFORM = "u_highlightColor";
const MODEL_HIGHLIGHT_OPACITY_UNIFORM = "u_highlightOpacity";
const MODEL_BASE_HIGHLIGHT_COLOR_UNIFORM = "u_baseHighlightColor";
const MODEL_BASE_HIGHLIGHT_OPACITY_UNIFORM = "u_baseHighlightOpacity";
const MODEL_SHADER_FLASH_COLOR_UNIFORM = "u_modelShaderFlashColor";
const MODEL_SHADER_FLASH_OPACITY_UNIFORM = "u_modelShaderFlashOpacity";
const MODEL_INTEGRATED_HIGHLIGHT_SHADERS = new WeakSet<CustomShader>();
const MODEL_HIGHLIGHT_SHADER_UNIFORMS = new WeakMap<
  CustomShader,
  ModelShaderUniformValues
>();
const MODEL_BASE_HIGHLIGHT_SHADER_UNIFORMS = new WeakMap<
  CustomShader,
  ModelShaderUniformValues
>();
const MODEL_SHADER_FLASH_UNIFORMS = new WeakMap<
  CustomShader,
  ModelShaderUniformValues
>();

export type ModelShaderUniformOptions = {
  color?: Color;
  opacity?: number;
  shader: CustomShader;
};

export type ModelShaderUniformValues = {
  color: Color;
  opacity: number;
};

export type ModelShaderState = {
  animationDurationMs: number;
  animationEasing: EasingFunction;
  animationStartOpacity: number;
  animationStartTimestampMs: number | null;
  flashColor: Color;
  flashInDurationMs: number;
  flashInEasing: EasingFunction;
  flashOpacity: number;
  flashOutDurationMs: number;
  flashOutEasing: EasingFunction;
  flashStartTimestampMs: number | null;
  flashStyle: ModelShaderFlashStyle | null;
  isFlashActive: boolean;
  originalOutlineColor: Color;
  originalShowOutline: boolean;
  originalHighlightColor?: Color;
  originalHighlightOpacity?: number;
  originalShader: CustomShader | undefined;
  originalSilhouetteColor: Color;
  originalSilhouetteSize: number;
  opacity: number;
  shader: CustomShader;
  targetOpacity: number;
  usesIntegratedShader: boolean;
};

export const clampModelShaderOpacity = (
  opacity: number,
  fallback: number = modelShader.defaults.sampling.opacity
) => (Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : fallback);

export const clampModelShaderEdgeOpacity = (
  opacity: number | undefined,
  fallback: number = modelShader.defaults.selection.edge.opacity
) =>
  typeof opacity === "number" && Number.isFinite(opacity)
    ? Math.min(1, Math.max(0, opacity))
    : fallback;

export const normalizeModelShaderEdgeWidthPx = (
  edgeWidthPx: number | undefined,
  fallback: number = modelShader.defaults.selection.edge.widthPx
) =>
  typeof edgeWidthPx === "number" &&
  Number.isFinite(edgeWidthPx) &&
  edgeWidthPx >= 0
    ? edgeWidthPx
    : fallback;

const toModelHighlightColorUniform = (color: Color) =>
  new Cartesian3(color.red, color.green, color.blue);

const cloneColor = (color: Color) => Color.clone(color, new Color());

const markModelShader = (shader: CustomShader) => {
  MODEL_INTEGRATED_HIGHLIGHT_SHADERS.add(shader);
  return shader;
};

export const isModelShader = (shader: CustomShader | undefined) =>
  shader ? MODEL_INTEGRATED_HIGHLIGHT_SHADERS.has(shader) : false;

export const readModelShaderSelectionUniforms = (
  shader: CustomShader | undefined
): ModelShaderUniformValues | undefined => {
  if (!shader) {
    return undefined;
  }
  const values = MODEL_HIGHLIGHT_SHADER_UNIFORMS.get(shader);
  return values
    ? { color: cloneColor(values.color), opacity: values.opacity }
    : undefined;
};

export const readModelShaderHighlightUniforms = (
  shader: CustomShader | undefined
): ModelShaderUniformValues | undefined => {
  if (!shader) {
    return undefined;
  }
  const values = MODEL_BASE_HIGHLIGHT_SHADER_UNIFORMS.get(shader);
  return values
    ? { color: cloneColor(values.color), opacity: values.opacity }
    : undefined;
};

export const readModelShaderFlashUniforms = (
  shader: CustomShader | undefined
): ModelShaderUniformValues | undefined => {
  if (!shader) {
    return undefined;
  }
  const values = MODEL_SHADER_FLASH_UNIFORMS.get(shader);
  return values
    ? { color: cloneColor(values.color), opacity: values.opacity }
    : undefined;
};

const createModelSamplingColorMixShader = ({
  color = modelShader.defaults.sampling.color,
  opacity = 0,
}: {
  color?: Color;
  opacity?: number;
} = {}) =>
  new CustomShader({
    uniforms: {
      [MODEL_HIGHLIGHT_COLOR_UNIFORM]: {
        type: UniformType.VEC3,
        value: toModelHighlightColorUniform(color),
      },
      [MODEL_HIGHLIGHT_OPACITY_UNIFORM]: {
        type: UniformType.FLOAT,
        value: clampModelShaderOpacity(opacity),
      },
    },
    fragmentShaderText: `
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
  material.diffuse = mix(
    material.diffuse,
    ${MODEL_HIGHLIGHT_COLOR_UNIFORM},
    ${MODEL_HIGHLIGHT_OPACITY_UNIFORM}
  );
}
`,
  });

export const createModelShader = ({
  color = modelShader.defaults.selection.color,
  opacity = 0,
}: {
  color?: Color;
  opacity?: number;
} = {}) => {
  const initialOpacity = clampModelShaderOpacity(opacity, 0);
  const shader = markModelShader(
    new CustomShader({
      uniforms: {
        [MODEL_BASE_HIGHLIGHT_COLOR_UNIFORM]: {
          type: UniformType.VEC3,
          value: toModelHighlightColorUniform(color),
        },
        [MODEL_BASE_HIGHLIGHT_OPACITY_UNIFORM]: {
          type: UniformType.FLOAT,
          value: 0,
        },
        [MODEL_HIGHLIGHT_COLOR_UNIFORM]: {
          type: UniformType.VEC3,
          value: toModelHighlightColorUniform(color),
        },
        [MODEL_HIGHLIGHT_OPACITY_UNIFORM]: {
          type: UniformType.FLOAT,
          value: initialOpacity,
        },
        [MODEL_SHADER_FLASH_COLOR_UNIFORM]: {
          type: UniformType.VEC3,
          value: toModelHighlightColorUniform(color),
        },
        [MODEL_SHADER_FLASH_OPACITY_UNIFORM]: {
          type: UniformType.FLOAT,
          value: 0,
        },
      },
      fragmentShaderText: `
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
  float baseHighlightOpacity = clamp(${MODEL_BASE_HIGHLIGHT_OPACITY_UNIFORM}, 0.0, 1.0);
  vec3 highlightedDiffuse = mix(
    material.diffuse,
    vec3(0.0),
    baseHighlightOpacity
  );
  vec3 highlightedEmissive = mix(
    material.emissive,
    ${MODEL_BASE_HIGHLIGHT_COLOR_UNIFORM},
    baseHighlightOpacity
  );

  float highlightOpacity = clamp(${MODEL_HIGHLIGHT_OPACITY_UNIFORM}, 0.0, 1.0);
  material.diffuse = mix(
    highlightedDiffuse,
    vec3(0.0),
    highlightOpacity
  );
  material.emissive = mix(
    highlightedEmissive,
    ${MODEL_HIGHLIGHT_COLOR_UNIFORM},
    highlightOpacity
  );

  float modelShaderFlashOpacity = clamp(${MODEL_SHADER_FLASH_OPACITY_UNIFORM}, 0.0, 1.0);
  material.diffuse = mix(
    material.diffuse,
    vec3(0.0),
    modelShaderFlashOpacity
  );
  material.emissive = mix(
    material.emissive,
    ${MODEL_SHADER_FLASH_COLOR_UNIFORM},
    modelShaderFlashOpacity
  );
}
`,
    })
  );
  MODEL_HIGHLIGHT_SHADER_UNIFORMS.set(shader, {
    color: cloneColor(color),
    opacity: initialOpacity,
  });
  MODEL_BASE_HIGHLIGHT_SHADER_UNIFORMS.set(shader, {
    color: cloneColor(color),
    opacity: 0,
  });
  MODEL_SHADER_FLASH_UNIFORMS.set(shader, {
    color: cloneColor(color),
    opacity: 0,
  });
  return shader;
};

export const createModelSamplingHighlightShader = () =>
  createModelSamplingColorMixShader({
    color: modelShader.defaults.sampling.color,
    opacity: 0,
  });

export const setModelShaderSelectionUniforms = ({
  color = modelShader.defaults.sampling.color,
  opacity = modelShader.defaults.sampling.opacity,
  shader,
}: ModelShaderUniformOptions) => {
  shader.setUniform(
    MODEL_HIGHLIGHT_COLOR_UNIFORM,
    toModelHighlightColorUniform(color)
  );
  shader.setUniform(
    MODEL_HIGHLIGHT_OPACITY_UNIFORM,
    clampModelShaderOpacity(opacity)
  );
  MODEL_HIGHLIGHT_SHADER_UNIFORMS.set(shader, {
    color: cloneColor(color),
    opacity: clampModelShaderOpacity(opacity),
  });
};

export const setModelSamplingHighlightShaderUniforms =
  setModelShaderSelectionUniforms;

export const setModelShaderHighlightUniforms = ({
  color = modelShader.defaults.sampling.color,
  opacity = 0,
  shader,
}: ModelShaderUniformOptions) => {
  shader.setUniform(
    MODEL_BASE_HIGHLIGHT_COLOR_UNIFORM,
    toModelHighlightColorUniform(color)
  );
  shader.setUniform(
    MODEL_BASE_HIGHLIGHT_OPACITY_UNIFORM,
    clampModelShaderOpacity(opacity, 0)
  );
  MODEL_BASE_HIGHLIGHT_SHADER_UNIFORMS.set(shader, {
    color: cloneColor(color),
    opacity: clampModelShaderOpacity(opacity, 0),
  });
};

export const setModelShaderFlashUniforms = ({
  color = modelShader.defaults.selection.color,
  opacity = 0,
  shader,
}: ModelShaderUniformOptions) => {
  shader.setUniform(
    MODEL_SHADER_FLASH_COLOR_UNIFORM,
    toModelHighlightColorUniform(color)
  );
  shader.setUniform(
    MODEL_SHADER_FLASH_OPACITY_UNIFORM,
    clampModelShaderOpacity(opacity, 0)
  );
  MODEL_SHADER_FLASH_UNIFORMS.set(shader, {
    color: cloneColor(color),
    opacity: clampModelShaderOpacity(opacity, 0),
  });
};

export const normalizeModelShaderFadeDuration = (
  fadeDurationMs: number | undefined
) =>
  typeof fadeDurationMs === "number" &&
  Number.isFinite(fadeDurationMs) &&
  fadeDurationMs >= 0
    ? fadeDurationMs
    : modelShader.defaults.selection.fade.durationMs;

export const normalizeModelShaderFlashInDuration = (
  durationMs: number | undefined
) =>
  typeof durationMs === "number" &&
  Number.isFinite(durationMs) &&
  durationMs >= 0
    ? durationMs
    : modelShader.defaults.selection.flash.inDurationMs;

export const normalizeModelShaderFlashOutDuration = (
  durationMs: number | undefined
) =>
  typeof durationMs === "number" &&
  Number.isFinite(durationMs) &&
  durationMs >= 0
    ? durationMs
    : modelShader.defaults.selection.flash.outDurationMs;

export const normalizeModelShaderHoverClearDelay = (
  clearDelayMs: number | undefined
) =>
  typeof clearDelayMs === "number" &&
  Number.isFinite(clearDelayMs) &&
  clearDelayMs >= 0
    ? clearDelayMs
    : modelShader.defaults.selection.hoverClearDelayMs;

export const interpolateNumber = (from: number, to: number, progress: number) =>
  from + (to - from) * progress;

export const clampEasedProgress = (progress: number) =>
  Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 1;

export const interpolateColor = (from: Color, to: Color, progress: number) =>
  new Color(
    from.red + (to.red - from.red) * progress,
    from.green + (to.green - from.green) * progress,
    from.blue + (to.blue - from.blue) * progress,
    from.alpha + (to.alpha - from.alpha) * progress
  );

export const createNonAccumulatingSilhouetteColor = (
  edgeColor: Color,
  edgeOpacity: number
) => {
  const strength = edgeColor.alpha * clampModelShaderEdgeOpacity(edgeOpacity);

  return new Color(
    1 + (edgeColor.red - 1) * strength,
    1 + (edgeColor.green - 1) * strength,
    1 + (edgeColor.blue - 1) * strength,
    1
  );
};

export const calculateTaperedSilhouetteSize = (
  edgeWidthPx: number,
  highlightOpacity: number
) =>
  normalizeModelShaderEdgeWidthPx(
    edgeWidthPx,
    modelShader.defaults.selection.edge.widthPx
  ) *
  Math.pow(
    clampModelShaderOpacity(highlightOpacity, 0),
    MODEL_SELECTION_SILHOUETTE_SIZE_FADE_EXPONENT
  );

export const readPrimitiveModelShaderEdgeMode = (
  primitive: Model,
  fallback: ModelShaderEdgeMode
): ModelShaderEdgeMode => {
  const pickId = primitive.id as
    | { properties?: Record<string, unknown> }
    | undefined;
  const configuredMode = pickId?.properties?.[MODEL_SHADER_EDGE_MODE_PROPERTY];
  return configuredMode === "silhouette" || configuredMode === "none"
    ? configuredMode
    : fallback;
};
