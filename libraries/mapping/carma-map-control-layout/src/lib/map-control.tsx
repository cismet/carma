import { createContext, ReactNode, useState, useContext } from "react";
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
  removeControl: (component: ControlComponent) => void;
  addCanvas: (component: ReactNode) => void;
  removeCanvas: () => void;
  controls: ControlComponent[];
}

interface ControlLayoutProps {
  children: ReactNode;
  ifStorybook?: boolean;
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

  const addControl = (component: ControlComponent) => {
    setControls((prev) => [...prev, component]);
  };

  const removeControl = (component: ControlComponent) => {
    setControls((prev) =>
      prev.filter(
        (c) =>
          !(
            c.position === component.position &&
            c.order === component.order &&
            c.component === component.component
          )
      )
    );
  };

  const addCanvas = (component: ReactNode) => {
    setCanvas(component);
  };

  const removeCanvas = () => {
    setCanvas(null);
  };

  return (
    <ControlContext.Provider
      value={{
        addControl,
        removeControl,
        controls,
        addCanvas,
        removeCanvas,
      }}
    >
      {children}
      {/* Render ControlRenderer directly when there's no canvas */}
      {!canvas && controls.length > 0 && (
        <div
          style={{
            height: "100%",
            position: "relative",
            width: "100%",
          }}
        >
          <ControlRenderer controls={controls} />
        </div>
      )}
    </ControlContext.Provider>
  );
}

export default ControlLayout;
