import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import {
  WUPPERTAL_TERRAIN_SOURCE_ID,
  getCameraRestriction,
} from "@carma-mapping/engines/maplibre";

import type { ObliqueDataset } from "../../core/types";
import {
  enterObliqueView,
  ensureTerrain,
  freePitch,
  leaveObliqueView,
  lockPitch,
  releaseCamera,
  type CameraFlight,
} from "../utils/obliqueCamera";

/**
 * The map's camera while the viewer is on: tilted in on switch-on, held at
 * the browsing tilt in between, tilted out on switch-off, and handed back
 * to whoever restricted it before.
 *
 * Terrain is switched on for the duration when the style has the source,
 * since the camera altitudes of the images are absolute and a flat map
 * would put every image a hillside too low. On the way out it goes off
 * again only when the map is restricted afterwards; a free camera wants
 * relief anyway.
 */

export type CameraPhase = "idle" | "entering" | "active" | "leaving";

type Session = {
  savedFovDeg: number;
  terrainByUs: boolean;
  flight: CameraFlight | null;
};

type UseObliqueCameraModeOptions = {
  map: MaplibreMap | null;
  enabled: boolean;
  dataset: ObliqueDataset;
  terrainSourceId?: string;
};

export const useObliqueCameraMode = ({
  map,
  enabled,
  dataset,
  terrainSourceId = WUPPERTAL_TERRAIN_SOURCE_ID,
}: UseObliqueCameraModeOptions) => {
  const [phase, setPhase] = useState<CameraPhase>("idle");
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    if (!map) return undefined;

    if (enabled) {
      const session: Session = {
        savedFovDeg: map.getVerticalFieldOfView(),
        terrainByUs: ensureTerrain(map, terrainSourceId),
        flight: null,
      };
      sessionRef.current = session;
      // the override first: while restricted the map holds maxPitch 0, and
      // any pitch set before the override would be clamped away
      freePitch(map);
      map.scrollZoom.disable();
      setPhase("entering");

      let cancelled = false;
      const flight = enterObliqueView(map, dataset);
      session.flight = flight;
      flight.done.then(() => {
        session.flight = null;
        if (cancelled) return;
        lockPitch(map, dataset.pitchDeg);
        setPhase("active");
      });

      return () => {
        cancelled = true;
        flight.cancel();
      };
    }

    const session = sessionRef.current;
    if (!session) return undefined;
    sessionRef.current = null;
    setPhase("leaving");
    freePitch(map);

    let cancelled = false;
    const flight = leaveObliqueView(map, dataset, session.savedFovDeg);
    flight.done.then(() => {
      releaseCamera(map);
      map.scrollZoom.enable();
      if (session.terrainByUs && getCameraRestriction(map)?.restricted) {
        map.setTerrain(null);
      }
      if (!cancelled) setPhase("idle");
    });
    return () => {
      // a switch-on during the tilt-out lets the tilt-out finish; the new
      // session then starts from wherever the camera is
      cancelled = true;
    };
  }, [map, enabled, dataset, terrainSourceId]);

  // the map going away, or the addon leaving the route while on
  useEffect(() => {
    if (!map) return undefined;
    return () => {
      const session = sessionRef.current;
      if (!session) return;
      sessionRef.current = null;
      session.flight?.cancel();
      try {
        releaseCamera(map);
        map.scrollZoom.enable();
        if (session.terrainByUs) map.setTerrain(null);
        map.setVerticalFieldOfView(session.savedFovDeg);
      } catch {
        // the map may already be removed
      }
    };
  }, [map]);

  /** let a flight to an image take the image's tilt */
  const freeCamera = useCallback(() => {
    if (map && sessionRef.current) freePitch(map);
  }, [map]);

  /** back to the browsing tilt lock once the camera is level with it again */
  const lockCamera = useCallback(() => {
    if (map && sessionRef.current) lockPitch(map, dataset.pitchDeg);
  }, [map, dataset.pitchDeg]);

  return { phase, freeCamera, lockCamera };
};
