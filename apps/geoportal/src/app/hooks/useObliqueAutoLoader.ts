import { useEffect } from "react";
import { useObliqueLoader } from "../contexts/ObliqueLoaderContext";

/**
 * Hook that automatically loads ObliqueProvider when oblique mode is requested
 * This should be used in components that need oblique functionality
 */
export const useObliqueAutoLoader = (shouldLoad: boolean) => {
  const { isObliqueLoaded, loadOblique } = useObliqueLoader();

  useEffect(() => {
    if (shouldLoad && !isObliqueLoaded) {
      console.log("[ObliqueAutoLoader] Auto-loading oblique mode...");
      loadOblique();
    }
  }, [shouldLoad, isObliqueLoaded, loadOblique]);

  return isObliqueLoaded;
};
