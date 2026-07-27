import { useCallback, useContext, type ComponentType } from "react";
import type { Map as LeafletMap } from "leaflet";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { carma } from "@carma-api";

import store from "../store";
import {
  addonRegistry,
  type AddonComponentProps,
  type FachzwillingAddon,
} from "./registry";

/**
 * Lookup host for the active route's addons: resolves each addon's kind in
 * `addonRegistry` and mounts the kind's component, handing it the shared
 * geoportal interaction inputs (carma api, leaflet map handle, redux store).
 * Must render inside `CarmaMapProviderWrapper` so the map contexts and the
 * carma api adapters are available.
 */
export const FachzwillingAddonHost = ({
  addons,
}: {
  addons?: FachzwillingAddon[];
}) => {
  const topicMap = useContext<typeof TopicMapContext>(TopicMapContext);
  const getLeafletMap = useCallback(
    (): LeafletMap | null =>
      topicMap?.routedMapRef?.leafletMap?.leafletElement ?? null,
    [topicMap]
  );

  if (!addons?.length) {
    return null;
  }

  return (
    <>
      {addons.map((addon, index) => {
        // the registry entry is typed per kind; the host renders the erased union
        const Component = addonRegistry[
          addon.kind
        ] as ComponentType<AddonComponentProps>;
        return (
          <Component
            key={`${addon.kind}_${index}`}
            config={addon.config}
            carma={carma}
            getLeafletMap={getLeafletMap}
            store={store}
          />
        );
      })}
    </>
  );
};
