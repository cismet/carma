import { createContext, useContext } from "react";

import type { Item } from "../lib/contracts/carma-layers.d";

/**
 * Items the current view shows although their `mapMode` names the other
 * one. The host decides; the Geoportal's MapLibre view shows saved 3D
 * measurements through its 3D measurement while a mesh is drawn.
 */
export type CatalogItemAvailability = (item: Item) => boolean;

const CatalogItemAvailabilityContext =
  createContext<CatalogItemAvailability | null>(null);

export const CatalogItemAvailabilityProvider =
  CatalogItemAvailabilityContext.Provider;

export const useCatalogItemAvailability = () =>
  useContext(CatalogItemAvailabilityContext);
