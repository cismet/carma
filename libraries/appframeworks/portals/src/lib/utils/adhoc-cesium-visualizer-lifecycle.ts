type OwnedAdhocVisualizerEntry = {
  featureKey: string;
  visualizer: { destroy: () => void };
};

export const removeInactiveAdhocVisualizers = <
  T extends OwnedAdhocVisualizerEntry
>(
  visualizers: Map<string, T>,
  activeFeatureKeys: ReadonlySet<string>
): ReadonlySet<string> => {
  const removedFeatureKeys = new Set<string>();

  for (const [visualizerKey, entry] of visualizers.entries()) {
    if (activeFeatureKeys.has(entry.featureKey)) {
      continue;
    }

    entry.visualizer.destroy();
    visualizers.delete(visualizerKey);
    removedFeatureKeys.add(entry.featureKey);
  }

  return removedFeatureKeys;
};
