import { useEffect, useRef } from "react";
import type { Layer } from "@carma-mapping/layers";
import { setMeasurement3dPanelHost } from "./measurement3d-panel-host";

const PANEL_STYLE = { minHeight: 40 } as const;

/**
 * The ribbon under the row: an empty host the addon fills with the
 * annotation toolbar through a portal, see `measurement3d-panel-host`.
 */
export const Measurement3dInteractionPanel = (_props: { layer: Layer }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    setMeasurement3dPanelHost(hostRef.current);
    return () => {
      setMeasurement3dPanelHost(null);
    };
  }, []);
  return (
    <div ref={hostRef} style={PANEL_STYLE} data-test-id="measurement3d-panel" />
  );
};
