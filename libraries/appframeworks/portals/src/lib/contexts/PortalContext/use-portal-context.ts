import { useContext } from "react";
import { PortalContext, type PortalContextType } from "./PortalContext";

export const usePortalContext = (): PortalContextType => {
  const context = useContext(PortalContext);
  if (!context) {
    throw new Error(
      "usePortalContext must be used within PortalContextProvider"
    );
  }
  return context;
};
