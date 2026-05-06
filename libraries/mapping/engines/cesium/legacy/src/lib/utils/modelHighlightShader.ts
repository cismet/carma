import { Cartesian3, Color, CustomShader, LightingModel } from "@carma-cesium";
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
export const DEFAULT_MODEL_SELECTION_HIGHLIGHT_EDGE_WIDTH_PX = 8;
export const DEFAULT_MODEL_SAMPLING_HIGHLIGHT_COLOR = toCesiumColor(
  COLORS.NEUTRAL_WHITE
);
export const DEFAULT_MODEL_SAMPLING_HIGHLIGHT_OPACITY = 0.8;
export const DEFAULT_MODEL_SAMPLING_HIGHLIGHT_FADE_DURATION_MS = 180;

const MODEL_HIGHLIGHT_COLOR_UNIFORM = "u_highlightColor";
const MODEL_HIGHLIGHT_OPACITY_UNIFORM = "u_highlightOpacity";

export type ModelSamplingHighlightShaderUniformOptions = {
  color?: Color;
  opacity?: number;
  shader: CustomShader;
};

export type ModelHighlightShaderUniformOptions =
  ModelSamplingHighlightShaderUniformOptions;

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
} = {}) =>
  new CustomShader({
    lightingModel: LightingModel.UNLIT,
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
  float highlightOpacity = clamp(${MODEL_HIGHLIGHT_OPACITY_UNIFORM}, 0.0, 1.0);
  vec3 highlightedDiffuse = mix(
    material.diffuse,
    ${MODEL_HIGHLIGHT_COLOR_UNIFORM},
    highlightOpacity
  );
  material.diffuse = highlightedDiffuse;
}
`,
  });

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
};

export const setModelSamplingHighlightShaderUniforms =
  setModelHighlightShaderUniforms;
