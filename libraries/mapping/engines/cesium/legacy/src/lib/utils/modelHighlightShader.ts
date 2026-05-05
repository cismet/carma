import { Cartesian3, Color, CustomShader, LightingModel } from "@carma-cesium";
import { COLORS, type UnitRgba } from "@carma-commons/utils";
import { UniformType } from "cesium";

const toCesiumColor = (color: UnitRgba) => new Color(...color);

const MODEL_SELECTION_HIGHLIGHT_COLOR_COMPONENT = 0.8;

export const DEFAULT_MODEL_SELECTION_HIGHLIGHT_COLOR = new Color(
  MODEL_SELECTION_HIGHLIGHT_COLOR_COMPONENT,
  MODEL_SELECTION_HIGHLIGHT_COLOR_COMPONENT,
  0,
  1
);
export const DEFAULT_MODEL_SELECTION_HIGHLIGHT_OPACITY = 1;
export const DEFAULT_MODEL_SAMPLING_HIGHLIGHT_COLOR = toCesiumColor(
  COLORS.NEUTRAL_WHITE
);
export const DEFAULT_MODEL_SAMPLING_HIGHLIGHT_OPACITY = 0.8;
export const DEFAULT_MODEL_SAMPLING_HIGHLIGHT_FADE_DURATION_MS = 180;

const MODEL_SAMPLING_HIGHLIGHT_COLOR_UNIFORM = "u_highlightColor";
const MODEL_SAMPLING_HIGHLIGHT_OPACITY_UNIFORM = "u_highlightOpacity";

export type ModelHighlightShaderUniformOptions = {
  color?: Color;
  opacity?: number;
  shader: CustomShader;
};

export const clampModelHighlightOpacity = (
  opacity: number,
  fallback = DEFAULT_MODEL_SAMPLING_HIGHLIGHT_OPACITY
) => (Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : fallback);

export const clampModelSamplingHighlightOpacity = clampModelHighlightOpacity;

const toModelHighlightColorUniform = (color: Color) =>
  new Cartesian3(color.red, color.green, color.blue);

export const createModelHighlightShader = ({
  color = DEFAULT_MODEL_SAMPLING_HIGHLIGHT_COLOR,
  forceOpaque = false,
  lightingModel,
  opacity = 0,
}: {
  color?: Color;
  forceOpaque?: boolean;
  lightingModel?: LightingModel;
  opacity?: number;
} = {}) =>
  new CustomShader({
    ...(lightingModel ? { lightingModel } : {}),
    uniforms: {
      [MODEL_SAMPLING_HIGHLIGHT_COLOR_UNIFORM]: {
        type: UniformType.VEC3,
        value: toModelHighlightColorUniform(color),
      },
      [MODEL_SAMPLING_HIGHLIGHT_OPACITY_UNIFORM]: {
        type: UniformType.FLOAT,
        value: clampModelHighlightOpacity(opacity),
      },
    },
    fragmentShaderText: `
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
  ${
    forceOpaque
      ? `
  material.diffuse = ${MODEL_SAMPLING_HIGHLIGHT_COLOR_UNIFORM};
  material.alpha = 1.0;`
      : `
  material.diffuse = mix(
    material.diffuse,
    ${MODEL_SAMPLING_HIGHLIGHT_COLOR_UNIFORM},
    ${MODEL_SAMPLING_HIGHLIGHT_OPACITY_UNIFORM}
  );`
  }
}
`,
  });

// Default highlight shader for selected 3D model primitives.
export const DEFAULT_MODEL_HIGHLIGHT_SHADER = new CustomShader({
  lightingModel: LightingModel.UNLIT,
  fragmentShaderText: `
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
  material.diffuse = vec3(0.8, 0.8, 0.0);
}
`,
});

export const createModelSelectionHighlightShader = ({
  color = DEFAULT_MODEL_SELECTION_HIGHLIGHT_COLOR,
  opacity = 0,
}: {
  color?: Color;
  opacity?: number;
} = {}) =>
  new CustomShader({
    lightingModel: LightingModel.UNLIT,
    uniforms: {
      [MODEL_SAMPLING_HIGHLIGHT_COLOR_UNIFORM]: {
        type: UniformType.VEC3,
        value: toModelHighlightColorUniform(color),
      },
      [MODEL_SAMPLING_HIGHLIGHT_OPACITY_UNIFORM]: {
        type: UniformType.FLOAT,
        value: clampModelHighlightOpacity(opacity),
      },
    },
    fragmentShaderText: `
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
  material.diffuse = ${MODEL_SAMPLING_HIGHLIGHT_COLOR_UNIFORM};
  material.alpha = material.alpha * ${MODEL_SAMPLING_HIGHLIGHT_OPACITY_UNIFORM};
}
`,
  });

export const createModelSamplingHighlightShader = () =>
  createModelHighlightShader({
    color: DEFAULT_MODEL_SAMPLING_HIGHLIGHT_COLOR,
    opacity: 0,
  });

export const setModelHighlightShaderUniforms = ({
  color = DEFAULT_MODEL_SAMPLING_HIGHLIGHT_COLOR,
  opacity = DEFAULT_MODEL_SAMPLING_HIGHLIGHT_OPACITY,
  shader,
}: ModelHighlightShaderUniformOptions) => {
  shader.setUniform(
    MODEL_SAMPLING_HIGHLIGHT_COLOR_UNIFORM,
    toModelHighlightColorUniform(color)
  );
  shader.setUniform(
    MODEL_SAMPLING_HIGHLIGHT_OPACITY_UNIFORM,
    clampModelHighlightOpacity(opacity)
  );
};

export type ModelSamplingHighlightShaderUniformOptions =
  ModelHighlightShaderUniformOptions;

export const setModelSamplingHighlightShaderUniforms =
  setModelHighlightShaderUniforms;
