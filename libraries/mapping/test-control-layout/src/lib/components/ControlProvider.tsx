import {
  createContext,
  ReactNode,
  useState,
  useContext,
  useEffect,
} from "react";

interface ControlContextType {
  setMain: (component: ReactNode) => void;
  addControl: (component: ReactNode) => void;
  removeControl: (component: ReactNode) => void;
  main: ReactNode | null;
  controls: ReactNode[];
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
  const [main, setMain] = useState<ReactNode | null>(null);
  const [controls, setControls] = useState<ReactNode[]>([]);

  // Log when components change
  useEffect(() => {
    console.log("Main component set:", main !== null);
  }, [main]);

  useEffect(() => {
    console.log("Control components count:", controls.length);
    console.log("Control components:", controls);
  }, [controls]);

  const addControl = (component: ReactNode) => {
    setControls((prev) => [...prev, component]);
  };

  const removeControl = (component: ReactNode) => {
    setControls((prev) => prev.filter((c) => c !== component));
  };

  return (
    <ControlContext.Provider
      value={{
        setMain,
        addControl,
        removeControl,
        main,
        controls,
      }}
    >
      {children}
    </ControlContext.Provider>
  );
}
