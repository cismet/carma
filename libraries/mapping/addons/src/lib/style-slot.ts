import { useEffect, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

/**
 * Where in a style an addon draws.
 *
 * An addon draws with layers of its own (a custom layer, a raster it adds at
 * runtime), which the stack's style composition knows nothing about: it would
 * leave them wherever they were first added, usually on top of everything. A
 * style that launches such an addon therefore marks the spot with a placeholder
 * layer, and the addon puts its layers directly under it:
 *
 * ```json
 * { "id": "flow", "type": "background", "layout": { "visibility": "none" },
 *   "metadata": { "carmaConf": { "slot": "flowField" } } }
 * ```
 *
 * The placeholder is a valid spec layer that draws nothing, so the composition
 * treats it like any other layer of the style: it moves with the style when the
 * stack is reordered, it is gone while the style is hidden, and it carries the
 * stack layer's id in `metadata["carma-layer-id"]`, written by the style
 * builder.
 *
 * The layer bar's opacity is read from the placeholder's `background-opacity`,
 * which the style builder bakes from the slider. The builder writes it to
 * `metadata["layer-opacity"]` as well, but MapLibre's style diff skips metadata,
 * so on the map that copy keeps the value the layer was added with; it is only
 * the fallback for a placeholder that is not a background layer.
 *
 * Only `getLayersOrder`, `getLayer` and `getPaintProperty` are read, so a
 * lookup does not serialise the whole style.
 */
export type StyleSlot = {
  /** the placeholder's id on the map, as the style builder prefixed it */
  placeholderId: string;
  /** the layer bar's opacity of the style the placeholder belongs to */
  opacity: number;
};

type SlotReader = Pick<
  MaplibreMap,
  "getLayersOrder" | "getLayer" | "getPaintProperty"
>;
type SlotWriter = SlotReader & Pick<MaplibreMap, "moveLayer">;

type LayerMetadata = {
  carmaConf?: { slot?: unknown };
  "layer-opacity"?: unknown;
  "carma-layer-id"?: unknown;
};

const metadataOf = (map: SlotReader, id: string): LayerMetadata | undefined => {
  const metadata = map.getLayer(id)?.metadata;
  return metadata && typeof metadata === "object"
    ? (metadata as LayerMetadata)
    : undefined;
};

/** the slider's opacity as it stands on the map, see `StyleSlot` above */
const slotOpacity = (
  map: SlotReader,
  id: string,
  metadata: LayerMetadata
): number => {
  if (map.getLayer(id)?.type === "background") {
    const painted: unknown = map.getPaintProperty(id, "background-opacity");
    if (typeof painted === "number") return painted;
  }
  const carried = metadata["layer-opacity"];
  return typeof carried === "number" ? carried : 1;
};

/** the map's layer order, or none while there is no style to ask */
const layerOrder = (map: SlotReader): string[] => {
  try {
    return map.getLayersOrder();
  } catch {
    return [];
  }
};

/**
 * The placeholder of `slot` on the map, the topmost one if several styles
 * declare it. `carmaLayerId` restricts the search to the style of that stack
 * layer, so an addon launched by one style does not settle into another.
 */
export const findStyleSlot = (
  map: SlotReader,
  slot: string,
  carmaLayerId?: string
): StyleSlot | undefined => {
  let found: StyleSlot | undefined;
  for (const id of layerOrder(map)) {
    const metadata = metadataOf(map, id);
    if (metadata?.carmaConf?.slot !== slot) continue;
    if (carmaLayerId && metadata["carma-layer-id"] !== carmaLayerId) continue;
    found = { placeholderId: id, opacity: slotOpacity(map, id, metadata) };
  }
  return found;
};

/**
 * Put `layerIds`, in this order, directly under the placeholder. Layers not on
 * the map are skipped.
 *
 * A `moveLayer` fires `styledata`, which is what callers re-place on, so this
 * only moves when the order is not already right; that is what ends the loop.
 *
 * Without a placeholder nothing moves: the layers stay where they were added.
 * Moving them to the top instead would fight every other layer that keeps
 * itself last on `styledata`, e.g. cage's occlusion mask.
 */
export const placeAtSlot = (
  map: SlotWriter,
  layerIds: readonly string[],
  placeholderId: string | undefined
): void => {
  if (!placeholderId || !map.getLayer(placeholderId)) return;
  const ids = layerIds.filter((id) => map.getLayer(id));
  if (ids.length === 0) return;
  const order = layerOrder(map);
  const at = order.indexOf(placeholderId);
  const inPlace =
    at >= ids.length && ids.every((id, i) => order[at - ids.length + i] === id);
  if (inPlace) return;
  for (const id of ids) {
    map.moveLayer(id, placeholderId);
  }
};

const sameSlot = (a?: StyleSlot, b?: StyleSlot): boolean =>
  a?.placeholderId === b?.placeholderId && a?.opacity === b?.opacity;

/**
 * The placeholder of `slot`, followed across style rebuilds. Read on
 * `styledata`, which every composition and every reorder fires; an equal read
 * keeps the previous object, so a caller's effects only run on a change.
 */
export const useStyleSlot = (
  map: MaplibreMap | null | undefined,
  slot: string,
  carmaLayerId?: string
): StyleSlot | undefined => {
  const [found, setFound] = useState<StyleSlot | undefined>(undefined);

  useEffect(() => {
    if (!map) {
      setFound(undefined);
      return;
    }
    const read = () => {
      const next = findStyleSlot(map, slot, carmaLayerId);
      setFound((previous) => (sameSlot(previous, next) ? previous : next));
    };
    read();
    map.on("styledata", read);
    return () => {
      map.off("styledata", read);
    };
  }, [map, slot, carmaLayerId]);

  return found;
};
