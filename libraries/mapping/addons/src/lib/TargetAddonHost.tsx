import { useContext, type ComponentType } from "react";
import type { Map as LeafletMap } from "leaflet";
import { useStore } from "react-redux";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { carma } from "@carma-api";
import { useLibreContext } from "@carma-mapping/contexts";
import type { LayerStackEntry } from "@carma-mapping/layers";

import {
  addonRegistry,
  resolveAddonEntries,
  resolveAddonLayerButton,
  type AddonComponentProps,
  type AddonEntry,
  type ResolvedAddon,
} from "./registry";

/** The entries of `target` that have an applicable trigger button. */
export const getTargetAddonsWithButton = (
  target?: LayerStackEntry | null
): ResolvedAddon[] =>
  resolveAddonEntries(
    (target as { tools?: AddonEntry[] } | null | undefined)?.tools
  ).filter((entry) =>
    Boolean(resolveAddonLayerButton(entry, target ?? null))
  );

export const hasTargetAddonsWithButton = (
  target?: LayerStackEntry | null
): boolean => getTargetAddonsWithButton(target).length > 0;

/**
 * Renders one addon declared on a stack entry, with the same interaction
 * inputs `AddonHost` hands route addons. Placement is the caller's business:
 * the interaction view supplies the slot.
 */
export const TargetAddonHost = ({
  addon,
  target,
}: {
  addon: ResolvedAddon;
  target: LayerStackEntry;
}) => {
  const topicMap = useContext<typeof TopicMapContext>(TopicMapContext);
  const { map: libreMap } = useLibreContext();
  const store = useStore();
  const leafletMap: LeafletMap | null =
    topicMap?.routedMapRef?.leafletMap?.leafletElement ?? null;

  const Component = addonRegistry[addon.kind]
    .Component as ComponentType<AddonComponentProps>;

  return (
    <Component
      config={addon.config}
      carma={carma}
      leafletMap={leafletMap}
      libreMap={libreMap}
      store={store}
      target={target}
    />
  );
};
