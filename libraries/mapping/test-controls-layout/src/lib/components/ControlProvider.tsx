import {
  createContext,
  ReactNode,
  useState,
  useContext,
  useEffect,
} from "react";

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
  controls: ControlComponent[];
}

const ControlContext = createContext<ControlContextType | undefined>(undefined);

export function useControlContext() {
  const context = useContext(ControlContext);
  if (!context) {
    throw new Error("useControlContext must be used within a ControlProvider");
  }
  return context;
}

function ControlLayout({ children }: { children: ReactNode }) {
  const [controls, setControls] = useState<ControlComponent[]>([]);

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

  return (
    <ControlContext.Provider
      value={{
        addControl,
        removeControl,
        controls,
      }}
    >
      {children}
    </ControlContext.Provider>
  );
}

export default ControlLayout;
