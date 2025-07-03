import { useEffect, useRef, useState } from "react";
import { Viewer } from "cesium";

import { useCameraPersistence } from "./useCameraPersistence";
import { useZoomToTilesetOnReady } from "./useZoomToTilesetOnReady";
import useTileset from "./useTileset";

interface UsePersistentViewerOptions {
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
  };
}

/**
 * Comprehensive hook for TestMeshElevations that handles:
 * - Viewer initialization and cleanup
 * - Tileset loading
 * - Camera persistence
 * - Conditional zoom to tileset
 */
export const usePersistentViewer = (
  containerRef: React.MutableRefObject<HTMLDivElement | null>,
  options: UsePersistentViewerOptions
) => {
  const {
    cesiumOptions = {},
    tilesetUrl,
    tilesetOptions = {},
    cameraPersistence = {},
  } = options;

  const viewerRef = useRef<Viewer | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);

  // Initialize viewer
  useEffect(() => {
    // Check for existing viewer and clean up if needed
    if (viewerRef.current) {
      if (viewerRef.current.isDestroyed()) {
        console.debug(
          "[usePersistentViewer] Existing viewer is destroyed, cleaning up reference"
        );
        viewerRef.current = null;
        setViewer(null);
      } else {
        console.debug(
          "[usePersistentViewer] Viewer already exists and is valid"
        );
        return;
      }
    }

    const initialize = async () => {
      try {
        if (containerRef.current) {
          const viewer = new Viewer(containerRef.current, {
            infoBox: false,
            ...cesiumOptions,
          });
          viewerRef.current = viewer;
          setViewer(viewer);
          console.debug("[usePersistentViewer] Viewer initialized");
        }
      } catch (error) {
        console.error(
          "[usePersistentViewer] Viewer initialization error:",
          error
        );
        setViewer(null);
      }
    };

    initialize();

    return () => {
      try {
        if (viewerRef.current && !viewerRef.current.isDestroyed()) {
          console.debug("[usePersistentViewer] Destroying viewer");
          viewerRef.current.destroy();
        }
      } catch (error) {
        console.error("[usePersistentViewer] Error destroying viewer:", error);
      } finally {
        viewerRef.current = null;
        setViewer(null);
      }
    };
  }, [containerRef, cesiumOptions]);

  const { tilesetRef, tilesetReady } = useTileset(
    tilesetUrl,
    viewer,
    tilesetOptions
  );

  const { wasRestored, hasValidSavedState } = useCameraPersistence(viewer, {
    autoSave: true,
    saveDelay: 1000,
    autoRestore: true,
    ...cameraPersistence,
  });

  const shouldZoom = !hasValidSavedState() && !wasRestored;
  console.debug("[usePersistentViewer] Camera state check:", {
    hasValidSavedState: hasValidSavedState(),
    wasRestored,
    shouldZoom,
  });

  const { zoomToTileset } = useZoomToTilesetOnReady(
    viewer,
    tilesetRef,
    tilesetReady,
    shouldZoom
  );

  return {
    viewer,
    tileset: tilesetRef.current,
    tilesetRef,
    tilesetReady,
    zoomToTileset,
    wasRestored,
    hasValidSavedState,
  };
};
