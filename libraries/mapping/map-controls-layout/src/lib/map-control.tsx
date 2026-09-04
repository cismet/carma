import {
  createContext,
  ReactNode,
  useCallback,
  useMemo,
  useState,
  useContext,
} from "react";
import ControlRenderer from "./components/ControlRenderer";

export type Positions =
  | "topleft"
  | "topright"
  | "topcenter"
  | "bottomleft"
  | "bottomright"
  | "bottomcenter";

export type ControlComponent = {
  position: Positions;
  component: ReactNode;
  order: number;
};

interface ControlContextType {
  addControl: (component: ControlComponent) => void;
  /**
   * Swap a registered control for its re-rendered element in one state
   * update, instead of a remove followed by an add.
   */
  updateControl: (previous: ControlComponent, next: ControlComponent) => void;
  removeControl: (component: ControlComponent) => void;
  addCanvas: (component: ReactNode) => void;
  removeCanvas: () => void;
  controls: ControlComponent[];
}

const isSameControl = (a: ControlComponent, b: ControlComponent): boolean =>
  a.position === b.position &&
  a.order === b.order &&
  a.component === b.component;

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
  const [controls, setControls] = useState<ControlComponent[]>([]);
  const [canvas, setCanvas] = useState<ReactNode | null>(null);

  const addControl = useCallback((component: ControlComponent) => {
    setControls((prev) => [...prev, component]);
  }, []);

  const updateControl = useCallback(
    (previous: ControlComponent, next: ControlComponent) => {
      setControls((prev) => {
        const index = prev.findIndex((c) => isSameControl(c, previous));
        if (index < 0) return [...prev, next];
        const updated = [...prev];
        updated[index] = next;
        return updated;
      });
    },
    []
  );

  const removeControl = useCallback((component: ControlComponent) => {
    setControls((prev) => prev.filter((c) => !isSameControl(c, component)));
  }, []);

  const addCanvas = useCallback((component: ReactNode) => {
    setCanvas(component);
  }, []);

  const removeCanvas = useCallback(() => {
    setCanvas(null);
  }, []);

  // Every `Control` consumes this context; a fresh value object per render
  // would re-render all of them whenever one control re-registers.
  const contextValue = useMemo(
    () => ({
      addControl,
      updateControl,
      removeControl,
      controls,
      addCanvas,
      removeCanvas,
    }),
    [
      addControl,
      updateControl,
      removeControl,
      controls,
      addCanvas,
      removeCanvas,
    ]
  );

  return (
    <ControlContext.Provider value={contextValue}>
      {children}
      {/* Render ControlRenderer directly when there's no canvas */}
      {!canvas && controls.length > 0 && (
        <ControlRenderer controls={controls} />
      )}
    </ControlContext.Provider>
  );
}

export default ControlLayout;
