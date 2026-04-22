import type {
  AnnotationToolPlugin,
  AnnotationToolVisualModelContext,
} from "../registry/annotation-tool-plugin.types";
import type { RuntimeVisualModels } from "./visual-models";

type BuildAggregatedVisualModelsArgs =
  AnnotationToolVisualModelContext & {
    plugins: readonly AnnotationToolPlugin[];
  };

export const buildAggregatedVisualModels = ({
  plugins,
  ...context
}: BuildAggregatedVisualModelsArgs): RuntimeVisualModels => {
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
