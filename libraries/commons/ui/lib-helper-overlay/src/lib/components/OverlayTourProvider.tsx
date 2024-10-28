import { useState, createContext } from "react";
import {
  type OverlayTourContextType,
  type OverlayHelperConfig,
  type OverlayTourProviderProps,
  LibHelperOverlay,
} from "../..";

export const OverlayTourContext = createContext<OverlayTourContextType>({
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

  const setSecondaryWithKey = (key: string | null) => {
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
        setSecondaryWithKey,
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
          showSecondaryWithKey={setSecondaryWithKey}
          openedSecondaryKey={secondaryKey}
          showOverlay={showOverlayHandler}
        />
      )}
    </OverlayTourContext.Provider>
  );
};
