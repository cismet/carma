import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FeatureFlagConfig } from "@carma-providers/feature-flag";
import type { Item, ToolEntry } from "../lib/contracts/carma-layers.d";
import type {
  AdditionalCategoryLayer,
  AdditionalLayerCategory,
} from "../helper/buildCatalog";
import { CUSTOM_CATEGORY } from "../helper/buildCatalog";
import type {
  AdditionalEntryLayer,
  AdditionalLayer,
  AdditionalLayerEntry,
  AdditionalLayerReference,
  AdditionalStyleLayer,
} from "../config/layerCatalogConfig";
import {
  buildVectorStyleItem,
  loadVectorStyle,
  styleUrlTitle,
} from "../helper/vectorStyleItem";
import type { CarmaVectorStyle } from "../helper/vectorStyleItem";
import {
  ADDITIONAL_LAYERS_QUERY_KEY,
  PERSISTED_QUERY_GC_TIME,
} from "../config/CatalogQueryProvider";

/** styles by url; `null` marks one that could not be loaded */
type LoadedStyles = Record<string, CarmaVectorStyle | null>;

const EMPTY_CATEGORIES: AdditionalLayerCategory[] = [];
const EMPTY_IDS: Set<string> = new Set();
const EMPTY_STYLES: LoadedStyles = {};

/** a bare string is a style url when it looks like one, else an item id */
const isStyleUrl = (value: string): boolean =>
  /^https?:\/\//i.test(value) || value.toLowerCase().endsWith(".json");

const isStyleLayer = (
  layer: AdditionalLayer | AdditionalEntryLayer
): layer is string | AdditionalStyleLayer =>
  typeof layer === "string" ? isStyleUrl(layer) : "styleUrl" in layer;

const isReference = (
  layer: AdditionalLayer | AdditionalEntryLayer
): layer is string | AdditionalLayerReference =>
  typeof layer === "string" ? !isStyleUrl(layer) : "layerId" in layer;

const toStyleLayer = (
  layer: string | AdditionalStyleLayer
): AdditionalStyleLayer =>
  typeof layer === "string" ? { styleUrl: layer } : layer;

const toReferenceId = (layer: string | AdditionalLayerReference): string =>
  typeof layer === "string" ? layer : layer.layerId;

const toReferenceTools = (
  layer: string | AdditionalLayerReference
): ToolEntry[] | undefined =>
  typeof layer === "string" ? undefined : layer.tools;

/** the subcategory a titled entry forms, so it does not depend on a serviceName */
const titleToServiceName = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Layers that rewrite the service structure are applied app-wide before the
 * capabilities are read, so honouring them per config would mean rebuilding the
 * services for it.
 */
const isStructuralLayer = (layer: Item): boolean => {
  if (layer.replaceId || layer.mergeId) {
    console.warn(
      "Additional layers ignore a layer with mergeId/replaceId:",
      layer.id ?? layer.mergeId ?? layer.replaceId
    );
    return true;
  }
  return false;
};

const collectStyleUrls = (additionalLayers: AdditionalLayer[]): string[] => {
  const urls = new Set<string>();
  const collect = (layer: AdditionalLayer | AdditionalEntryLayer) => {
    if (isStyleLayer(layer)) {
      urls.add(toStyleLayer(layer).styleUrl);
    }
  };
  additionalLayers.forEach((additionalLayer) => {
    if (isEntry(additionalLayer)) {
      additionalLayer.layers.forEach(collect);
    } else {
      collect(additionalLayer);
    }
  });
  return [...urls];
};

const isEntry = (
  additionalLayer: AdditionalLayer
): additionalLayer is AdditionalLayerEntry =>
  typeof additionalLayer !== "string" && "layers" in additionalLayer;

const loadStyles = async (
  urls: string[],
  vectorTileServerUrl: string
): Promise<LoadedStyles> => {
  const loaded = await Promise.all(
    urls.map(async (url) => {
      try {
        return [url, await loadVectorStyle(url, vectorTileServerUrl)] as const;
      } catch (error) {
        console.warn(
          "Error loading the style of an additional layer:",
          url,
          error
        );
        return [url, null] as const;
      }
    })
  );
  return Object.fromEntries(loaded);
};

const styleLayerToItem = (
  styleLayer: AdditionalStyleLayer,
  style: CarmaVectorStyle | null,
  path: string
): Item => {
  const { item } = buildVectorStyleItem({
    styleRef: styleLayer.styleUrl,
    style,
    id: styleLayer.id ?? `custom:${styleLayer.styleUrl}`,
    fallbackTitle: styleUrlTitle(styleLayer.styleUrl),
    path,
    type: styleLayer.type,
    tools: styleLayer.tools,
  });
  return item;
};

/**
 * Resolves what the config can state on its own: style urls against the loaded
 * styles, everything else as written. A style that has not been loaded yet is
 * left out rather than shown under its url, which the next render fills in;
 * item ids stay references for the catalog to resolve.
 */
const resolveLayers = (
  layers: AdditionalEntryLayer[],
  styles: LoadedStyles,
  path: string
): AdditionalCategoryLayer[] =>
  layers
    .map((layer): AdditionalCategoryLayer | null => {
      if (isReference(layer)) {
        const tools = toReferenceTools(layer);
        return {
          refId: toReferenceId(layer),
          path,
          ...(tools?.length ? { tools } : {}),
        };
      }
      if (!isStyleLayer(layer)) {
        return isStructuralLayer(layer) ? null : layer;
      }
      const styleLayer = toStyleLayer(layer);
      return styleLayer.styleUrl in styles
        ? styleLayerToItem(styleLayer, styles[styleLayer.styleUrl], path)
        : null;
    })
    .filter((layer): layer is AdditionalCategoryLayer => layer !== null);

const toCategory = (
  entry: AdditionalLayerEntry,
  styles: LoadedStyles
): AdditionalLayerCategory | null => {
  // a titled entry forms its own subcategory, so its layers are filed there;
  // a title-less one contributes to the category its layers name
  const path = entry.Title ?? CUSTOM_CATEGORY.Title;
  const layers = resolveLayers(entry.layers, styles, path);
  if (layers.length === 0) {
    return null;
  }
  return {
    ...entry,
    serviceName:
      entry.serviceName ??
      (entry.Title ? titleToServiceName(entry.Title) : undefined),
    layers,
  };
};

export const additionalLayersToCategories = (
  additionalLayers: AdditionalLayer[],
  styles: LoadedStyles
): AdditionalLayerCategory[] =>
  additionalLayers
    .map((additionalLayer) =>
      isEntry(additionalLayer)
        ? toCategory(additionalLayer, styles)
        : toCategory({ layers: [additionalLayer] }, styles)
    )
    .filter((category): category is AdditionalLayerCategory => category !== null);

const collectItemIds = (categories: AdditionalLayerCategory[]): Set<string> =>
  new Set(
    categories.flatMap((category) =>
      category.layers.map((layer) =>
        "refId" in layer ? layer.refId : layer.id
      )
    )
  );

interface UseAdditionalLayersProps {
  additionalLayers?: AdditionalLayer[];
  vectorTileServerUrl: string;
  setFeatureFlags?: (flags: FeatureFlagConfig) => void;
}

/**
 * The additional layers of the active catalog config, as categories the catalog
 * derivation files into its subcategories. Style urls, wherever they stand in
 * for a layer, are resolved against their style here, which is where their
 * display data lives; ids of existing items stay references, since only the
 * assembled catalog knows them.
 */
export const useAdditionalLayers = ({
  additionalLayers,
  vectorTileServerUrl,
  setFeatureFlags,
}: UseAdditionalLayersProps) => {
  const styleUrls = useMemo(
    () => (additionalLayers?.length ? collectStyleUrls(additionalLayers) : []),
    [additionalLayers]
  );

  // one query for the whole config: it is a handful of styles from a static
  // config, and a single result keeps the derived categories referentially
  // stable
  const { data: styles } = useQuery({
    queryKey: [ADDITIONAL_LAYERS_QUERY_KEY, styleUrls.join(" ")],
    queryFn: () => loadStyles(styleUrls, vectorTileServerUrl),
    enabled: styleUrls.length > 0,
    gcTime: PERSISTED_QUERY_GC_TIME,
  });

  const categories = useMemo(
    () =>
      additionalLayers?.length
        ? additionalLayersToCategories(additionalLayers, styles ?? EMPTY_STYLES)
        : EMPTY_CATEGORIES,
    [additionalLayers, styles]
  );

  // register the feature flags of configured layers, as the fetched configs do;
  // without it a flagged layer would be filtered out by a flag nothing knows
  useEffect(() => {
    categories.forEach((category) =>
      category.layers.forEach((layer) => {
        const ff = "refId" in layer ? undefined : (layer.ff as string);
        if (ff) {
          setFeatureFlags?.({ [ff]: { default: false, alias: ff } });
        }
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  const itemIds = useMemo(
    () => (categories.length === 0 ? EMPTY_IDS : collectItemIds(categories)),
    [categories]
  );

  return { categories, itemIds };
};

export default useAdditionalLayers;
