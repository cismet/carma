import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import localforage from "localforage";
import { APP_CONFIG } from "../config/appConfig";

interface DisplayOptions {
  showHausnummern: boolean;
  setShowHausnummern: (value: boolean) => void;
}

const HAUSNUMMERN_KEY = `${APP_CONFIG.appKey}.display.hausnummern`;

const DisplayOptionsContext = createContext<DisplayOptions>({
  showHausnummern: true,
  setShowHausnummern: () => {},
});

const usePersistedFlag = (key: string, initial: boolean) => {
  const [value, setValueState] = useState(initial);
  useEffect(() => {
    localforage.getItem<boolean>(key).then((stored) => {
      if (typeof stored === "boolean") setValueState(stored);
    });
  }, [key]);
  const setValue = (next: boolean) => {
    setValueState(next);
    localforage.setItem(key, next);
  };
  return [value, setValue] as const;
};

export const DisplayOptionsProvider = ({ children }: { children: ReactNode }) => {
  const [showHausnummern, setShowHausnummern] = usePersistedFlag(HAUSNUMMERN_KEY, true);

  return (
    <DisplayOptionsContext.Provider value={{ showHausnummern, setShowHausnummern }}>
      {children}
    </DisplayOptionsContext.Provider>
  );
};

export const useDisplayOptions = () => useContext(DisplayOptionsContext);
