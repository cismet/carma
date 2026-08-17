import { useEffect, useRef } from "react";
import { isEqual } from "lodash";

import { parseToMapLayer } from "@carma-mapping/utils";

import type {
  ActiveLayers,
  BackgroundLayer,
  Item,
  Layer,
  LayerProps,
  VectorStyleProps,
} from "../lib/contracts/carma-layers.d";
import { normalizeObject } from "../helper/layerHelper";

type ActiveLayerEntry = Layer | BackgroundLayer;
type ActiveLayerProps = Partial<LayerProps & VectorStyleProps>;

const getProps = (layer: ActiveLayerEntry): ActiveLayerProps =>
  (layer.props ?? {}) as ActiveLayerProps;

/**
 * Fields the app owns at runtime. A catalog item cannot produce them, so a
 * re-parse would drop them; carrying them over also keeps the comparison below
 * meaningful (otherwise every layer with runtime state looks changed forever).
 */
const carryOverRuntimeState = (
  activeLayer: ActiveLayerEntry,
  parsedLayer: Layer
): Layer => ({
  ...parsedLayer,
  ...(activeLayer.group ? { group: activeLayer.group } : {}),
  ...(activeLayer.skipSelection
    ? { skipSelection: activeLayer.skipSelection }
    : {}),
  ...(activeLayer.filterState ? { filterState: activeLayer.filterState } : {}),
  ...(activeLayer.filterInfo ? { filterInfo: activeLayer.filterInfo } : {}),
  ...(activeLayer.dynamicStylingSelection !== undefined
    ? { dynamicStylingSelection: activeLayer.dynamicStylingSelection }
    : {}),
});

/** only real map layers are parseable; collections and workflows are not */
const isSyncableItem = (item: Item | undefined): item is Item =>
  !!item && (item.type === "layer" || item.type === "object");

const isSyncableActiveLayer = (layer: ActiveLayerEntry): boolean => {
  // the style of these carries a user selection that the catalog does not know
  if (layer.dynamicStyling) {
    return false;
  }
  // adhoc object layers get their props.style replaced with the resolved
  // feature data while they are added; re-parsing would reset it to the source
  if (layer.layerType === "vector" && layer.type === "object") {
    return false;
  }
  return true;
};

/** only a vector layer has a style whose metadata can be refetched */
const isRefreshableFromStyle = (layer: ActiveLayerEntry): boolean =>
  layer.layerType === "vector";

const isStyleUrl = (style: unknown): style is string =>
  typeof style === "string" &&
  (style.startsWith("http://") ||
    style.startsWith("https://") ||
    style.endsWith(".json"));

/**
 * A layer the catalog does not know (dropped in, renamed upstream, restored
 * from an old link) still has its style URL, which carries the layer metadata.
 * Turning the layer back into a catalog item lets the same parse fetch it.
 */
const toCatalogItem = (layer: Layer, styleUrl: string): Item => {
  const props = getProps(layer);
  return {
    ...(layer.other ?? {}),
    id: layer.id,
    title: layer.title,
    description: layer.description ?? "",
    type: layer.type ?? "layer",
    layerType: layer.layerType,
    queryable: layer.queryable,
    minZoom: props.minZoom,
    maxZoom: props.maxZoom,
    vectorStyle: styleUrl,
    tools: layer.tools,
    // the parse reads the raw capabilities shapes, the layer keeps the parsed
    // ones; feeding them back keeps legend and metadata links intact
    props: {
      url: layer.other?.url,
      Style: props.legend ? [{ LegendURL: props.legend }] : undefined,
      MetadataURL: props.metaData,
    },
  } as unknown as Item;
};

/**
 * Merge instead of replace: the item rebuilt from the layer itself is thinner
 * than a catalog item, so everything the parse did not produce keeps its
 * current value rather than being dropped.
 */
const mergeIntoActiveLayer = (
  activeLayer: ActiveLayerEntry,
  parsedLayer: Layer
): Layer => {
  const parsed = normalizeObject(parsedLayer) as Layer;
  return {
    ...activeLayer,
    ...parsed,
    props: { ...getProps(activeLayer), ...(parsed.props ?? {}) },
    other: { ...(activeLayer.other ?? {}), ...(parsed.other ?? {}) },
    layerInfo: {
      ...(activeLayer.layerInfo ?? {}),
      ...(parsed.layerInfo ?? {}),
    },
  } as Layer;
};

interface UseSyncActiveLayersProps {
  catalogItems: Map<string, Item>;
  activeLayers: ActiveLayers;
  updateActiveLayer?: (layer: Layer) => void;
  /** keeps the sync off while the catalog sources are still incomplete */
  enabled: boolean;
}

/**
 * Keeps the layers on the map in sync with their definition: whenever the
 * catalog definition of an active layer changes (capabilities refresh,
 * additional / sensor / object config, dropped config, discover item), the
 * layer is rebuilt through the same `parseToMapLayer` the add-to-map path uses
 * and handed to the host. Layers the catalog does not carry are refreshed from
 * their own vector style instead. So a layer picks up a new style, zoom range
 * or config without having to be removed and added again.
 */
export const useSyncActiveLayers = ({
  catalogItems,
  activeLayers,
  updateActiveLayer,
  enabled,
}: UseSyncActiveLayersProps) => {
  // the catalog item each layer was last built from; an unchanged item needs no
  // work, which keeps this effect cheap on unrelated active layer changes
  const syncedItemsRef = useRef(new Map<string, Item>());
  // layers refreshed from their own style; their source cannot signal a change,
  // so this runs once per layer instead
  const refreshedFromStyleRef = useRef(new Set<string>());
  // a parse in flight must survive a re-run of the effect (the host callback is
  // rarely identity-stable), so only unmounting drops its result
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const syncedItems = syncedItemsRef.current;
    const refreshedFromStyle = refreshedFromStyleRef.current;

    // a layer that left the map forgets its record, so a re-add syncs again
    const activeIds = new Set(activeLayers.map((layer) => layer.id));
    syncedItems.forEach((_, id) => {
      if (!activeIds.has(id)) {
        syncedItems.delete(id);
      }
    });
    refreshedFromStyle.forEach((id) => {
      if (!activeIds.has(id)) {
        refreshedFromStyle.delete(id);
      }
    });

    const applyParsedLayer = async (
      activeLayer: ActiveLayerEntry,
      item: Item,
      merge: boolean
    ) => {
      let parsedLayer: Layer;
      try {
        parsedLayer = await parseToMapLayer(
          item,
          // a layer added as WMS stays WMS, even when the item offers a vector
          // style; only the vector layers follow the style
          activeLayer.layerType !== "vector",
          activeLayer.visible,
          activeLayer.opacity
        );
      } catch (error) {
        // let a later run try again with the same source
        syncedItems.delete(activeLayer.id);
        refreshedFromStyle.delete(activeLayer.id);
        console.warn(
          `[CATALOG SYNC] could not rebuild active layer ${item.id}`,
          error
        );
        return;
      }
      if (!mountedRef.current) {
        return;
      }
      const updatedLayer = merge
        ? mergeIntoActiveLayer(activeLayer, parsedLayer)
        : carryOverRuntimeState(activeLayer, parsedLayer);
      if (
        isEqual(normalizeObject(activeLayer), normalizeObject(updatedLayer))
      ) {
        return;
      }
      updateActiveLayer?.(updatedLayer);
    };

    activeLayers.forEach((activeLayer) => {
      if (!isSyncableActiveLayer(activeLayer)) {
        return;
      }

      const item = catalogItems.get(activeLayer.id);
      if (isSyncableItem(item)) {
        if (isEqual(syncedItems.get(activeLayer.id), item)) {
          return;
        }
        syncedItems.set(activeLayer.id, item);
        void applyParsedLayer(activeLayer, item, false);
        return;
      }

      // not in the catalog: the style URL is the only definition left
      const styleUrl = getProps(activeLayer).style;
      if (
        isRefreshableFromStyle(activeLayer) &&
        isStyleUrl(styleUrl) &&
        !refreshedFromStyle.has(activeLayer.id)
      ) {
        refreshedFromStyle.add(activeLayer.id);
        void applyParsedLayer(
          activeLayer,
          toCatalogItem(activeLayer as Layer, styleUrl),
          true
        );
      }
    });
  }, [catalogItems, activeLayers, updateActiveLayer, enabled]);
};
