import { lazy, Suspense, type ReactNode } from "react";
import {
  OBLIQUE_CONFIG,
  CAMERA_ID_TO_DIRECTION,
} from "../config/oblique.config";

// Lazy load the entire ObliqueProvider
const ObliqueProvider = lazy(() =>
  import("@carma-mapping/cesium-oblique-mode").then((module) => ({
    default: module.ObliqueProvider,
  }))
);

interface ObliqueProviderLazyProps {
  children: ReactNode;
}

/**
 * Lazy-loaded wrapper for ObliqueProvider
 * Only loads the oblique viewer code when this component is mounted
 * Saves several MB in the initial bundle
 */
export const ObliqueProviderLazy = ({ children }: ObliqueProviderLazyProps) => {
  return (
    <Suspense fallback={<div>Loading Oblique Mode...</div>}>
      <ObliqueProvider
        config={OBLIQUE_CONFIG}
        fallbackDirectionConfig={CAMERA_ID_TO_DIRECTION}
      >
        {children}
      </ObliqueProvider>
    </Suspense>
  );
};
