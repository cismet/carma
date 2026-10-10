import {
  createContext,
  ReactNode,
  useCallback,
  useMemo,
  useState,
  useContext,
} from "react";
import ControlRenderer from "./components/ControlRenderer";
import {
  createControlRegistry,
  type ControlRegistry,
} from "./control-registry";

export type Positions =
  | "topleft"
  | "topright"
  | "topcenter"
  | "bottomleft"
  | "bottomright"
  | "bottomcenter";

interface ControlContextType {
  registry: ControlRegistry;
  addCanvas: () => void;
  removeCanvas: () => void;
}

interface ControlLayoutProps {
  children: ReactNode;
  ifStorybook?: boolean;
  onResponsiveCollapse?: (collapseEvent: any) => void;
  onHeightResize?: (height: number) => void;
  debugMode?: boolean;
}

const ControlContext = createContext<ControlContextType | undefined>(undefined);

export function useControlContext() {
  const context = useContext(ControlContext);
  if (!context) {
    throw new Error("useControlContext must be used within a ControlProvider");
  }
  return context;
}

function ControlLayout({ children }: ControlLayoutProps) {
  // Controls register into the registry instead of layout state, so a
  // control's content change never re-renders the layout or its consumers.
  const [registry] = useState(createControlRegistry);
  const [hasCanvas, setHasCanvas] = useState(false);

  const addCanvas = useCallback(() => {
    setHasCanvas(true);
  }, []);

  const removeCanvas = useCallback(() => {
    setHasCanvas(false);
  }, []);

  const contextValue = useMemo(
    () => ({ registry, addCanvas, removeCanvas }),
    [registry, addCanvas, removeCanvas]
  );

  return (
    <ControlContext.Provider value={contextValue}>
      {children}
      {/* Render ControlRenderer directly when there's no canvas */}
      {!hasCanvas && <ControlRenderer registry={registry} />}
    </ControlContext.Provider>
  );
}

export default ControlLayout;
