import React, {
  useState,
  createContext,
  useContext,
  useLayoutEffect,
} from "react";
// import OverlayHelperHightlighter from '../components/OverlayHelperHightlighter';
import { useSelector } from "react-redux";
import { getMode } from "../store/slices/ui";
import { LibHelperOverlay } from "../lib-helper-overlay";
import {
  OverlayTourContext,
  OptionsOverlayHelper,
  OverlayHelperConfig,
} from "../..";

const OverlayTourContext = createContext<OverlayTourContext>({
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

type OverlayTourProviderProps = {
  children: JSX.Element;
  mode: string;
  closeOverlay: ()=> {}
};

export const OverlayTourProvider = ({
  children,
  mode = "default",
  closeOverlay:
}: OverlayTourProviderProps) => {
  const [configs, setConfigs] = useState<OverlayHelperConfig[]>([]);
  // const mode = useSelector(getMode);

  const addConfig = (config) => {
    setConfigs((prevConfigs) => [...prevConfigs, config]);
  };

  const removeConfig = (config) => {
    setConfigs((prevConfigs) => prevConfigs.filter((c) => c !== config));
  };

  return (
    <OverlayTourContext.Provider value={{ configs, addConfig, removeConfig }}>
      {children}
      {mode === "tour" && <LibHelperOverlay configs={configs} />}
    </OverlayTourContext.Provider>
  );
};
