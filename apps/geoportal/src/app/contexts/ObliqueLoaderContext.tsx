import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

interface ObliqueLoaderContextType {
  isObliqueLoaded: boolean;
  loadOblique: () => void;
  unloadOblique: () => void;
}

const ObliqueLoaderContext = createContext<
  ObliqueLoaderContextType | undefined
>(undefined);

export const ObliqueLoaderProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [isObliqueLoaded, setIsObliqueLoaded] = useState(false);

  const loadOblique = useCallback(() => {
    console.log("[ObliqueLoader] Loading oblique mode...");
    setIsObliqueLoaded(true);
  }, []);

  const unloadOblique = useCallback(() => {
    console.log("[ObliqueLoader] Unloading oblique mode...");
    setIsObliqueLoaded(false);
  }, []);

  return (
    <ObliqueLoaderContext.Provider
      value={{ isObliqueLoaded, loadOblique, unloadOblique }}
    >
      {children}
    </ObliqueLoaderContext.Provider>
  );
};

export const useObliqueLoader = () => {
  const context = useContext(ObliqueLoaderContext);
  if (!context) {
    throw new Error(
      "useObliqueLoader must be used within ObliqueLoaderProvider"
    );
  }
  return context;
};
