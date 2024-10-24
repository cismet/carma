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
  showSecondaryWithKey: null,
  setSecondaryWithKey: (key) => {},
  showOverlay: (show) => {},
});

export const OverlayTourProvider = ({
  children,
  show = false,
  closeOverlay = () => {},
  transparency = 0.8,
  color = "black",
}: OverlayTourProviderProps) => {
  const [configs, setConfigs] = useState<OverlayHelperConfig[]>([]);
  const [secondaryKey, setSecondaryKey] = useState<null | string>(null);

  const addConfig = (config) => {
    setConfigs((prevConfigs) => [...prevConfigs, config]);
  };

  const removeConfig = (config) => {
    setConfigs((prevConfigs) => prevConfigs.filter((c) => c !== config));
  };

  const setSecondaryKeyHandler = (key: string | null) => {
    setSecondaryKey(key);
  };

  const showOverlayHandler = (shouldShow: boolean) => {
    if (shouldShow) {
      show = true;
    } else {
      closeOverlay();
    }
  };

  return (
    <OverlayTourContext.Provider
      value={{
        configs,
        addConfig,
        removeConfig,
        showSecondaryWithKey: secondaryKey,
        setSecondaryWithKey: setSecondaryKeyHandler,
        showOverlay: showOverlayHandler,
      }}
    >
      {children}
      {show && (
        <LibHelperOverlay
          configs={configs}
          closeOverlay={closeOverlay}
          transparency={transparency}
          color={color}
          showSecondaryWithKey={setSecondaryKeyHandler}
          openedSecondaryKey={secondaryKey}
          showOverlay={showOverlayHandler}
        />
      )}
    </OverlayTourContext.Provider>
  );
};
