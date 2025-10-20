import { useContext } from "react";
import { CesiumOverlayContext } from "./CesiumOverlayProvider";

/**
 * Hook to access CesiumOverlay context
 *
 * @throws Error if used outside CesiumOverlayProvider
 */
export function useCesiumOverlay() {
  const context = useContext(CesiumOverlayContext);

  if (!context) {
    throw new Error(
      "useCesiumOverlay must be used within CesiumOverlayProvider"
    );
  }

  return context;
}
