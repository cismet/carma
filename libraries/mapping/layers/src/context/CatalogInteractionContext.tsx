import { createContext, useContext, type ReactNode } from "react";
import type {
  ActiveLayers,
  Item,
  SavedLayerConfig,
  SetAdditionalLayers,
} from "../lib/contracts/carma-layers.d";

/**
 * Host-integration values the cards and the info card need everywhere in the
 * catalog view. Provided by LayerCatalogView from its props; a context so the
 * values do not get drilled through grid -> card -> info card.
 */
export interface CatalogInteractionContextValue {
  /** host callback that applies, removes or updates an item on the map */
  setAdditionalLayers: SetAdditionalLayers;
  activeLayers: ActiveLayers;
  /** provider favorites extended by the host-owned saved collections */
  favorites: Array<Item | SavedLayerConfig>;
  /** routes collections to the host callbacks, everything else to the provider */
  addFavorite: (item: Item) => void;
  removeFavorite: (item: Item) => void;
  setPreview: (preview: boolean) => void;
  /** true while the discover query fetches */
  discoverIsFetching: boolean;
  resolveWorkflowLayers?: (ids: string[]) => Item[];
}

const CatalogInteractionContext =
  createContext<CatalogInteractionContextValue | null>(null);

export const useCatalogInteraction = (): CatalogInteractionContextValue => {
  const value = useContext(CatalogInteractionContext);
  if (!value) {
    throw new Error(
      "useCatalogInteraction requires the LayerCatalog view to be mounted"
    );
  }
  return value;
};

export const CatalogInteractionProvider = ({
  value,
  children,
}: {
  value: CatalogInteractionContextValue;
  children: ReactNode;
}) => (
  <CatalogInteractionContext.Provider value={value}>
    {children}
  </CatalogInteractionContext.Provider>
);
