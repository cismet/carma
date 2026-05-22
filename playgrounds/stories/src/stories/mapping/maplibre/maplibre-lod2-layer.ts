import type { CustomLayerInterface, Map as MapLibreMap } from "maplibre-gl";

export const MAPLIBRE_LOD2_LAYER_ID = "carma-story-maplibre-lod2-buildings";

const BASEMAP_DE_3D_TILES_SCRIPT_URL =
  "https://sg.geodatenzentrum.de/gdz_basemapde_3d_gebaeude/Maplibre3DTiles.js";
const BASEMAP_DE_LOD2_TILESET_URL =
  "https://sg.geodatenzentrum.de/gdz_basemapde_3d_gebaeude/lod2_3857_null.json";

type Mapbox3DTilesLayerOptions = {
  id: string;
  url: string;
  colorWall?: string;
  colorRoof?: string;
  colorBridge?: string;
};

type Mapbox3DTilesLayerConstructor = new (
  options: Mapbox3DTilesLayerOptions
) => CustomLayerInterface;

declare global {
  interface Window {
    Mapbox3DTiles?: {
      Mapbox3DTilesLayer?: Mapbox3DTilesLayerConstructor;
    };
  }
}

let maplibre3dTilesScriptPromise: Promise<Mapbox3DTilesLayerConstructor> | null =
  null;

const getMapbox3DTilesLayerConstructor = () =>
  window.Mapbox3DTiles?.Mapbox3DTilesLayer ?? null;

const loadMapbox3DTilesLayerConstructor =
  async (): Promise<Mapbox3DTilesLayerConstructor> => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      throw new Error("MapLibre LOD2 tiles require a browser runtime.");
    }

    const existingConstructor = getMapbox3DTilesLayerConstructor();
    if (existingConstructor) {
      return existingConstructor;
    }

    if (maplibre3dTilesScriptPromise) {
      return maplibre3dTilesScriptPromise;
    }

    maplibre3dTilesScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = BASEMAP_DE_3D_TILES_SCRIPT_URL;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.dataset.carmaMaplibreLod2 = "true";
      script.onload = () => {
        const loadedConstructor = getMapbox3DTilesLayerConstructor();
        if (loadedConstructor) {
          resolve(loadedConstructor);
          return;
        }

        reject(new Error("Maplibre3DTiles.js did not expose Mapbox3DTiles."));
      };
      script.onerror = () => {
        maplibre3dTilesScriptPromise = null;
        reject(new Error("Failed to load Maplibre3DTiles.js."));
      };

      document.head.appendChild(script);
    });

    return maplibre3dTilesScriptPromise;
  };

export const removeMapLibreLod2Layer = (map: MapLibreMap) => {
  try {
    if (map.getLayer(MAPLIBRE_LOD2_LAYER_ID)) {
      map.removeLayer(MAPLIBRE_LOD2_LAYER_ID);
    }
  } catch {
    // MapLibre may already have disposed its style during Storybook unmount.
  }
};

export const syncMapLibreLod2Layer = async ({
  enabled,
  keepLayerIdsOnTop = [],
  map,
}: {
  enabled: boolean;
  keepLayerIdsOnTop?: readonly string[];
  map: MapLibreMap;
}) => {
  if (!enabled) {
    removeMapLibreLod2Layer(map);
    return;
  }

  const keepCustomLayersOnTop = () => {
    keepLayerIdsOnTop.forEach((layerId) => {
      try {
        if (map.getLayer(layerId)) {
          map.moveLayer(layerId);
        }
      } catch {
        // Layer ordering is best-effort for optional story custom layers.
      }
    });
  };

  if (map.getLayer(MAPLIBRE_LOD2_LAYER_ID)) {
    keepCustomLayersOnTop();
    map.triggerRepaint();
    return;
  }

  const Mapbox3DTilesLayer = await loadMapbox3DTilesLayerConstructor();
  if (!map.isStyleLoaded() || map.getLayer(MAPLIBRE_LOD2_LAYER_ID)) {
    keepCustomLayersOnTop();
    return;
  }

  map.addLayer(
    new Mapbox3DTilesLayer({
      id: MAPLIBRE_LOD2_LAYER_ID,
      url: BASEMAP_DE_LOD2_TILESET_URL,
      colorWall: "#d8d3cc",
      colorRoof: "#b96a5a",
      colorBridge: "#9a9a9a",
    })
  );

  keepCustomLayersOnTop();
  map.triggerRepaint();
};
