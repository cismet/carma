import { createContext, useContext, useState, ReactNode } from "react";

interface DatasheetContextType {
  isDatasheetView: boolean;
  setIsDatasheetView: (value: boolean) => void;
  toggleDatasheetView: () => void;
}

const DatasheetContext = createContext<DatasheetContextType | null>(null);

export const DatasheetProvider = ({ children }: { children: ReactNode }) => {
  const [isDatasheetView, setIsDatasheetView] = useState(false);

  const toggleDatasheetView = () => {
    setIsDatasheetView((prev) => !prev);
  };

  return (
    <DatasheetContext.Provider
      value={{ isDatasheetView, setIsDatasheetView, toggleDatasheetView }}
    >
      {children}
    </DatasheetContext.Provider>
  );
};

export const useDatasheet = () => {
  const context = useContext(DatasheetContext);
  if (!context) {
    throw new Error("useDatasheet must be used within a DatasheetProvider");
  }
  return context;
};
