import type { Item, ToolEntry } from "../lib/contracts/carma-layers.d";
import { CUSTOM_CATEGORY } from "./buildCatalog";

/**
 * The part of a maplibre style this module reads. Only `metadata.carmaConf`
 * matters here: the style itself is never interpreted, it is handed to
 * `parseToMapLayer` by url (or serialized) when the layer is activated.
 */
export interface CarmaVectorStyle {
  metadata?: {
    carmaConf?: {
      instant?: boolean;
      /** open-ended: whatever a style states about its item, item fields win */
      layerInfo?: { keywords?: string[]; tools?: ToolEntry[] } & Record<
        string,
        unknown
      >;
    };
  };
}

const VECTOR_STYLE_KEYWORD = "carmaConf://vectorStyle:";

/**
 * Resolves the `__SERVER_URL__` placeholder styles use instead of a hardcoded
 * tile server, so the same style file works against every deployment.
 */
export const substituteServerUrl = (
  input: string,
  vectorTileServerUrl: string
): string =>
  input
    .replaceAll("__SERVER_URL__", vectorTileServerUrl)
    .replaceAll("__server_url__", vectorTileServerUrl);

export const parseVectorStyle = (
  raw: string,
  vectorTileServerUrl: string
): CarmaVectorStyle =>
  JSON.parse(substituteServerUrl(raw, vectorTileServerUrl));

export const loadVectorStyle = async (
  url: string,
  vectorTileServerUrl: string
): Promise<CarmaVectorStyle> => {
  const response = await fetch(url);
  return parseVectorStyle(await response.text(), vectorTileServerUrl);
};

/** Fallback title for a style without a `layerInfo.title`: the url sans ".json". */
export const styleUrlTitle = (url: string): string =>
  url.replace(/\.json$/i, "");

export interface VectorStyleItemProps {
  /** what the item points at: the style url, or the serialized style itself */
  styleRef: string;
  /** the parsed style, when it is already at hand; its metadata fills the item */
  style?: CarmaVectorStyle | null;
  id: string;
  /** used while the style carries no `layerInfo.title` */
  fallbackTitle: string;
  /** subcategory title, defaults to the "Externe Dienste" category */
  path?: string;
  /** "object" makes it a 3d twin item, as a *.twin.json does */
  type?: "layer" | "object";
  /** addons the caller declares for this layer, added to the style's own */
  tools?: ToolEntry[];
}

/**
 * A catalog item for a vector style, with everything displayable taken from the
 * style's `metadata.carmaConf.layerInfo`, so no definition has to be repeated
 * outside the style. Shared by the drop handler and the configured catalog
 * additional layers, so the caller decides id, title fallback and placement.
 *
 * `instant` reports the style's own `carmaConf.instant`; what that means for the
 * map is up to the caller.
 */
export const buildVectorStyleItem = ({
  styleRef,
  style,
  id,
  fallbackTitle,
  path = CUSTOM_CATEGORY.Title,
  type = "layer",
  tools,
}: VectorStyleItemProps): { item: Item; instant: boolean } => {
  const item = {
    description: "",
    id,
    layerType: "vector",
    title: fallbackTitle,
    serviceName: CUSTOM_CATEGORY.id,
    type,
    keywords: [`${VECTOR_STYLE_KEYWORD}${styleRef}`],
    path,
    ...(tools?.length ? { tools } : {}),
  } as unknown as Item;

  const carmaConf = style?.metadata?.carmaConf;
  if (!carmaConf) {
    return { item, instant: false };
  }

  const layerInfo = carmaConf.layerInfo;
  const mergedTools = [...(tools ?? []), ...(layerInfo?.tools ?? [])];
  return {
    item: {
      ...item,
      ...layerInfo,
      keywords: [...(item.keywords ?? []), ...(layerInfo?.keywords ?? [])],
      ...(mergedTools.length ? { tools: mergedTools } : {}),
    } as unknown as Item,
    instant: carmaConf.instant ?? false,
  };
};
