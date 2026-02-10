/**
 * DatasheetContext - Engine-agnostic context for datasheet open/close state.
 *
 * Controls whether the UI shows the full map view or the datasheet view
 * (full-viewport data with a mini-map overlay). No map refs, no URL
 * manipulation, no feature data; just a boolean toggle.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

export interface DatasheetContextType {
  /** Whether a DatasheetProvider is mounted (false when using default context) */
  isEnabled: boolean;
  isDatasheetOpen: boolean;
  toggleDatasheet: () => void;
  openDatasheet: () => void;
  closeDatasheet: () => void;
}

const defaultContext: DatasheetContextType = {
  isEnabled: false,
  isDatasheetOpen: false,
  toggleDatasheet: () => {},
  openDatasheet: () => {},
  closeDatasheet: () => {},
};

export const DatasheetContext =
  createContext<DatasheetContextType>(defaultContext);

interface DatasheetProviderProps {
  children: ReactNode;
}

export const DatasheetProvider = ({ children }: DatasheetProviderProps) => {
  const [isDatasheetOpen, setIsDatasheetOpen] = useState(false);

  const toggleDatasheet = useCallback(() => {
    setIsDatasheetOpen((prev) => !prev);
  }, []);

  const openDatasheet = useCallback(() => {
    setIsDatasheetOpen(true);
  }, []);

  const closeDatasheet = useCallback(() => {
    setIsDatasheetOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      isEnabled: true,
      isDatasheetOpen,
      toggleDatasheet,
      openDatasheet,
      closeDatasheet,
    }),
    [isDatasheetOpen, toggleDatasheet, openDatasheet, closeDatasheet]
  );

  return (
    <DatasheetContext.Provider value={value}>
      {children}
    </DatasheetContext.Provider>
  );
};

export const useDatasheet = () => useContext(DatasheetContext);
