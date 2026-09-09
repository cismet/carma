import type { Item, ToolEntry } from "../lib/contracts/carma-layers.d";
import type {
  AdditionalLayerEntry,
  AdditionalLayerRef,
} from "../config/layerCatalogConfig";

/** the subcategory a vector style belongs to until something says otherwise */
export const CUSTOM_CATEGORY = {
  id: "custom",
  Title: "Externe Dienste",
} as const;

/** one configured layer after normalization: what it points at, plus its tools */
export type ConfiguredLayerRef = {
  /** style url or catalog item id */
  ref: string;
  /** tools the config adds, on top of the ones the layer declares itself */
  tools?: ToolEntry[];
};

/** a configured group after normalization, its members still unresolved */
export type ConfiguredLayerRefGroup = {
  id: string;
  Title: string;
  refs: ConfiguredLayerRef[];
};

/**
 * A configured group with its vector styles turned into catalog items; the
 * remaining entries name catalog layers, resolved against the built catalog
 * (resolveConfiguredGroups).
 */
export type ConfiguredLayerGroup = {
  id: string;
  Title: string;
  entries: (Item | ConfiguredLayerRef)[];
};

/** a configured layer given as a style url, everything else is a catalog id */
export const isVectorStyleUrl = (ref: string): boolean =>
  /^https?:\/\//i.test(ref) && ref.endsWith(".json");

const slugify = (title: string): string =>
  title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/** "…/projection_mapping/wupper.style.json" -> "wupper" */
const titleFromUrl = (url: string): string => {
  const file = url.split("/").pop() ?? url;
  return file.replace(/\.style\.json$/i, "").replace(/\.json$/i, "");
};

const toRef = (ref: AdditionalLayerRef): ConfiguredLayerRef =>
  typeof ref === "string" ? { ref } : { ref: ref.layer, tools: ref.tools };

/** the tools of both sides, the configured ones after the declared ones */
const mergeTools = (
  declared: ToolEntry[] | undefined,
  added: ToolEntry[] | undefined
): ToolEntry[] | undefined =>
  declared || added ? [...(declared ?? []), ...(added ?? [])] : undefined;

type VectorStyleMetadata = {
  metadata?: {
    carmaConf?: {
      tools?: ToolEntry[];
      layerInfo?: Partial<Item> & { keywords?: string[] };
    };
  };
};

/**
 * The catalog item for a vector style url, the same shape a dropped style url
 * produces (useHandleDrop): the style stays a url in the keywords and whatever
 * the style declares under `metadata.carmaConf.layerInfo` overrides the
 * defaults derived from the url. Tools of the style and tools of the config are
 * carried together, because the item's own tools replace the style's ones when
 * the layer is parsed (parseToMapLayer).
 */
export const buildVectorStyleItem = (
  url: string,
  style?: unknown,
  overrides: Partial<Item> = {}
): Item => {
  const base = {
    description: "",
    id: `custom:${url}`,
    layerType: "vector",
    title: titleFromUrl(url),
    serviceName: CUSTOM_CATEGORY.id,
    type: "layer",
    keywords: [`carmaConf://vectorStyle:${url}`],
    path: CUSTOM_CATEGORY.Title,
    ...overrides,
  } as unknown as Item;

  const carmaConf = (style as VectorStyleMetadata | undefined)?.metadata
    ?.carmaConf;
  const layerInfo = carmaConf?.layerInfo;
  const tools = mergeTools(carmaConf?.tools, overrides.tools);
  if (!layerInfo) {
    return tools ? ({ ...base, tools } as Item) : base;
  }
  return {
    ...base,
    ...layerInfo,
    // the style url must survive whatever the style itself declares
    keywords: [...(base.keywords ?? []), ...(layerInfo.keywords ?? [])],
    // and so must the group the entry was configured in
    ...overrides,
    ...(tools ? { tools } : {}),
  } as Item;
};

/** a catalog layer with the tools its configuration adds */
export const withConfiguredTools = (item: Item, tools?: ToolEntry[]): Item => {
  const merged = mergeTools(item.tools, tools);
  return merged ? ({ ...item, tools: merged } as Item) : item;
};

/**
 * The configured entries as groups, entries sharing an id folded into one.
 * Every entry names its category: a configured layer dropped into a category
 * of delivered layers is not findable as one.
 */
export const normalizeAdditionalLayers = (
  entries: AdditionalLayerEntry[] = []
): ConfiguredLayerRefGroup[] => {
  const groups: ConfiguredLayerRefGroup[] = [];

  entries.forEach((entry) => {
    const id = entry.id ?? (slugify(entry.Title) || CUSTOM_CATEGORY.id);
    const refs = entry.layers.map(toRef);
    const existing = groups.find((group) => group.id === id);
    if (existing) {
      existing.refs.push(...refs);
    } else {
      groups.push({ id, Title: entry.Title, refs });
    }
  });

  return groups;
};

/** ids of every configured layer, for the catalog filter exemptions */
export const getConfiguredItemIds = (
  groups: ConfiguredLayerGroup[]
): Set<string> => {
  const ids = new Set<string>();
  groups.forEach((group) =>
    group.entries.forEach((entry) =>
      ids.add("ref" in entry ? entry.ref : entry.id)
    )
  );
  return ids;
};
