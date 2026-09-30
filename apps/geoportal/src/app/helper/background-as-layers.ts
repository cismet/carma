import type { MappingConfig, MappingConfigLayer } from "@carma-api";

/** a service a base map's layer string names, as far as a row can draw it */
type NamedLayerConfig = {
  type: string;
  url?: string;
  layers?: string;
  style?: string;
};

/** the part of a `layerMap` entry this needs */
type BaseMapEntry = { title: string; layers: string };

const LOG_PREFIX = "[BACKGROUND AS LAYERS]";

/** the row id of one named layer of a base map */
export const backgroundRowId = (name: string): string => `background:${name}`;

/**
 * One named layer of a base map as a layer row, or null for a service no row
 * can draw (plain xyz tiles). A WMS becomes `wmts`, the same as the catalog's
 * WMS layers, which the map requests as a tiled GetMap.
 */
const toRow = (
  name: string,
  service: NamedLayerConfig,
  title: string,
  opacity: number
): MappingConfigLayer | null => {
  const row = { id: backgroundRowId(name), title, visible: true, opacity };
  switch (service.type) {
    case "wms":
    case "wmts":
    case "wms-nt":
    case "wmts-nt":
      return service.url && service.layers
        ? {
            ...row,
            layerType: service.type.endsWith("-nt") ? "wmts-nt" : "wmts",
            props: { url: service.url, name: service.layers },
          }
        : null;
    case "vector":
      return service.style
        ? { ...row, layerType: "vector", props: { style: service.style } }
        : null;
    default:
      return null;
  }
};

/**
 * `config` with its base map as ordinary layers under the others and without
 * its `backgroundLayer`, see `carma.config.backgroundAsLayers`. The entry is looked up in this app's
 * `layerMap` first; a configuration saved elsewhere still carries the layer
 * string and title it was saved with.
 *
 * A base map that is switched off becomes no row, and `backgroundLayer` goes
 * all the same, also when it names no map (`{ visible: false }`): a scene
 * never switches off the display's own base map, which on the outlet is the
 * black that keeps the model dark.
 *
 * A row the layers have already (by id) stays where it is, so a configuration
 * that went through here once and was applied again does not get it twice.
 * Returns `config` itself when it names no base map, or when none of the base
 * map's parts can become a row.
 */
export const backgroundAsLayers = (
  config: MappingConfig,
  layerMap: Record<string, BaseMapEntry>,
  namedLayers: Record<string, NamedLayerConfig>
): MappingConfig => {
  const background = config.backgroundLayer;
  if (!background) {
    return config;
  }
  const withoutBaseMap: MappingConfig = { ...config };
  delete withoutBaseMap.backgroundLayer;
  // switched off, with or without naming a map: the display keeps its own
  if (background.visible === false) {
    return withoutBaseMap;
  }
  const entryId = background.selectedLayerId;
  if (typeof entryId !== "string") {
    return config;
  }

  const entry = layerMap[entryId] as BaseMapEntry | undefined;
  const spec =
    entry?.layers ??
    (typeof background.layers === "string" ? background.layers : "");
  const title =
    entry?.title ??
    (typeof background.title === "string" ? background.title : entryId);
  const parts = spec.split("|").filter((part) => part !== "");
  if (parts.length === 0) {
    console.warn(`${LOG_PREFIX} unknown base map "${entryId}"; left as it is.`);
    return config;
  }
  const opacity = background.opacity ?? 1;
  const own = new Set(config.layers.map(({ id }) => id));

  const rows: MappingConfigLayer[] = [];
  let resolved = 0;
  for (const part of parts) {
    const [name, percent] = part.split("@");
    const service = namedLayers[name] as NamedLayerConfig | undefined;
    const row = service
      ? toRow(
          name,
          service,
          parts.length > 1 ? `${title} (${name})` : title,
          (percent ? parseInt(percent, 10) / 100 : 1) * opacity
        )
      : null;
    if (!row) {
      console.warn(
        `${LOG_PREFIX} "${name}" of base map "${entryId}" cannot be a layer; left out.`
      );
      continue;
    }
    resolved++;
    if (!own.has(row.id)) {
      rows.push(row);
    }
  }

  if (resolved === 0) {
    return config;
  }
  return { ...withoutBaseMap, layers: [...rows, ...config.layers] };
};
