import { useCallback, useEffect, useRef } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import type { ToolEntry } from "@carma-mapping/layers";

import {
  resolveStyleLayerIds,
  runSwitchOn,
  switchOnConfig,
  type SwitchOnConfig,
} from "../addons/SwitchOn";

/** the part of a stack entry this needs: its identity and its tools */
type SwitchOnCarrier = { id: string; tools?: ToolEntry[] };

type MapState = {
  /** entry ids that have had their run for this time being switched on */
  fired: Set<string>;
  /** entry id -> cancel function of its running animation */
  runs: Map<string, () => void>;
};

/**
 * One state per map, not per hook instance. The hook is mounted more than once
 * over a map's life — a remount, a second render of the map component, React
 * running effects twice in development — and per-instance bookkeeping meant
 * each of those started its own run: several animations writing the same paint
 * properties in the same frame, fighting each other and starving the frame
 * loop. Keyed by the map, "already switched on" means the same thing to all of
 * them. Weak, so a discarded map takes its state with it.
 */
const stateByMap = new WeakMap<MaplibreMap, MapState>();

const stateFor = (map: MaplibreMap): MapState => {
  const existing = stateByMap.get(map);
  if (existing) {
    return existing;
  }
  const created: MapState = { fired: new Set(), runs: new Map() };
  stateByMap.set(map, created);
  return created;
};

/**
 * Runs the `switchOn` tool of every entry that declares one, once per time the
 * layer is switched on. The addon has no trigger and no panel on purpose: the
 * projection mapping board has no UI to press, so switching the layer on is the
 * whole interaction.
 *
 * What counts as switched on is the entry being in the layer stack, not its
 * style layers being on the map. The host rebuilds and diffs the whole style on
 * every change, and during a rebuild the layers are briefly gone; firing off
 * their presence gave a second run every time anything else on the map changed.
 * The style layers are waited for, never watched: once they are there the run
 * starts, and nothing that happens to them afterwards starts another one.
 */
export const useSwitchOn = (
  map: MaplibreMap | null,
  entries: readonly SwitchOnCarrier[]
): void => {
  const entriesRef = useRef(entries);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const check = useCallback(() => {
    if (!map) {
      return;
    }
    const { fired, runs } = stateFor(map);

    const wanted: { id: string; config: SwitchOnConfig }[] = [];
    for (const entry of entriesRef.current) {
      const config = switchOnConfig(entry);
      if (config) {
        wanted.push({ id: entry.id, config });
      }
    }
    const wantedIds = new Set(wanted.map(({ id }) => id));

    // switched off, or gone from the stack: the next time it comes back counts
    // as a new switch-on, so its run is armed again
    for (const id of fired) {
      if (!wantedIds.has(id)) {
        fired.delete(id);
        runs.get(id)?.();
        runs.delete(id);
      }
    }

    // the animation's own paint writes emit `styledata` at frame rate; starting
    // another run into that would fight the one already going
    if (runs.size > 0) {
      return;
    }

    for (const { id, config } of wanted) {
      if (fired.has(id)) {
        continue;
      }
      const ready = config.targets.some(
        (target) => resolveStyleLayerIds(map, target.layer).length > 0
      );
      if (!ready) {
        continue;
      }
      fired.add(id);
      // `onEnd` runs synchronously for a run with nothing to animate, so the
      // delete has to be able to precede the set
      let ended = false;
      const stop = runSwitchOn(map, config, () => {
        ended = true;
        runs.delete(id);
      });
      if (!ended) {
        runs.set(id, stop);
      }
      // one run at a time; the next starts from the check that the settling
      // write triggers
      return;
    }
  }, [map]);

  // switching a layer on is a change to the stack, not to the map, so the stack
  // has to be able to start a run on its own
  useEffect(() => {
    check();
  }, [check, entries]);

  useEffect(() => {
    if (!map) {
      return;
    }
    map.on("styledata", check);
    map.on("idle", check);
    return () => {
      map.off("styledata", check);
      map.off("idle", check);
    };
  }, [map, check]);
};
