import { useContext, useEffect, type ComponentType } from "react";
import type { Map as LeafletMap } from "leaflet";
import { useStore } from "react-redux";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { carma } from "@carma-api";
import { useLibreContext } from "@carma-mapping/contexts";

import {
  addonRegistry,
  resolveAddonEntries,
  type AddonComponentProps,
  type AddonEntry,
} from "./registry";
import { applyAddonOverrides } from "./addon-overrides";
import { useAddonState, useRouteAddons } from "./AddonStateContext";

/**
 * Dev-time wiring check: every channel a configured addon `requires` must be
 * covered by some sibling's `provides`, so a UI addon without its headless
 * producer surfaces as a warning instead of a silently empty panel. A warning
 * rather than a throw: a half-configured route should still render its map.
 * Lives with the host rather than the provider, because the provider is the
 * generic core in `@carma-mapping/contexts` and has no registry access.
 */
const warnOnUnmetRequirements = (addons?: readonly AddonEntry[]) => {
  const entries = resolveAddonEntries(addons);

  const provided = new Set<string>();
  for (const entry of entries) {
    for (const channel of addonRegistry[entry.kind].provides ?? []) {
      provided.add(channel);
    }
  }
  for (const entry of entries) {
    for (const channel of addonRegistry[entry.kind].requires ?? []) {
      if (!provided.has(channel)) {
        console.warn(
          `[ADDON STATE] addon "${entry.kind}" requires channel "${String(
            channel
          )}" but no configured addon provides it`,
          { configuredAddons: entries.map(({ kind }) => kind) }
        );
      }
    }
  }
};

/**
 * Lookup host for the active route's addons: resolves each addon's kind in
 * `addonRegistry` and mounts the kind's component, handing it the shared
 * interaction inputs (carma api, leaflet map, maplibre map, redux store).
 * Must render inside `CarmaMapProviderWrapper` and the host app's react-redux
 * provider, so the map contexts, the carma api adapters and the store are
 * available. The addon list comes from the surrounding `AddonProvider`; the
 * host takes no props, so the list is passed at exactly one place.
 */
export const AddonHost = () => {
  const addons = useRouteAddons();
  // what the `addonManager` switched on or off for this session; undefined
  // until it writes for the first time, which is the plain route list
  const [overrides] = useAddonState("addonOverrides");
  const topicMap = useContext<typeof TopicMapContext>(TopicMapContext);
  const { map: libreMap } = useLibreContext();
  const store = useStore();
  // resolved per render; the context updates once the routed map ref is set
  const leafletMap: LeafletMap | null =
    topicMap?.routedMapRef?.leafletMap?.leafletElement ?? null;

  useEffect(() => {
    if (import.meta.env.DEV) {
      warnOnUnmetRequirements(addons);
    }
  }, [addons]);

  const entries = applyAddonOverrides(resolveAddonEntries(addons), overrides);
  if (!entries.length) {
    return null;
  }

  return (
    <>
      {entries.map((addon, index) => {
        // the registry entry is typed per kind; the host renders the erased union
        const Component = addonRegistry[addon.kind].Component as
          | ComponentType<AddonComponentProps>
          | undefined;
        if (!Component) {
          return null;
        }
        return (
          <Component
            key={`${addon.kind}_${index}`}
            config={addon.config}
            carma={carma}
            leafletMap={leafletMap}
            libreMap={libreMap}
            store={store}
            target={null}
          />
        );
      })}
    </>
  );
};
