import { useState, createContext, useCallback } from "react";
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
  const [configs, setConfigs] = useState<OverlayHelperConfig[]>([]);
  const [secondaryKey, setSecondaryKey] = useState<null | string>(null);

  const addConfig = useCallback((config: OverlayHelperConfig) => {
    console.log("ADD OVERLAYCONFIG", config);
    setConfigs((prevConfigs) => [...prevConfigs, config]);
  }, []);

  const removeConfig = useCallback((config: OverlayHelperConfig) => {
    console.log("REMOVE OVERLAYCONFIG", config);
    setConfigs((prevConfigs) => prevConfigs.filter((c) => c !== config));
  }, []);


  console.log("RENDER: [OVERLAY TOUR PROVIDER]");

  return (
    <OverlayTourContext.Provider
      value={{
        configs,
        addConfig,
        removeConfig,
        setSecondaryKey,
        secondaryKey,
      }}
    >
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
