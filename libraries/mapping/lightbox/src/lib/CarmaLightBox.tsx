import type { ReactNode } from "react";
import { UIContextProvider } from "./LightBoxContextProvider";
import PhotoLightBox, { type PhotoLightBoxProps } from "./PhotoLightBox";

// Bundles the lightbox context provider and the viewer in a single mount.
// Mount it once where the map shell lives: it provides LightBoxContext /
// LightBoxDispatchContext to everything below it and renders the viewer, which
// stays idle (renders an empty div) until something sets visible = true.

export interface CarmaLightBoxProps extends PhotoLightBoxProps {
  children?: ReactNode;
  enabled?: boolean;
  appKey?: string;
  persistenceSettings?: Record<string, string[]>;
}

export const CarmaLightBox = ({
  children,
  enabled,
  appKey,
  persistenceSettings,
  ...viewerProps
}: CarmaLightBoxProps) => (
  <UIContextProvider
    enabled={enabled}
    appKey={appKey}
    persistenceSettings={persistenceSettings}
  >
    {children}
    <PhotoLightBox {...viewerProps} />
  </UIContextProvider>
);

export default CarmaLightBox;
