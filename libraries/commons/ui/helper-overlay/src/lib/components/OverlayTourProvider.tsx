import {
  useState,
  createContext,
  useMemo,
  useCallback,
  useContext,
} from "react";
import {
  type OverlayTourContextType,
  type OverlayHelperConfig,
  type OverlayTourProviderProps,
  LibHelperOverlay,
} from "../..";

export const OverlayTourContext = createContext<OverlayTourContextType>({
  addConfig: (arg) => {},
  removeConfig: (arg) => {},
  showSecondaryWithKey: null,
  setSecondaryWithKey: (key) => {},
  showOverlayHandler: () => {},
  closeOverlayHandler: () => {},
  setShowOverlayHandler: (show) => {},
});

export const OverlayTourProvider = ({
  children,
  transparency = 0.8,
  color = "black",
  showOnLoad = false,
}: OverlayTourProviderProps) => {
  const [configs, setConfigs] = useState<OverlayHelperConfig[]>([]);
  const [secondaryKey, setSecondaryKey] = useState<null | string>(null);
  const [showOverlay, setShowOverlay] = useState<boolean>(showOnLoad);

  const addConfig = useCallback((config) => {
    setConfigs((prevConfigs) => [...prevConfigs, config]);
  }, []);

  const removeConfig = useCallback((config) => {
    setConfigs((prevConfigs) => prevConfigs.filter((c) => c !== config));
  }, []);

  const setSecondaryWithKey = useCallback((key: string | null) => {
    setSecondaryKey(key);
  }, []);

  const closeOverlayHandler = useCallback(() => {
    setShowOverlay(false);
    setSecondaryKey(null);
  }, []);

  const showOverlayHandler = useCallback(() => {
    setShowOverlay(true);
  }, []);

  const setShowOverlayHandler = useCallback((shouldShow: boolean) => {
    setShowOverlay(shouldShow);
    if (!shouldShow) {
      setSecondaryKey(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      setShowOverlayHandler,
      showOverlayHandler,
      closeOverlayHandler,
      addConfig,
      removeConfig,
      showSecondaryWithKey: secondaryKey,
      setSecondaryWithKey,
    }),
    [
      secondaryKey,
      addConfig,
      removeConfig,
      setSecondaryWithKey,
      setShowOverlayHandler,
      showOverlayHandler,
      closeOverlayHandler,
    ]
  );

  return (
    <OverlayTourContext.Provider value={value}>
      {children}
      {showOverlay && (
        <LibHelperOverlay
          configs={configs}
          closeOverlay={closeOverlayHandler}
          transparency={transparency}
          color={color}
          showSecondaryWithKey={setSecondaryWithKey}
          openedSecondaryKey={secondaryKey}
          showOverlay={setShowOverlayHandler}
        />
      )}
    </OverlayTourContext.Provider>
  );
};

export const useOverlayTourContext = () => {
  const context = useContext(OverlayTourContext);
  if (!context) {
    throw new Error(
      "useOverlayTourContext must be used within an OverlayTourProvider"
    );
  }
  return context;
};
export default OverlayTourProvider;
