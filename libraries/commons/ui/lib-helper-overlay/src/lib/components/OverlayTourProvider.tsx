import { useState, createContext, useCallback, useMemo, useRef, memo } from "react";
import type {
  OverlayTourContextType,
  OverlayHelperConfig,
  OverlayTourProviderProps,
} from "../..";
import LibHelperOverlay from "../lib-helper-overlay";

export const OverlayTourContext = createContext<OverlayTourContextType>({
  configs: [],
  addConfig: () => {},
  removeConfig: () => {},
  setSecondaryKey: () => {},
  secondaryKey: null,
});

export const OverlayTourProvider = ({
  children,
  showOverlay = false,
  closeOverlay,
  transparency = 0.8,
  color = "black",
}: OverlayTourProviderProps) => {
  const [prevConfigs, setConfigs] = useState<OverlayHelperConfig[]>([]);
  const [secondaryKey, setSecondaryKey] = useState<null | string>(null);

  const addConfig = useCallback((config: OverlayHelperConfig) => {
    console.debug("ADD OVERLAYCONFIG", config);
    setConfigs((prevConfigs) => [...prevConfigs, config]);
  }, []);

  const removeConfig = useCallback((config: OverlayHelperConfig) => {
    console.debug("REMOVE OVERLAYCONFIG", config);
    setConfigs(prevConfigs.filter((c) => c.key !== config.key));
  }, []);

  const contextValue = useMemo(() => ({
    configs: prevConfigs,
    addConfig,
    removeConfig,
    setSecondaryKey,
    secondaryKey,
  }),
    [prevConfigs, addConfig, removeConfig, setSecondaryKey, secondaryKey],
  );

  console.log("RENDER: [OVERLAY TOUR PROVIDER], configs", prevConfigs);

  const memoizedChildren = useMemo(() => children, [children]);

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
