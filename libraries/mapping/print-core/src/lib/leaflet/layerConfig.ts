import { namedLayers } from "@carma-mapping/utils";

export const convertLayerStringToLayers = (
  layerString: string,
  visible: boolean,
  mainOpacity?: number
): any => {
  const layers = layerString.split("|");
  return layers.map((layer) => {
    const [layerConfigName, opacity] = layer.split("@");
    const config = namedLayers[layerConfigName as keyof typeof namedLayers];
    return {
      ...config,
      visible,
      layerType: config.type,
      opacity: (opacity ? parseInt(opacity, 10) / 100 : 1) * (mainOpacity ?? 1),
    };
  });
};
