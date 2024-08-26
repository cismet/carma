import React, { useState, createContext } from "react";
import {
  OverlayTourContext as OverlayTourContextSettings,
  OverlayHelperConfig,
  LibHelperOverlay,
  OverlayTourProviderProps,
} from "../..";

export const OverlayTourContext = createContext<OverlayTourContextSettings>({
  configs: [],
  addConfig: (arg) => {},
  removeConfig: (arg) => {},
});

export const OverlayTourProvider = ({
  children,
  mode = false,
  closeOverlay = () => {
    console.log("close callback");
  },
}: OverlayTourProviderProps) => {
  const [configs, setConfigs] = useState<OverlayHelperConfig[]>([]);

  const addConfig = (config) => {
    setConfigs((prevConfigs) => [...prevConfigs, config]);
  };

  const removeConfig = (config) => {
    setConfigs((prevConfigs) => prevConfigs.filter((c) => c !== config));
  };

  return (
    <OverlayTourContext.Provider value={{ configs, addConfig, removeConfig }}>
      {children}
      {mode && (
        <LibHelperOverlay configs={configs} closeOverlay={closeOverlay} />
      )}
    </OverlayTourContext.Provider>
  );
};
