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

type Control = {
  position: Positions;
  component: ReactNode;
  order: number;
};

interface ControlContextType {
  addControl: (component: Control) => void;
  removeControl: (component: Control) => void;
  controls: Control[];
}

const ControlContext = createContext<ControlContextType | undefined>(undefined);

export function useControlContext() {
  const context = useContext(ControlContext);
  if (!context) {
    throw new Error("useControlContext must be used within a ControlProvider");
  }
  return context;
}

export function ControlProvider({ children }: { children: ReactNode }) {
  const [controls, setControls] = useState<Control[]>([]);

  const addControl = (component: Control) => {
    setControls((prev) => [...prev, component]);
  };

  const removeControl = (component: Control) => {
    setControls((prev) => prev.filter((c) => c !== component));
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
