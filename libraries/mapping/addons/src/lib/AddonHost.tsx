import { useContext, type ComponentType } from "react";
import type { Map as LeafletMap } from "leaflet";
import { useStore } from "react-redux";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { carma } from "@carma-api";
import { useLibreContext } from "@carma-mapping/contexts";

import {
  addonRegistry,
  type Addon,
  type AddonComponentProps,
} from "./registry";

/**
 * Lookup host for the active route's addons: resolves each addon's kind in
 * `addonRegistry` and mounts the kind's component, handing it the shared
 * interaction inputs (carma api, leaflet map, maplibre map, redux store).
 * Must render inside `CarmaMapProviderWrapper` and the host app's react-redux
 * provider, so the map contexts, the carma api adapters and the store are
 * available.
 */
export const AddonHost = ({ addons }: { addons?: Addon[] }) => {
  const topicMap = useContext<typeof TopicMapContext>(TopicMapContext);
  const { map: libreMap } = useLibreContext();
  const store = useStore();
  // resolved per render; the context updates once the routed map ref is set
  const leafletMap: LeafletMap | null =
    topicMap?.routedMapRef?.leafletMap?.leafletElement ?? null;

  if (!addons?.length) {
    return null;
  }

  return (
    <>
      {addons.map((addon, index) => {
        // the registry entry is typed per kind; the host renders the erased union
        const Component = addonRegistry[addon.kind]
          .Component as ComponentType<AddonComponentProps>;
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
