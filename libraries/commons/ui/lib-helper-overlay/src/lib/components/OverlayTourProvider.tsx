import { useState, createContext, useCallback, useMemo, useRef } from "react";
import type {
  OverlayTourContextType,
  OverlayHelperConfig,
  OverlayTourProviderProps,
} from "../..";
import LibHelperOverlay from "../lib-helper-overlay";

export const OverlayTourContext = createContext<OverlayTourContextType | null>(null);

export const OverlayTourProvider = ({
  children,
  showOverlay = false,
  closeOverlay,
  transparency = 0.8,
  color = "black",
}: OverlayTourProviderProps) => {
  const configsRef = useRef<OverlayHelperConfig[]>([]);
  const [secondaryKey, setSecondaryKey] = useState<null | string>(null);

  const addConfig = useCallback((config: OverlayHelperConfig) => {
    console.info("ADD OVERLAYCONFIG", config);
    configsRef.current = [...configsRef.current, config];
    // Manually trigger any side effects or UI updates if necessary
  }, []);

  const removeConfig = useCallback((config: OverlayHelperConfig) => {
    console.info("REMOVE OVERLAYCONFIG", config);
    configsRef.current = configsRef.current.filter((c) => c.id !== config.id);
    // Manually trigger any side effects or UI updates if necessary
  }, []);

  const contextValue = {
    configs: configsRef.current, // update only on showOverlay
    addConfig,
    removeConfig,
    setSecondaryKey,
    secondaryKey,
  };

  console.log("RENDER: [OVERLAY TOUR PROVIDER]");

  return (
    <OverlayTourContext.Provider value={contextValue} >
      {children}
      {showOverlay && (
        <LibHelperOverlay
          closeOverlay={closeOverlay}
          transparency={transparency}
          color={color}
        />
      )}
    </OverlayTourContext.Provider>
  );
};
