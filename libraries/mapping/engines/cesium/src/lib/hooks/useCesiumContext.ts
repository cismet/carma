import { useContext } from "react";
import { CesiumContext } from "../CesiumContext";

export const useCesiumContext = () => {
  const context = useContext(CesiumContext);
  if (!context) {
    throw new Error("useViewer must be used within a CesiumContextProvider");
  }
  return context;
};
