import { createContext, useContext, ReactNode, useState, useMemo } from "react";
import { Viewer } from "cesium";

import { usePersistentViewer } from "../hooks/usePersistentViewer";

interface CesiumViewerContextType {
  viewer: Viewer | null;
  zoomToTileset?: () => void;
  setHQMode?: (enabled: boolean) => void;
  hqMode: boolean;
}

const CesiumViewerContext = createContext<CesiumViewerContextType | undefined>(
  undefined
);

interface CesiumViewerProviderOptions {
  cesiumOptions?: Viewer.ConstructorOptions;
  tilesetUrl: string;
  tilesetOptions?: Record<string, unknown>;
  cameraPersistence?: {
    autoSave?: boolean;
    saveDelay?: number;
    autoRestore?: boolean;
  };
}

interface CesiumViewerProviderProps {
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  options: CesiumViewerProviderOptions;
  children: ReactNode | ((contextValue: CesiumViewerContextType) => ReactNode);
}

export const CesiumViewerProvider = ({
  containerRef,
  options,
  children,
}: CesiumViewerProviderProps) => {
  const [hqMode, setHqModeState] = useState(true);

  const normalizedOptions = useMemo(() => {
    return {
      ...options,
      cesiumOptions: {
        ...options.cesiumOptions,
        // init with high quality mode by default
        useBrowserRecommendedResolution: false,
        resolutionScale: 1,
      },
    };
  }, [options]);

  const { viewer, zoomToTileset } = usePersistentViewer(
    containerRef,
    normalizedOptions
  );
  const setHQMode = (enabled: boolean) => {
    if (viewer && !viewer.isDestroyed()) {
      setHqModeState(enabled);
      // Always disable browser recommended resolution and control manually
      viewer.useBrowserRecommendedResolution = false;

      if (enabled) {
        // HQ mode: native resolution
        viewer.resolutionScale = 1;
      } else {
        // LQ mode: reduce resolution by device pixel ratio
        viewer.resolutionScale = 1 / window.devicePixelRatio;
      }
    }
  };

  const contextValue = {
    viewer,
    zoomToTileset,
    setHQMode,
    hqMode,
  };

  return (
    <CesiumViewerContext.Provider value={contextValue}>
      {typeof children === "function" ? children(contextValue) : children}
    </CesiumViewerContext.Provider>
  );
};

export const useCesiumViewer = (): CesiumViewerContextType => {
  const context = useContext(CesiumViewerContext);
  if (context === undefined) {
    throw new Error(
      "useCesiumViewer must be used within a CesiumViewerProvider"
    );
  }
  return context;
};
