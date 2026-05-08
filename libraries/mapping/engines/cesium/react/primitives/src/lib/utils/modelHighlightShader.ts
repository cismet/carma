import { Cartesian3, Color, CustomShader } from "@carma-cesium";
import { COLORS, type UnitRgba } from "@carma-commons/utils";
import { UniformType } from "cesium";

const toCesiumColor = (color: UnitRgba) => new Color(...color);

const MODEL_SELECTION_HIGHLIGHT_COLOR_COMPONENT = 1;

export const DEFAULT_MODEL_SELECTION_HIGHLIGHT_COLOR = new Color(
  MODEL_SELECTION_HIGHLIGHT_COLOR_COMPONENT,
  MODEL_SELECTION_HIGHLIGHT_COLOR_COMPONENT,
  0,
  1
);
export const DEFAULT_MODEL_SELECTION_HIGHLIGHT_OPACITY = 1;
export const DEFAULT_MODEL_SELECTION_HIGHLIGHT_EDGE_COLOR = Color.BLACK;
export const DEFAULT_MODEL_SELECTION_HIGHLIGHT_EDGE_OPACITY = 0.5;
export const DEFAULT_MODEL_SELECTION_HIGHLIGHT_EDGE_WIDTH_PX = 4;
export const DEFAULT_MODEL_SAMPLING_HIGHLIGHT_COLOR = toCesiumColor(
  COLORS.NEUTRAL_WHITE
);
export const DEFAULT_MODEL_SAMPLING_HIGHLIGHT_OPACITY = 0.8;
export const DEFAULT_MODEL_SAMPLING_HIGHLIGHT_FADE_DURATION_MS = 180;

const MODEL_HIGHLIGHT_COLOR_UNIFORM = "u_highlightColor";
const MODEL_HIGHLIGHT_OPACITY_UNIFORM = "u_highlightOpacity";
const MODEL_BASE_HIGHLIGHT_COLOR_UNIFORM = "u_baseHighlightColor";
const MODEL_BASE_HIGHLIGHT_OPACITY_UNIFORM = "u_baseHighlightOpacity";
const MODEL_INTEGRATED_HIGHLIGHT_SHADERS = new WeakSet<CustomShader>();
const MODEL_HIGHLIGHT_SHADER_UNIFORMS = new WeakMap<
  CustomShader,
  ModelHighlightShaderUniformValues
>();
const MODEL_BASE_HIGHLIGHT_SHADER_UNIFORMS = new WeakMap<
  CustomShader,
  ModelHighlightShaderUniformValues
>();

export type ModelSamplingHighlightShaderUniformOptions = {
  color?: Color;
  opacity?: number;
  shader: CustomShader;
};

export type ModelHighlightShaderUniformOptions =
  ModelSamplingHighlightShaderUniformOptions;

export type ModelBaseHighlightShaderUniformOptions =
  ModelSamplingHighlightShaderUniformOptions;

export type ModelHighlightShaderUniformValues = {
  color: Color;
  opacity: number;
};

export const clampModelHighlightOpacity = (
  opacity: number,
  fallback = DEFAULT_MODEL_SAMPLING_HIGHLIGHT_OPACITY
) => (Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : fallback);

export const clampModelSamplingHighlightOpacity = clampModelHighlightOpacity;

export const clampModelHighlightEdgeOpacity = (
  opacity: number | undefined,
  fallback = DEFAULT_MODEL_SELECTION_HIGHLIGHT_EDGE_OPACITY
) =>
  typeof opacity === "number" && Number.isFinite(opacity)
    ? Math.min(1, Math.max(0, opacity))
    : fallback;

export const normalizeModelHighlightEdgeWidthPx = (
  edgeWidthPx: number | undefined,
  fallback = DEFAULT_MODEL_SELECTION_HIGHLIGHT_EDGE_WIDTH_PX
) =>
  typeof edgeWidthPx === "number" &&
  Number.isFinite(edgeWidthPx) &&
  edgeWidthPx >= 0
    ? edgeWidthPx
    : fallback;

const toModelHighlightColorUniform = (color: Color) =>
  new Cartesian3(color.red, color.green, color.blue);

const cloneColor = (color: Color) => Color.clone(color, new Color());

const markModelIntegratedHighlightShader = (shader: CustomShader) => {
  MODEL_INTEGRATED_HIGHLIGHT_SHADERS.add(shader);
  return shader;
};

export const isModelIntegratedHighlightShader = (
  shader: CustomShader | undefined
) => (shader ? MODEL_INTEGRATED_HIGHLIGHT_SHADERS.has(shader) : false);

export const readModelHighlightShaderUniforms = (
  shader: CustomShader | undefined
): ModelHighlightShaderUniformValues | undefined => {
  if (!shader) {
    return undefined;
  }
  const values = MODEL_HIGHLIGHT_SHADER_UNIFORMS.get(shader);
  return values
    ? { color: cloneColor(values.color), opacity: values.opacity }
    : undefined;
};

export const readModelBaseHighlightShaderUniforms = (
  shader: CustomShader | undefined
): ModelHighlightShaderUniformValues | undefined => {
  if (!shader) {
    return undefined;
  }
  const values = MODEL_BASE_HIGHLIGHT_SHADER_UNIFORMS.get(shader);
  return values
    ? { color: cloneColor(values.color), opacity: values.opacity }
    : undefined;
};

const createModelSamplingColorMixShader = ({
  color = DEFAULT_MODEL_SAMPLING_HIGHLIGHT_COLOR,
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
        value: clampModelHighlightOpacity(opacity),
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

export const createModelSelectionHighlightShader = ({
  color = DEFAULT_MODEL_SELECTION_HIGHLIGHT_COLOR,
  opacity = 0,
}: {
  color?: Color;
  opacity?: number;
} = {}) => {
  const initialOpacity = clampModelHighlightOpacity(opacity, 0);
  const shader = markModelIntegratedHighlightShader(
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
  return shader;
};

export const createModelSamplingHighlightShader = () =>
  createModelSamplingColorMixShader({
    color: DEFAULT_MODEL_SAMPLING_HIGHLIGHT_COLOR,
    opacity: 0,
  });

export const setModelHighlightShaderUniforms = ({
  color = DEFAULT_MODEL_SAMPLING_HIGHLIGHT_COLOR,
  opacity = DEFAULT_MODEL_SAMPLING_HIGHLIGHT_OPACITY,
  shader,
}: ModelSamplingHighlightShaderUniformOptions) => {
  shader.setUniform(
    MODEL_HIGHLIGHT_COLOR_UNIFORM,
    toModelHighlightColorUniform(color)
  );
  shader.setUniform(
    MODEL_HIGHLIGHT_OPACITY_UNIFORM,
    clampModelHighlightOpacity(opacity)
  );
  MODEL_HIGHLIGHT_SHADER_UNIFORMS.set(shader, {
    color: cloneColor(color),
    opacity: clampModelHighlightOpacity(opacity),
  });
};

export const setModelSamplingHighlightShaderUniforms =
  setModelHighlightShaderUniforms;

export const setModelBaseHighlightShaderUniforms = ({
  color = DEFAULT_MODEL_SAMPLING_HIGHLIGHT_COLOR,
  opacity = 0,
  shader,
}: ModelBaseHighlightShaderUniformOptions) => {
  shader.setUniform(
    MODEL_BASE_HIGHLIGHT_COLOR_UNIFORM,
    toModelHighlightColorUniform(color)
  );
  shader.setUniform(
    MODEL_BASE_HIGHLIGHT_OPACITY_UNIFORM,
    clampModelHighlightOpacity(opacity, 0)
  );
  MODEL_BASE_HIGHLIGHT_SHADER_UNIFORMS.set(shader, {
    color: cloneColor(color),
    opacity: clampModelHighlightOpacity(opacity, 0),
  });
};
