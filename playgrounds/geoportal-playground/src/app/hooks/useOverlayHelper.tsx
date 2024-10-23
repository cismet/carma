import { useState, createContext, useContext, useLayoutEffect } from 'react';
import OverlayHelperHightlighter from '../components/OverlayHelperHightlighter';
import { useSelector } from 'react-redux';
import { getMode } from '../store/slices/ui';

type OverlayTourAction = (arg: OverlayHelperConfig) => void;

type OverlayTourContext = {
  configs: OverlayHelperConfig[];
  addConfig: OverlayTourAction;
  removeConfig: OverlayTourAction;
};

const OverlayTourContext = createContext<OverlayTourContext>({
  configs: [],
  addConfig: (arg) => {},
  removeConfig: (arg) => {},
});

export type PositionOverlayHelper =
  | 'center'
  | 'top'
  | 'left'
  | 'right'
  | 'bottom';

export interface OverlayHelperConfig {
  el: HTMLElement;
  message: string;
  containerPos: PositionOverlayHelper;
  contentPos: PositionOverlayHelper;
}

export type OptionsOverlayHelper = {
  containerPos?: PositionOverlayHelper;
  contentPos?: PositionOverlayHelper;
};

const useOverlayHelper = (
  content: string,
  options: OptionsOverlayHelper = {
    containerPos: 'center',
    contentPos: 'center',
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

export const OverlayTourProvider = ({ children }) => {
  const [configs, setConfigs] = useState<OverlayHelperConfig[]>([]);
  const mode = useSelector(getMode);

  const addConfig = (config) => {
    setConfigs((prevConfigs) => [...prevConfigs, config]);
  };

  const removeConfig = (config) => {
    setConfigs((prevConfigs) => prevConfigs.filter((c) => c !== config));
  };

  return (
    <OverlayTourContext.Provider value={{ configs, addConfig, removeConfig }}>
      {children}
      {mode === 'tour' && <OverlayHelperHightlighter configs={configs} />}
    </OverlayTourContext.Provider>
  );
};
