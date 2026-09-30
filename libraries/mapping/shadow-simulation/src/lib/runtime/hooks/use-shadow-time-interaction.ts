import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

type TimeInteraction = {
  owners: Set<symbol>;
  listeners: Set<() => void>;
};

const interactions = new WeakMap<MaplibreMap, TimeInteraction>();
const getInteraction = (map: MaplibreMap): TimeInteraction => {
  let interaction = interactions.get(map);
  if (!interaction) {
    interaction = { owners: new Set(), listeners: new Set() };
    interactions.set(map, interaction);
  }
  return interaction;
};

/** A gesture belongs to its control and map, never to persisted addon state. */
export const useShadowTimeInteraction = (map: MaplibreMap | null) => {
  const owner = useMemo(() => Symbol("shadow-time-control"), [map]);
  const setInteracting = useCallback(
    (active: boolean) => {
      if (!map) return;
      const interaction = getInteraction(map);
      const wasActive = interaction.owners.size > 0;
      if (active) interaction.owners.add(owner);
      else interaction.owners.delete(owner);
      if (wasActive !== interaction.owners.size > 0) {
        interaction.listeners.forEach((listener) => listener());
      }
    },
    [map, owner]
  );
  useEffect(() => () => setInteracting(false), [setInteracting]);
  return setInteracting;
};

export const useShadowTimeInteractionState = (map: MaplibreMap | null) => {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!map) return () => undefined;
      const { listeners } = getInteraction(map);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    [map]
  );
  const getSnapshot = useCallback(
    () => map !== null && (interactions.get(map)?.owners.size ?? 0) > 0,
    [map]
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
};
