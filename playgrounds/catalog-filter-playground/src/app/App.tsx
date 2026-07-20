import { useMemo, useState } from "react";
import { Button } from "antd";

import { AuthProvider } from "@carma-providers/auth";
import {
  CARMA_MAP_FRAMEWORKS,
  MapFrameworkSwitcherProvider,
} from "@carma-mapping/components";
import {
  LayerCatalog,
  LayerCatalogProvider,
  wuppLayerCatalogConfig,
  type BackgroundLayer,
  type LayerCatalogConfig,
} from "@carma-mapping/layers";

import ConfigSidebar from "./components/ConfigSidebar";
import {
  toCatalogFilters,
  type FilterGroupDraft,
  type RouteDraft,
} from "./model";

const APP_KEY = "catalog-filter-playground";

// the catalog only reads the active layers to mark applied items; the
// playground has no map, so a background stub satisfies the contract
const PREVIEW_BACKGROUND_LAYER: BackgroundLayer = {
  id: "playground-background",
  title: "Hintergrund (Playground-Stub)",
  layers: "",
  layerType: "wmts",
  visible: true,
};

const App = () => {
  const [route, setRoute] = useState<RouteDraft>({
    path: "",
    title: "",
    description: "",
    thumbnail: "",
  });
  const [filterGroups, setFilterGroups] = useState<FilterGroupDraft[]>([
    { key: 0, filters: [{ key: 0, field: "id", values: [] }] },
  ]);
  const [previewIn3d, setPreviewIn3d] = useState(false);
  const [open, setOpen] = useState(true);

  const activeFilters = useMemo(
    () => toCatalogFilters(filterGroups),
    [filterGroups]
  );
  // services/asset urls stay the stable wupp defaults, only the filters swap
  const config = useMemo<LayerCatalogConfig>(
    () => ({ ...wuppLayerCatalogConfig, filters: activeFilters }),
    [activeFilters]
  );

  return (
    <AuthProvider>
      <LayerCatalogProvider config={config} appKey={APP_KEY}>
        <div className="w-screen h-screen bg-neutral-200">
          <ConfigSidebar
            route={route}
            onRouteChange={setRoute}
            filterGroups={filterGroups}
            onFilterGroupsChange={setFilterGroups}
            previewIn3d={previewIn3d}
            onPreviewIn3dChange={setPreviewIn3d}
            modalOpen={open}
            onOpenModal={() => setOpen(true)}
          />
          <div className="fixed inset-y-0 left-96 right-0 flex items-center justify-center">
            <Button type="primary" size="large" onClick={() => setOpen(true)}>
              Karteninhalte öffnen
            </Button>
          </div>
          {/* remounting the switcher provider is the cheap way to simulate the
              2D/3D catalog behavior without dragging a real map engine in */}
          <MapFrameworkSwitcherProvider
            key={previewIn3d ? "cesium" : "leaflet"}
            initialFramework={
              previewIn3d
                ? CARMA_MAP_FRAMEWORKS.CESIUM
                : CARMA_MAP_FRAMEWORKS.LEAFLET
            }
          >
            <LayerCatalog
              open={open}
              setOpen={setOpen}
              setAdditionalLayers={(layer, ...rest) => {
                console.log(
                  "[FILTER PLAYGROUND] setAdditionalLayers",
                  layer,
                  ...rest
                );
              }}
              activeLayers={[PREVIEW_BACKGROUND_LAYER]}
              updateActiveLayer={() => {}}
              appKey={APP_KEY}
            />
          </MapFrameworkSwitcherProvider>
        </div>
      </LayerCatalogProvider>
    </AuthProvider>
  );
};

export default App;
