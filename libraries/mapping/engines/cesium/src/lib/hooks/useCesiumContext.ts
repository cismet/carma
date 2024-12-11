import { useContext } from "react";
import { CesiumContext } from "../CesiumContext";

export const useCesiumContext = () => {
  const context = useContext(CesiumContext);

  if (window.CESIUM_BASE_URL === undefined) {
    throw new Error(
      "window.CESIUM_BASE_URL is undefined, use setupCesiumEnvironment in app root"
    );
  }

  if (!context) {
    throw new Error("useViewer must be used within a CesiumContextProvider");
  }
  return context;
};
