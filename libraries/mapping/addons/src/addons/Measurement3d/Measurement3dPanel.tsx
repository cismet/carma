import { useEffect, useRef } from "react";
import { setMeasurement3dPanelHost } from "./measurement3d-panel-host";

/**
 * The ribbon under the row: an empty host the addon fills with the
 * annotation toolbar through a portal, see `measurement3d-panel-host`.
 */
export const Measurement3dInteractionPanel = () => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    setMeasurement3dPanelHost(hostRef.current);
    return () => {
      setMeasurement3dPanelHost(null);
    };
  }, []);
  return <div ref={hostRef} data-test-id="measurement3d-panel" />;
};
