import { createContext, useContext } from "react";

import type { LayerCatalogConfig } from "./layerCatalogConfig";
import { wuppLayerCatalogConfig } from "./layerCatalogConfig";

const LayerCatalogConfigContext = createContext<LayerCatalogConfig>(
  wuppLayerCatalogConfig
);

export const LayerCatalogConfigProvider = LayerCatalogConfigContext.Provider;

export const useLayerCatalogConfig = () =>
  useContext(LayerCatalogConfigContext);
