export const convertLayerStringToLayers = (
  layerString: string,
  visible: boolean,
  mainOpacity?: number
): any => {
  const layers = layerString.split("|");
  return layers.map((layer) => {
    const [layerConfigName, opacity] = layer.split("@");
    const config = defaultLayerConfig.namedLayers?.[layerConfigName];
    return {
      ...config,
      visible,
      layerType: config?.type,
      opacity: ((Number(opacity) || 1) / 100) * (mainOpacity ?? 1),
    };
  });
};
