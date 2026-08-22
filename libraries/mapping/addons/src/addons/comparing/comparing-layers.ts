import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { Store } from "redux";
import type { Map as MaplibreMap } from "maplibre-gl";

import type { LayerStackEntry } from "@carma-mapping/layers";
import { useMapLayers } from "@carma-mapping/engines/maplibre";

import { useAddonState } from "../../lib/AddonStateContext";
import { useComparingActions, type CompareAssignments } from "./comparing-actions";
import { groupLayers } from "./stage/roles";

/**
 * One assignable block in the control pane: what `roles.ts` groups by
 * `carmaLayerId`, carrying the title the layer bar shows for it.
 *
 * The titles cannot come from the map: a `LibreLayer` has a source url and a
 * layer name, never the human title, which lives in the host's layer stack. So
 * the control reads them from the host store and publishes them, and the pane
 * stays a plain consumer of the channel.
 */
/** the most panels the built modes split into: four is the 2x2 grid */
export const MAX_PANELS = 4;

export type CompareLayerEntry = {
  /** `carmaLayerId`, the key roles are assigned against */
  key: string;
  title: string;
  isBackground: boolean;
  /** whether the layer bar has this one switched on */
  visible: boolean;
};

type LayerStackState = {
  mapping?: {
    layers?: LayerStackEntry[];
    backgroundLayer?: { id?: string; title?: string; visible?: boolean };
  };
};

/** what the layer stack knows about one block */
type LayerMeta = { title: string; visible: boolean };

const collectMeta = (
  entries: LayerStackEntry[] | undefined,
  into: Map<string, LayerMeta>
) => {
  for (const entry of entries ?? []) {
    if (entry.id && entry.title) {
      into.set(entry.id, { title: entry.title, visible: entry.visible !== false });
    }
    // groups carry their members in `layers`
    const nested = (entry as { layers?: LayerStackEntry[] }).layers;
    if (nested) collectMeta(nested, into);
  }
  return into;
};

/**
 * Read through the injected store rather than `useSelector`, since libraries
 * must not depend on react-redux. Both snapshots return the stored references,
 * so unrelated actions do not re-render.
 */
const useLayerMeta = (store: Store) => {
  const layerStack = useSyncExternalStore(
    store.subscribe,
    () => (store.getState() as LayerStackState).mapping?.layers
  );
  const background = useSyncExternalStore(
    store.subscribe,
    () => (store.getState() as LayerStackState).mapping?.backgroundLayer
  );
  return useMemo(() => {
    const meta = collectMeta(layerStack, new Map<string, LayerMeta>());
    if (background?.id && background.title) {
      meta.set(background.id, {
        title: background.title,
        visible: background.visible !== false,
      });
    }
    return meta;
  }, [layerStack, background]);
};

/**
 * Publishes the assignable blocks while the comparison runs.
 *
 * The list is derived from the map's own layers, not from the store, so its
 * keys are exactly the keys a panel's content is filtered by; the store only
 * supplies the titles. Order is the map's draw order, bottom-most first, the
 * same as `groupLayers`.
 */
export const usePublishCompareLayers = (
  store: Store,
  libreMap: MaplibreMap | null,
  active: boolean
) => {
  const [, setEntries] = useAddonState("compareLayers");
  const layers = useMapLayers(libreMap);
  const meta = useLayerMeta(store);
  const {
    panelCount,
    suggestPanelCount,
    assignments,
    assignmentsPanelCount,
    setAssignments,
  } = useComparingActions();

  const entries = useMemo<CompareLayerEntry[]>(() => {
    if (!active) {
      return [];
    }
    const groups = groupLayers(layers);
    return groups.map((group, index) => ({
      key: group.key,
      title: meta.get(group.key)?.title ?? group.key,
      // the background expands into several named layers sharing its id and is
      // always the bottom block, so it is the first group and only that one
      isBackground: index === 0,
      visible: meta.get(group.key)?.visible ?? true,
    }));
  }, [active, layers, meta]);

  useEffect(() => {
    setEntries(entries);
  }, [entries, setEntries]);

  // Comparing four aerials means wanting four panels, so the layout starts as
  // the layers suggest: one panel per foreground block, within what the built
  // modes can split into. It stops following as soon as the user picks a count
  // or ticks a cell, since from then on the layout is theirs.
  useEffect(() => {
    if (!active || entries.length === 0) {
      return;
    }
    const foreground = entries.filter((entry) => !entry.isBackground).length;
    suggestPanelCount(Math.min(MAX_PANELS, Math.max(foreground, 2)));
  }, [active, entries, suggestPanelCount]);

  useEffect(() => {
    if (!active || entries.length === 0) {
      return;
    }
    // a changed panel count starts over: the old ticks were made about panels
    // that are not the ones on screen any more
    const previous =
      assignmentsPanelCount === panelCount ? assignments : undefined;
    const next = reconcileAssignments(entries, previous, panelCount);
    if (next !== assignments) {
      setAssignments(next, panelCount);
    }
  }, [
    active,
    assignments,
    assignmentsPanelCount,
    entries,
    panelCount,
    setAssignments,
  ]);
};

/** The blocks the pane offers, newest-on-top first, as the layer bar shows them. */
export const useCompareLayerEntries = (): CompareLayerEntry[] => {
  const [entries] = useAddonState("compareLayers");
  return useMemo(() => (entries ?? []).slice().reverse(), [entries]);
};

/**
 * The assignment to start from, stated over the draw order: the topmost blocks
 * go one to each panel, topmost to the last panel so the pane's list reads in
 * the panels' order, and everything below them is shown in all of them. Same
 * rule `deriveImplicitRoles` applies, which is what the comparison ran on
 * before the assignment was editable.
 */
const implicitPanelsFor = (
  indexFromTop: number,
  panelCount: number
): number[] =>
  indexFromTop < panelCount
    ? [panelCount - 1 - indexFromTop]
    : Array.from({ length: panelCount }, (_, panel) => panel);

/**
 * Keeps the assignment in step with the layers on the map: seeds it from the
 * implicit rule when the mode starts, gives a layer added while comparing every
 * panel so that adding it visibly does something, and drops keys whose layer is
 * gone. Returns the previous object unchanged when nothing moved, so it can run
 * on every entry change without looping.
 */
const reconcileAssignments = (
  entries: CompareLayerEntry[],
  previous: CompareAssignments | undefined,
  panelCount: number
): CompareAssignments => {
  const everyPanel = Array.from({ length: panelCount }, (_, panel) => panel);
  const next: CompareAssignments = {};
  let changed = false;

  // entries are in draw order, bottom first; the rule is stated from the top
  const topIndexOf = (index: number) => entries.length - 1 - index;

  entries.forEach((entry, index) => {
    const seeded = previous
      ? previous[entry.key] ?? everyPanel
      : implicitPanelsFor(topIndexOf(index), panelCount);
    const bounded = seeded.filter((panel) => panel < panelCount);
    next[entry.key] = bounded;
    const before = previous?.[entry.key];
    if (
      !before ||
      before.length !== bounded.length ||
      before.some((panel, i) => panel !== bounded[i])
    ) {
      changed = true;
    }
  });

  if (previous && Object.keys(previous).length !== entries.length) {
    changed = true;
  }
  return changed || !previous ? next : previous;
};
