import { Easing, type Easing as EasingFunction } from "@carma-commons/math";
import { Cartesian3, Color, CustomShader, type Model } from "@carma-cesium";
import { COLORS } from "@carma-commons/utils";
import { colorFromRgbaArray } from "@carma-mapping/engines/cesium/core";
import { UniformType } from "cesium";

const MODEL_SHADER_DEFAULTS = {
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
      selection: {
        color: new Color(1, 1, 1, 1),
        inDurationMs: 50,
        inEasing: Easing.CUBIC_OUT,
        opacity: 1,
        outDurationMs: 800,
        outEasing: Easing.CUBIC_OUT,
      },
      highlight: {
        color: new Color(1, 1, 0, 1),
        inDurationMs: 50,
        inEasing: Easing.CUBIC_OUT,
        opacity: 1,
        outDurationMs: 800,
        outEasing: Easing.CUBIC_OUT,
      },
    },
    hover: {
      clearDelayMs: 40,
      enabled: false,
      fade: {
        durationMs: 220,
        easing: Easing.CUBIC_OUT,
      },
    },
    opacity: 1,
    silhouetteSizeFadeExponent: 1.5,
    style: {
      edge: {
        color: Color.BLACK,
        mode: "silhouette",
        opacity: 0.5,
        widthPx: 4,
      },
      fillColor: new Color(1, 1, 0, 1),
    },
  },
  sampling: {
    color: colorFromRgbaArray(COLORS.NEUTRAL_WHITE),
    enabled: false,
    fade: {
      durationMs: 180,
    },
    fadeDurationMs: 180,
    opacity: 0.8,
  },
} as const;

export type ModelShaderEdgeMode = "silhouette" | "none";
export type ModelShaderFlashStyle = "selectionFlash" | "highlightFlash";

const MODEL_SHADER_PRIMITIVE_PROPERTIES = {
  edgeMode: "modelShaderEdgeMode",
} as const;
const MODEL_SHADER_UNIFORMS = {
  highlight: {
    color: "u_baseHighlightColor",
    opacity: "u_baseHighlightOpacity",
  },
  selection: {
    color: "u_highlightColor",
    opacity: "u_highlightOpacity",
  },
  flash: {
    color: "u_modelShaderFlashColor",
    opacity: "u_modelShaderFlashOpacity",
  },
} as const;
const MODEL_SHADER_INSTANCES = new WeakSet<CustomShader>();
const MODEL_SHADER_UNIFORM_VALUES = {
  highlight: new WeakMap<CustomShader, ModelShaderUniformValues>(),
  selection: new WeakMap<CustomShader, ModelShaderUniformValues>(),
  flash: new WeakMap<CustomShader, ModelShaderUniformValues>(),
} as const;

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

export const clampOpacity = (
  opacity: number,
  fallback: number = MODEL_SHADER_DEFAULTS.sampling.opacity
) => (Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : fallback);

export const clampEdgeOpacity = (
  opacity: number | undefined,
  fallback: number = MODEL_SHADER_DEFAULTS.selection.edge.opacity
) =>
  typeof opacity === "number" && Number.isFinite(opacity)
    ? Math.min(1, Math.max(0, opacity))
    : fallback;

export const normalizeEdgeWidthPx = (
  edgeWidthPx: number | undefined,
  fallback: number = MODEL_SHADER_DEFAULTS.selection.edge.widthPx
) =>
  typeof edgeWidthPx === "number" &&
  Number.isFinite(edgeWidthPx) &&
  edgeWidthPx >= 0
    ? edgeWidthPx
    : fallback;

const toModelHighlightColorUniform = (color: Color) =>
  new Cartesian3(color.red, color.green, color.blue);

const cloneColor = (color: Color) => Color.clone(color, new Color());

export const isModelShader = (shader: CustomShader | undefined) =>
  shader ? MODEL_SHADER_INSTANCES.has(shader) : false;

export const readSelectionUniforms = (
  shader: CustomShader | undefined
): ModelShaderUniformValues | undefined => {
  if (!shader) {
    return undefined;
  }
  const values = MODEL_SHADER_UNIFORM_VALUES.selection.get(shader);
  return values
    ? { color: cloneColor(values.color), opacity: values.opacity }
    : undefined;
};

export const readHighlightUniforms = (
  shader: CustomShader | undefined
): ModelShaderUniformValues | undefined => {
  if (!shader) {
    return undefined;
  }
  const values = MODEL_SHADER_UNIFORM_VALUES.highlight.get(shader);
  return values
    ? { color: cloneColor(values.color), opacity: values.opacity }
    : undefined;
};

export const readFlashUniforms = (
  shader: CustomShader | undefined
): ModelShaderUniformValues | undefined => {
  if (!shader) {
    return undefined;
  }
  const values = MODEL_SHADER_UNIFORM_VALUES.flash.get(shader);
  return values
    ? { color: cloneColor(values.color), opacity: values.opacity }
    : undefined;
};

const createModelSamplingColorMixShader = ({
  color = MODEL_SHADER_DEFAULTS.sampling.color,
  opacity = 0,
}: {
  color?: Color;
  opacity?: number;
} = {}) =>
  new CustomShader({
    uniforms: {
      [MODEL_SHADER_UNIFORMS.selection.color]: {
        type: UniformType.VEC3,
        value: toModelHighlightColorUniform(color),
      },
      [MODEL_SHADER_UNIFORMS.selection.opacity]: {
        type: UniformType.FLOAT,
        value: clampOpacity(opacity),
      },
    },
    fragmentShaderText: `
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
  material.diffuse = mix(
    material.diffuse,
    ${MODEL_SHADER_UNIFORMS.selection.color},
    ${MODEL_SHADER_UNIFORMS.selection.opacity}
  );
}
`,
  });

export const createModelShader = ({
  color = MODEL_SHADER_DEFAULTS.selection.color,
  opacity = 0,
}: {
  color?: Color;
  opacity?: number;
} = {}) => {
  const initialOpacity = clampOpacity(opacity, 0);
  const shader = new CustomShader({
    uniforms: {
      [MODEL_SHADER_UNIFORMS.highlight.color]: {
        type: UniformType.VEC3,
        value: toModelHighlightColorUniform(color),
      },
      [MODEL_SHADER_UNIFORMS.highlight.opacity]: {
        type: UniformType.FLOAT,
        value: 0,
      },
      [MODEL_SHADER_UNIFORMS.selection.color]: {
        type: UniformType.VEC3,
        value: toModelHighlightColorUniform(color),
      },
      [MODEL_SHADER_UNIFORMS.selection.opacity]: {
        type: UniformType.FLOAT,
        value: initialOpacity,
      },
      [MODEL_SHADER_UNIFORMS.flash.color]: {
        type: UniformType.VEC3,
        value: toModelHighlightColorUniform(color),
      },
      [MODEL_SHADER_UNIFORMS.flash.opacity]: {
        type: UniformType.FLOAT,
        value: 0,
      },
    },
    fragmentShaderText: `
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
  float baseHighlightOpacity = clamp(${MODEL_SHADER_UNIFORMS.highlight.opacity}, 0.0, 1.0);
  vec3 highlightedDiffuse = mix(
    material.diffuse,
    vec3(0.0),
    baseHighlightOpacity
  );
  vec3 highlightedEmissive = mix(
    material.emissive,
    ${MODEL_SHADER_UNIFORMS.highlight.color},
    baseHighlightOpacity
  );

  float highlightOpacity = clamp(${MODEL_SHADER_UNIFORMS.selection.opacity}, 0.0, 1.0);
  material.diffuse = mix(
    highlightedDiffuse,
    vec3(0.0),
    highlightOpacity
  );
  material.emissive = mix(
    highlightedEmissive,
    ${MODEL_SHADER_UNIFORMS.selection.color},
    highlightOpacity
  );

  float modelShaderFlashOpacity = clamp(${MODEL_SHADER_UNIFORMS.flash.opacity}, 0.0, 1.0);
  material.diffuse = mix(
    material.diffuse,
    vec3(0.0),
    modelShaderFlashOpacity
  );
  material.emissive = mix(
    material.emissive,
    ${MODEL_SHADER_UNIFORMS.flash.color},
    modelShaderFlashOpacity
  );
}
`,
  });
  MODEL_SHADER_INSTANCES.add(shader);
  MODEL_SHADER_UNIFORM_VALUES.selection.set(shader, {
    color: cloneColor(color),
    opacity: initialOpacity,
  });
  MODEL_SHADER_UNIFORM_VALUES.highlight.set(shader, {
    color: cloneColor(color),
    opacity: 0,
  });
  MODEL_SHADER_UNIFORM_VALUES.flash.set(shader, {
    color: cloneColor(color),
    opacity: 0,
  });
  return shader;
};

export const createSamplingShader = () =>
  createModelSamplingColorMixShader({
    color: MODEL_SHADER_DEFAULTS.sampling.color,
    opacity: 0,
  });

export const setSelectionUniforms = ({
  color = MODEL_SHADER_DEFAULTS.sampling.color,
  opacity = MODEL_SHADER_DEFAULTS.sampling.opacity,
  shader,
}: ModelShaderUniformOptions) => {
  shader.setUniform(
    MODEL_SHADER_UNIFORMS.selection.color,
    toModelHighlightColorUniform(color)
  );
  shader.setUniform(
    MODEL_SHADER_UNIFORMS.selection.opacity,
    clampOpacity(opacity)
  );
  MODEL_SHADER_UNIFORM_VALUES.selection.set(shader, {
    color: cloneColor(color),
    opacity: clampOpacity(opacity),
  });
};

export const setSamplingUniforms = setSelectionUniforms;

export const setHighlightUniforms = ({
  color = MODEL_SHADER_DEFAULTS.sampling.color,
  opacity = 0,
  shader,
}: ModelShaderUniformOptions) => {
  shader.setUniform(
    MODEL_SHADER_UNIFORMS.highlight.color,
    toModelHighlightColorUniform(color)
  );
  shader.setUniform(
    MODEL_SHADER_UNIFORMS.highlight.opacity,
    clampOpacity(opacity, 0)
  );
  MODEL_SHADER_UNIFORM_VALUES.highlight.set(shader, {
    color: cloneColor(color),
    opacity: clampOpacity(opacity, 0),
  });
};

export const setFlashUniforms = ({
  color = MODEL_SHADER_DEFAULTS.selection.color,
  opacity = 0,
  shader,
}: ModelShaderUniformOptions) => {
  shader.setUniform(
    MODEL_SHADER_UNIFORMS.flash.color,
    toModelHighlightColorUniform(color)
  );
  shader.setUniform(
    MODEL_SHADER_UNIFORMS.flash.opacity,
    clampOpacity(opacity, 0)
  );
  MODEL_SHADER_UNIFORM_VALUES.flash.set(shader, {
    color: cloneColor(color),
    opacity: clampOpacity(opacity, 0),
  });
};

export const normalizeFadeDuration = (fadeDurationMs: number | undefined) =>
  typeof fadeDurationMs === "number" &&
  Number.isFinite(fadeDurationMs) &&
  fadeDurationMs >= 0
    ? fadeDurationMs
    : MODEL_SHADER_DEFAULTS.selection.fade.durationMs;

export const normalizeFlashInDuration = (
  durationMs: number | undefined,
  fallback = MODEL_SHADER_DEFAULTS.selection.flash.selection.inDurationMs
) =>
  typeof durationMs === "number" &&
  Number.isFinite(durationMs) &&
  durationMs >= 0
    ? durationMs
    : fallback;

export const normalizeFlashOutDuration = (
  durationMs: number | undefined,
  fallback = MODEL_SHADER_DEFAULTS.selection.flash.selection.outDurationMs
) =>
  typeof durationMs === "number" &&
  Number.isFinite(durationMs) &&
  durationMs >= 0
    ? durationMs
    : fallback;

export const normalizeHoverClearDelay = (clearDelayMs: number | undefined) =>
  typeof clearDelayMs === "number" &&
  Number.isFinite(clearDelayMs) &&
  clearDelayMs >= 0
    ? clearDelayMs
    : MODEL_SHADER_DEFAULTS.selection.hover.clearDelayMs;

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
  const strength = edgeColor.alpha * clampEdgeOpacity(edgeOpacity);

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
  normalizeEdgeWidthPx(
    edgeWidthPx,
    MODEL_SHADER_DEFAULTS.selection.edge.widthPx
  ) *
  Math.pow(
    clampOpacity(highlightOpacity, 0),
    MODEL_SHADER_DEFAULTS.selection.silhouetteSizeFadeExponent
  );

export const readPrimitiveEdgeMode = (
  primitive: Model,
  fallback: ModelShaderEdgeMode
): ModelShaderEdgeMode => {
  const pickId = primitive.id as
    | { properties?: Record<string, unknown> }
    | undefined;
  const configuredMode =
    pickId?.properties?.[MODEL_SHADER_PRIMITIVE_PROPERTIES.edgeMode];
  return configuredMode === "silhouette" || configuredMode === "none"
    ? configuredMode
    : fallback;
};

export const modelShader = {
  defaults: MODEL_SHADER_DEFAULTS,
  clampOpacity,
  clampEdgeOpacity,
  normalizeEdgeWidthPx,
  is: isModelShader,
  readSelectionUniforms,
  readHighlightUniforms,
  readFlashUniforms,
  create: createModelShader,
  createSampling: createSamplingShader,
  setSelectionUniforms,
  setSamplingUniforms,
  setHighlightUniforms,
  setFlashUniforms,
  normalizeFadeDuration,
  normalizeFlashInDuration,
  normalizeFlashOutDuration,
  normalizeHoverClearDelay,
  interpolateNumber,
  clampEasedProgress,
  interpolateColor,
  createNonAccumulatingSilhouetteColor,
  calculateTaperedSilhouetteSize,
  readPrimitiveEdgeMode,
} as const;
