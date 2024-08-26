import React, {
  useState,
  createContext,
  useContext,
  useLayoutEffect,
} from "react";
import { LibHelperOverlay } from "../lib-helper-overlay";
import {
  OverlayTourContext as OverlayTourContextSettings,
  OptionsOverlayHelper,
  OverlayHelperConfig,
} from "../..";
import { OverlayTourProviderProps } from "../utils/helperOverlay";

const OverlayTourContext = createContext<OverlayTourContextSettings>({
  configs: [],
  addConfig: (arg) => {},
  removeConfig: (arg) => {},
});

const useOverlayHelper = (
  content: string,
  options: OptionsOverlayHelper = {
    containerPos: "center",
    contentPos: "center",
  },
) => {
  const [ref, setRef] = useState<HTMLElement | null>(null);
  const { addConfig, removeConfig } = useContext(OverlayTourContext);
  const { containerPos, contentPos } = options;
  useLayoutEffect(() => {
    if (!ref) return;

    const config: OverlayHelperConfig = {
      el: ref,
      message: content,
      containerPos,
      contentPos,
    };
    addConfig(config);

    return () => {
      removeConfig(config);
    };
  }, [ref, content]);

  return setRef;
};

export default useOverlayHelper;

export const OverlayTourProvider = ({
  children,
  mode = "default",
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
      {mode === "tour" && (
        <LibHelperOverlay configs={configs} closeOverlay={closeOverlay} />
      )}
    </OverlayTourContext.Provider>
  );
};
