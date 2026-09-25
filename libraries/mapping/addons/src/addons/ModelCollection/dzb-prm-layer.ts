import type { Layer } from "@carma-mapping/layers";

export const MODEL_COLLECTION_LAYER_ID = "dzb-prm-buga";

export const loadDzbPrmLayer = async (
  manifestUrl: string,
  baseHref: string
): Promise<Layer> => {
  const layerUrl = new URL("buga.layer.json", new URL(manifestUrl, baseHref));
  const response = await fetch(layerUrl);
  if (!response.ok) throw new Error(`BuGa layer HTTP ${response.status}`);
  const layer = (await response.json()) as Layer;
  if (layer.id !== MODEL_COLLECTION_LAYER_ID || layer.type !== "object") {
    throw new Error("Invalid BuGa ad-hoc layer JSON");
  }
  return layer;
};
