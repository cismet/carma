import { createContext, useContext, ReactNode } from "react";
import { Viewer } from "cesium";

import { usePersistentViewer } from "../hooks/usePersistentViewer";

interface CesiumViewerContextType {
  viewer: Viewer | null;
  zoomToTileset?: () => void;
}

const CesiumViewerContext = createContext<CesiumViewerContextType | undefined>(
  undefined
);

interface CesiumViewerProviderOptions {
  cesiumOptions?: Record<string, unknown>;
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

export const CesiumViewerProvider: React.FC<CesiumViewerProviderProps> = ({
  containerRef,
  options,
  children,
}) => {
  const { viewer, zoomToTileset } = usePersistentViewer(containerRef, options);

  const contextValue = {
    viewer,
    zoomToTileset,
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
