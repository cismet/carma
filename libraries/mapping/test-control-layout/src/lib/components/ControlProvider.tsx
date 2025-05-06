import {
  createContext,
  ReactNode,
  useState,
  useContext,
  useEffect,
} from "react";

export type Positions =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

type Control = {
  position: Positions;
  component: ReactNode;
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

  useEffect(() => {
    console.log("Control components:", controls);
  }, [controls]);

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
