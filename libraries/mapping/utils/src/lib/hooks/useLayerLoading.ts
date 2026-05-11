import { BackgroundLayer, Layer } from "@carma-mapping/layers";
import { useEffect, useState } from "react";
import L from "leaflet";

export type LayerLoadingNamedLayerConfig = {
  type?: string;
};

export type LayerLoadingNamedLayers = Record<
  string,
  LayerLoadingNamedLayerConfig
>;

const EMPTY_NAMED_LAYERS: LayerLoadingNamedLayers = {};

interface UseLayerLoadingProps {
  map: L.Map;
  layer: Layer | BackgroundLayer;
  namedLayers?: LayerLoadingNamedLayers;
}

export const getNamedLayersFromString = (
  layers: string | undefined | null,
  namedLayers: LayerLoadingNamedLayers = {}
): LayerLoadingNamedLayerConfig[] => {
  if (!layers) return [];

  return layers
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((originalName) => {
      const name = originalName.split("@")[0];

      const config = namedLayers[name];
      if (!config) {
        console.warn(
          `getNamedLayersFromString: named layer "${name}" not found in provided namedLayers`
        );
        return null;
      }
      return config;
    })
    .filter((e): e is LayerLoadingNamedLayerConfig => e !== null);
};

export const useLayerLoading = ({
  map,
  layer,
  namedLayers = EMPTY_NAMED_LAYERS,
}: UseLayerLoadingProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [listenersAttached, setListenersAttached] = useState(false);
  const [backgroundLayers, setBackgroundLayers] = useState<
    { config: LayerLoadingNamedLayerConfig; loading: boolean }[]
  >([]);
  const [backgroundLayerLoadingStates, setBackgroundLayerLoadingStates] =
    useState<{ id: number; loading: boolean }[]>([]);
  // Store references to layers with attached listeners for cleanup
  const [layersWithListeners, setLayersWithListeners] = useState<L.Layer[]>([]);

  const isBackgroundLayer = "layers" in layer;

  useEffect(() => {
    if ("layers" in layer) {
      const backgroundNamedLayers = getNamedLayersFromString(
        layer.layers,
        namedLayers
      ).filter((layer) => layer.type !== "vector");
      setBackgroundLayerLoadingStates([]);
      if (backgroundNamedLayers.length > 0) {
        setBackgroundLayers(
          backgroundNamedLayers.map((namedLayer) => {
            return {
              config: namedLayer,
              loading: false,
            };
          })
        );
        setListenersAttached(false);
        cleanupAllListeners();
      } else {
        setLoading(false);
        setListenersAttached(true);
      }
    }
  }, [layer, namedLayers]);

  const wmsName =
    layer.layerType === "wmts" || layer.layerType === "wmts-nt"
      ? layer?.props?.name
      : layer?.other?.name;

  const shouldShowLoading = () => {
    if (layer.layerType === "vector" || !layer.layerType) return false;

    return true;
  };
  // Helper function to remove listeners from a layer
  const removeListeners = (leafletLayer: L.Layer) => {
    leafletLayer.off("tileerror");
    leafletLayer.off("tileload");
    leafletLayer.off("loading");
    leafletLayer.off("tileloadstart");
    leafletLayer.off("load");
  };

  // Helper function to clean up all listeners
  const cleanupAllListeners = () => {
    layersWithListeners.forEach((layer) => {
      removeListeners(layer);
    });
    setLayersWithListeners([]);
  };

  const updateLoadingState = (loading: boolean, id) => {
    setBackgroundLayerLoadingStates((prev) => {
      // Check if an entry with this id already exists
      const exists = prev.some((l) => l.id === id);

      if (exists) {
        // Update existing entry
        return prev.map((l) => {
          if (l.id === id) {
            return { ...l, loading };
          }
          return l;
        });
      } else {
        // Add new entry
        return [...prev, { id, loading }];
      }
    });
  };

  const findAndAttachListeners = () => {
    if (
      !map ||
      (!wmsName && backgroundLayers.length === 0) ||
      listenersAttached
    )
      return;

    // Clean up any existing listeners before attaching new ones
    cleanupAllListeners();
    setListenersAttached(false);

    // Skip loading indicators for certain layer types
    const showLoading = shouldShowLoading();

    let found = false;
    const newLayersWithListeners: L.Layer[] = [];

    map.eachLayer((leafletLayer) => {
      const isTargetLayer =
        // @ts-ignore
        leafletLayer.options?.layers === wmsName ||
        (leafletLayer.options.pane === "backgroundLayers" &&
          backgroundLayers.length > 0);

      const multipleLayers = backgroundLayers.length > 1;

      if (isTargetLayer) {
        found = true;

        // Check if it's a GridLayer to access its methods
        const isGridLayer = leafletLayer instanceof L.GridLayer;

        if (isGridLayer && showLoading) {
          // Use GridLayer's isLoading method if available
          const isCurrentlyLoading = leafletLayer.isLoading?.();
          if (isCurrentlyLoading !== undefined) {
            setLoading(isCurrentlyLoading);
          }

          // We can also check _loading property which some GridLayer implementations use
          // @ts-ignore
          if (leafletLayer._loading !== undefined) {
            // @ts-ignore
            setLoading(leafletLayer._loading);
          }
        }

        // Only attach loading-related events if we should show loading
        if (showLoading) {
          // Attach events with named handler functions for better cleanup
          const handleTileError = () => {
            setError(true);
            if (multipleLayers) {
              // @ts-ignore
              updateLoadingState(false, leafletLayer._leaflet_id);
            } else {
              setLoading(false);
            }
          };

          const handleTileLoad = () => {
            setError(false);
          };

          const handleLoading = () => {
            if (multipleLayers) {
              // @ts-ignore
              updateLoadingState(true, leafletLayer._leaflet_id);
            } else {
              setLoading(true);
            }
          };

          const handleLoad = () => {
            if (multipleLayers) {
              // @ts-ignore
              updateLoadingState(false, leafletLayer._leaflet_id);
            } else {
              setLoading(false);
            }
          };

          leafletLayer.on("tileerror", handleTileError);
          leafletLayer.on("tileload", handleTileLoad);
          leafletLayer.on("loading", handleLoading);
          leafletLayer.on("tileloadstart", handleLoading);
          leafletLayer.on("load", handleLoad);

          // Track this layer for cleanup
          newLayersWithListeners.push(leafletLayer);
        }

        setListenersAttached(true);
      }
    });

    // Update the list of layers with listeners
    setLayersWithListeners(newLayersWithListeners);

    // If layer is visible but we didn't find it, it might still be loading
    if (!found && layer.visible && showLoading) {
      setLoading(true);
    }
  };

  // Run when map or layer changes
  useEffect(() => {
    findAndAttachListeners();

    // Set up a MutationObserver to detect when new layers are added to the map
    if (map && !listenersAttached) {
      // Listen for layeradd events on the map
      const layerAddHandler = () => {
        findAndAttachListeners();
      };

      map.on("layeradd", layerAddHandler);

      // Initial check
      findAndAttachListeners();

      return () => {
        map.off("layeradd", layerAddHandler);
        cleanupAllListeners();
      };
    }

    // Cleanup listeners when component unmounts or when dependencies change
    return () => {
      cleanupAllListeners();
    };
  }, [map, layer, listenersAttached, backgroundLayers]);

  useEffect(() => {
    if (layer.visible && map) {
      findAndAttachListeners();

      if (!listenersAttached && shouldShowLoading()) {
        setLoading(true);
      }

      return () => {
        if (!layer.visible) {
          cleanupAllListeners();
          setListenersAttached(false);
        }
      };
    } else if (!layer.visible) {
      cleanupAllListeners();
      setListenersAttached(false);
    }
  }, [layer.visible, map]);

  useEffect(() => {
    if (backgroundLayerLoadingStates.length > 0) {
      const isLoading = backgroundLayerLoadingStates.some((l) => l.loading);
      setLoading(isLoading);
    }
  }, [backgroundLayerLoadingStates]);

  return { loading, error };
};
