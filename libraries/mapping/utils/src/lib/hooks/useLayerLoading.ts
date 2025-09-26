import { Layer } from "@carma/types";
import { useContext, useEffect, useState } from "react";
import L from "leaflet";

interface UseLayerLoadingProps {
  map: L.Map;
  layer: Layer;
}

export const useLayerLoading = ({ map, layer }: UseLayerLoadingProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [listenersAttached, setListenersAttached] = useState(false);

  const wmsName =
    layer.layerType === "wmts" || layer.layerType === "wmts-nt"
      ? layer.props.name
      : layer?.other?.name;

  const shouldShowLoading = () => {
    if (layer.layerType === "vector") return false;

    return true;
  };
  const findAndAttachListeners = () => {
    if (!map || !wmsName || listenersAttached) return;

    // Skip loading indicators for certain layer types
    const showLoading = shouldShowLoading();

    let found = false;
    map.eachLayer((leafletLayer) => {
      // Check if this is our target layer by name
      // @ts-ignore
      const isTargetLayer = leafletLayer.options?.layers === wmsName;

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
          // Attach events
          leafletLayer.on("tileerror", () => {
            setError(true);
            setLoading(false);
          });

          leafletLayer.on("tileload", () => {
            setError(false);
          });

          leafletLayer.on("loading", () => {
            setLoading(true);
          });

          leafletLayer.on("tileloadstart", () => {
            setLoading(true);
          });

          leafletLayer.on("load", () => {
            setLoading(false);
          });
        }

        setListenersAttached(true);
      }
    });

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
      };
    }
  }, [map, layer, listenersAttached]);

  // Also check when layer visibility changes
  useEffect(() => {
    if (layer.visible && map) {
      // When layer becomes visible, it might be added to the map
      findAndAttachListeners();

      // If we still don't have listeners attached, show loading state
      // but only for non-vector and non-background layers
      if (!listenersAttached && shouldShowLoading()) {
        setLoading(true);
      }

      // Set up periodic check for GridLayer loading state
      let gridLayerRef: L.GridLayer | null = null;

      // Find our GridLayer if it exists
      map.eachLayer((leafletLayer) => {
        if (
          // @ts-ignore
          leafletLayer.options?.layers === wmsName &&
          leafletLayer instanceof L.GridLayer
        ) {
          gridLayerRef = leafletLayer as L.GridLayer;
        }
      });

      // If we found a GridLayer, set up interval to check its loading state
      if (gridLayerRef && shouldShowLoading()) {
        const intervalId = setInterval(() => {
          if (gridLayerRef) {
            // Check isLoading method
            const isCurrentlyLoading = gridLayerRef.isLoading?.();
            if (isCurrentlyLoading !== undefined) {
              setLoading(isCurrentlyLoading);
            }

            // Also check _loading property
            // @ts-ignore
            if (gridLayerRef._loading !== undefined) {
              // @ts-ignore
              setLoading(gridLayerRef._loading);
            }
          }
        }, 500); // Check every 500ms

        return () => clearInterval(intervalId);
      }
    }
  }, [layer.visible, map]);

  return { loading, error };
};
