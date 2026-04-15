import type {
  AnnotationToolPlugin,
  AnnotationToolVisualModelContext,
} from "../tools/annotation-tool-plugin.types";
import type { RuntimeVisualModels } from "./runtime-visual-models";

type BuildAggregatedRuntimeVisualModelsArgs =
  AnnotationToolVisualModelContext & {
    plugins: readonly AnnotationToolPlugin[];
  };

export const buildAggregatedRuntimeVisualModels = ({
  plugins,
  ...context
}: BuildAggregatedRuntimeVisualModelsArgs): RuntimeVisualModels => {
  const pluginVisualModels = plugins
    .map((plugin) => plugin.visualModels?.build(context) ?? null)
    .filter((layer): layer is RuntimeVisualModels => Boolean(layer));

  return {
    points: pluginVisualModels.flatMap((layer) => layer.points ?? []),
    edges: pluginVisualModels.flatMap((layer) => layer.edges ?? []),
    polygonFills: pluginVisualModels.flatMap(
      (layer) => layer.polygonFills ?? []
    ),
    pointLabels: pluginVisualModels.flatMap((layer) => layer.pointLabels ?? []),
  };
};
