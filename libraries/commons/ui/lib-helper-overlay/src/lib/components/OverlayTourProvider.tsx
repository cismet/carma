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
  showOverlay = false,
  closeOverlay = () => {
    console.log("close callback");
  },
  transparency = 0.8,
  color = "black",
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
      {showOverlay && (
        <LibHelperOverlay
          configs={configs}
          closeOverlay={closeOverlay}
          transparency={transparency}
          color={color}
        />
      )}
    </OverlayTourContext.Provider>
  );
};
