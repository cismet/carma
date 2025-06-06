import { useEffect, useRef, useState } from "react";
import { Viewer } from "cesium";

import { useCameraPersistence } from "./useCameraPersistence";
import { useZoomToTilesetOnReady } from "./useZoomToTilesetOnReady";
import useTileset from "./useTileset";

interface UseTestMeshViewerOptions {
  /** Cesium viewer constructor options */
  cesiumOptions?: Record<string, unknown>;
  /** Tileset URL */
  tilesetUrl: string;
  /** Tileset constructor options */
  tilesetOptions?: Record<string, unknown>;
  /** Camera persistence options */
  cameraPersistence?: {
    autoSave?: boolean;
    saveDelay?: number;
    autoRestore?: boolean;
    restoreOptions?: {
      animate?: boolean;
      duration?: number;
    };
  };
}

/**
 * Comprehensive hook for TestMeshElevations that handles:
 * - Viewer initialization and cleanup
 * - Tileset loading
 * - Camera persistence
 * - Conditional zoom to tileset
 */
export const useTestMeshViewer = (
  containerRef: React.MutableRefObject<HTMLDivElement | null>,
  options: UseTestMeshViewerOptions
) => {
  const {
    cesiumOptions = {},
    tilesetUrl,
    tilesetOptions = {},
    cameraPersistence = {},
  } = options;

  const viewerRef = useRef<Viewer | null>(null);
  const [isViewerReady, setIsViewerReady] = useState(false);

  // Initialize viewer
  useEffect(() => {
    if (viewerRef.current) {
      console.debug("[useTestMeshViewer] Viewer already exists");
      return;
    }

    const initialize = async () => {
      try {
        if (containerRef.current) {
          const viewer = new Viewer(containerRef.current, {
            infoBox: false, // Default to false for custom InfoPanel
            ...cesiumOptions,
          });
          viewerRef.current = viewer;
          setIsViewerReady(true);
          console.debug("[useTestMeshViewer] Viewer initialized");
        }
      } catch (error) {
        console.error(
          "[useTestMeshViewer] Viewer initialization error:",
          error
        );
      }
    };

    initialize();

    return () => {
      try {
        if (viewerRef.current && !viewerRef.current.isDestroyed()) {
          console.debug("[useTestMeshViewer] Destroying viewer");
          viewerRef.current.destroy();
          viewerRef.current = null;
          setIsViewerReady(false);
        }
      } catch (error) {
        console.error("[useTestMeshViewer] Error destroying viewer:", error);
      }
    };
  }, [containerRef, cesiumOptions]);

  // Load tileset
  const { tilesetRef, tilesetReady } = useTileset(
    tilesetUrl,
    viewerRef,
    tilesetOptions
  );

  // Camera persistence
  const { wasRestored, hasValidSavedState } = useCameraPersistence(
    viewerRef.current,
    {
      autoSave: true,
      saveDelay: 1000,
      autoRestore: true,
      restoreOptions: { animate: false, duration: 0 },
      ...cameraPersistence,
    }
  );

  // Conditional zoom (only if camera wasn't restored)
  const shouldZoom = !hasValidSavedState() && !wasRestored;
  console.debug("[useTestMeshViewer] Camera state check:", {
    hasValidSavedState: hasValidSavedState(),
    wasRestored,
    shouldZoom,
  });

  const { zoomToTileset } = useZoomToTilesetOnReady(
    viewerRef,
    tilesetRef,
    tilesetReady,
    shouldZoom
  );

  return {
    // Viewer state
    viewer: viewerRef.current,
    viewerRef,
    isViewerReady,

    // Tileset state
    tileset: tilesetRef.current,
    tilesetRef,
    tilesetReady,

    // Camera functions
    zoomToTileset,

    // Camera state
    wasRestored,
    hasValidSavedState,
  };
};
