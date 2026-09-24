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
import { CUSTOM_CATEGORY } from "../helper/buildCatalog";
import {
  buildVectorStyleItem,
  loadVectorStyle,
  styleUrlTitle,
} from "../helper/vectorStyleItem";

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
 * A layer that entered through a dropped style url. Its item was built from
 * that style alone, so the style is its whole definition.
 */
const isDroppedStyleLayer = (layer: ActiveLayerEntry): boolean =>
  layer.other?.serviceName === CUSTOM_CATEGORY.id;

/**
 * The item a drop of this url builds today. A dropped layer carries the style's
 * layerInfo of the day it was dropped as its own keywords, and item keywords
 * win over the style's in the parse, so feeding those back (toCatalogItem)
 * would keep the old info box mapping, title and description forever.
 */
const rebuildDroppedItem = async (
  layer: ActiveLayerEntry,
  styleUrl: string,
  vectorTileServerUrl: string
): Promise<Item> => {
  const style = await loadVectorStyle(styleUrl, vectorTileServerUrl);
  return buildVectorStyleItem({
    styleRef: styleUrl,
    style,
    id: layer.id,
    fallbackTitle: styleUrlTitle(styleUrl),
    ...(layer.other?.path ? { path: layer.other.path } : {}),
    type: layer.type === "object" ? "object" : "layer",
  }).item;
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

/**
 * The part of a layer that comes from its definition. A copy restored from a
 * saved collection or a share link carries the definition of the day it was
 * saved, so this is what tells it apart from the layer the sync built.
 */
const definitionFingerprint = (layer: ActiveLayerEntry): string =>
  JSON.stringify(
    normalizeObject({
      title: layer.title,
      description: layer.description,
      conf: layer.conf,
      layerInfo: layer.layerInfo,
    })
  );

type SyncRecord = {
  /** the catalog item the layer was built from; null for its own style */
  item: Item | null;
  /** definitions already seen on the map or produced for this source */
  fingerprints: Set<string>;
};

interface UseSyncActiveLayersProps {
  catalogItems: Map<string, Item>;
  activeLayers: ActiveLayers;
  updateActiveLayer?: (layer: Layer) => void;
  /** keeps the sync off while the catalog sources are still incomplete */
  enabled: boolean;
  /** resolves the server placeholder when a dropped style is refetched */
  vectorTileServerUrl: string;
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
  vectorTileServerUrl,
}: UseSyncActiveLayersProps) => {
  // per layer id: the source it was last built from and the definitions seen
  // for it. An unchanged source with a known definition needs no work, which
  // keeps this effect cheap on unrelated active layer changes. The definitions
  // matter too: a layer replaced under the same id by an old copy (a saved
  // collection, a share link) has an unchanged source but must be rebuilt.
  const recordsRef = useRef(new Map<string, SyncRecord>());
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

    const records = recordsRef.current;

    // a layer that left the map forgets its record, so a re-add syncs again
    const activeIds = new Set(activeLayers.map((layer) => layer.id));
    records.forEach((_, id) => {
      if (!activeIds.has(id)) {
        records.delete(id);
      }
    });

    /**
     * Whether the layer needs a rebuild from `item`, recording it as handled
     * when it does. The definition on the map is recorded before the parse, so
     * a re-run while it is in flight, or after a rebuild that changed nothing,
     * does not start another one.
     */
    const claim = (activeLayer: ActiveLayerEntry, item: Item | null) => {
      const fingerprint = definitionFingerprint(activeLayer);
      const record = records.get(activeLayer.id);
      const sameSource = !!record && isEqual(record.item, item);
      if (sameSource && record.fingerprints.has(fingerprint)) {
        return undefined;
      }
      const next: SyncRecord = sameSource
        ? record
        : { item, fingerprints: new Set() };
      next.fingerprints.add(fingerprint);
      records.set(activeLayer.id, next);
      return next;
    };

    const applyParsedLayer = async (
      activeLayer: ActiveLayerEntry,
      resolveItem: () => Item | Promise<Item>,
      merge: boolean,
      record: SyncRecord
    ) => {
      let parsedLayer: Layer;
      try {
        const item = await resolveItem();
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
        if (records.get(activeLayer.id) === record) {
          records.delete(activeLayer.id);
        }
        console.warn(
          `[CATALOG SYNC] could not rebuild active layer ${activeLayer.id}`,
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
      // known before the update lands, so the re-run it causes is a no-op
      record.fingerprints.add(definitionFingerprint(updatedLayer));
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
        const record = claim(activeLayer, item);
        if (record) {
          void applyParsedLayer(activeLayer, () => item, false, record);
        }
        return;
      }

      // not in the catalog: the style URL is the only definition left; it
      // cannot signal a change, so only an unseen definition is refreshed
      const styleUrl = getProps(activeLayer).style;
      if (!isRefreshableFromStyle(activeLayer) || !isStyleUrl(styleUrl)) {
        return;
      }
      const record = claim(activeLayer, null);
      if (!record) {
        return;
      }
      if (isDroppedStyleLayer(activeLayer)) {
        // built like a new drop of the url, so it replaces what the layer
        // froze of the style instead of merging over it
        void applyParsedLayer(
          activeLayer,
          () => rebuildDroppedItem(activeLayer, styleUrl, vectorTileServerUrl),
          false,
          record
        );
        return;
      }
      void applyParsedLayer(
        activeLayer,
        () => toCatalogItem(activeLayer as Layer, styleUrl),
        true,
        record
      );
    });
  }, [
    catalogItems,
    activeLayers,
    updateActiveLayer,
    enabled,
    vectorTileServerUrl,
  ]);
};
