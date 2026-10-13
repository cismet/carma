import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { Degrees } from "@carma-units";
import { settleToPitch } from "../utils/flyToImage";

import {
  WUPPERTAL_TERRAIN_SOURCE_ID,
  getCameraRestriction,
} from "@carma-mapping/engines/maplibre";

import type { ObliqueDataset } from "../../core/types";
import type { ObliqueViewerConfig } from "../../core/config";
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
  restoredView?: boolean;
};

type UseObliqueCameraModeOptions = {
  map: MaplibreMap | null;
  enabled: boolean;
  dataset: ObliqueDataset;
  pitchDeg?: Degrees;
  /** Optional initial browsing heading; later updates never restart entry. */
  entryBearingDeg?: Degrees;
  /** Preview/other camera flights retain their physical angle until browsing resumes. */
  suspended?: boolean;
  /** A saved photo will place the camera directly after its catalog resolves. */
  skipEntryFlight?: boolean;
  /** Restore an already active browsing view without applying entry defaults. */
  resumeInitialView?: boolean;
  initialView?: ObliqueViewerConfig["initialView"];
  terrainSourceId?: string;
  onBeforeLeave?: () => CameraFlight | undefined;
};

export const useObliqueCameraMode = ({
  map,
  enabled,
  dataset,
  pitchDeg,
  entryBearingDeg,
  suspended = false,
  skipEntryFlight = false,
  resumeInitialView = false,
  initialView,
  terrainSourceId = WUPPERTAL_TERRAIN_SOURCE_ID,
  onBeforeLeave,
}: UseObliqueCameraModeOptions) => {
  const [phase, setPhase] = useState<CameraPhase>("idle");
  const sessionRef = useRef<Session | null>(null);
  const pendingReturnRef = useRef<CameraFlight | null>(null);
  const datasetRef = useRef(dataset);
  datasetRef.current = dataset;
  const requestedPitch = pitchDeg ?? (dataset.pitchDeg as Degrees);
  const entryBearingRef = useRef(entryBearingDeg);
  entryBearingRef.current = entryBearingDeg;
  const pitchRef = useRef(requestedPitch);
  pitchRef.current = requestedPitch;
  const manuallySuspendedRef = useRef(false);
  const lockedPitchRef = useRef<Degrees>();
  const skipEntryFlightRef = useRef(skipEntryFlight);
  skipEntryFlightRef.current = skipEntryFlight;
  const resumeInitialViewRef = useRef(resumeInitialView);
  resumeInitialViewRef.current = resumeInitialView;
  const initialViewRef = useRef(initialView);
  initialViewRef.current = initialView;
  const beforeLeaveRef = useRef(onBeforeLeave);
  beforeLeaveRef.current = onBeforeLeave;

  useEffect(() => {
    if (!map) return undefined;

    if (enabled) {
      const previous = sessionRef.current;
      const session: Session = {
        savedFovDeg: previous?.savedFovDeg ?? map.getVerticalFieldOfView(),
        terrainByUs: previous?.terrainByUs ?? false,
        flight: null,
      };
      sessionRef.current = session;
      manuallySuspendedRef.current = false;
      // the override first: while restricted the map holds maxPitch 0, and
      // any pitch set before the override would be clamped away
      freePitch(map);
      map.scrollZoom.disable();
      setPhase("entering");

      let cancelled = false;
      let entryFrame: number | undefined;
      (pendingReturnRef.current?.done ?? Promise.resolve()).then(async () => {
        if (cancelled) return;
        // Let the host apply the selected Karte/Luftbild layers before moving
        // its current camera. No catalog or full-resolution tile wait is needed.
        await new Promise<void>((resolve) => {
          entryFrame = requestAnimationFrame(() => {
            entryFrame = undefined;
            resolve();
          });
        });
        if (cancelled) return;
        session.terrainByUs =
          previous?.terrainByUs ?? ensureTerrain(map, terrainSourceId);
        if (skipEntryFlightRef.current) {
          // Keep the URL camera intact until the saved photo can be restored.
          setPhase("active");
          return;
        }
        const dataset = datasetRef.current;
        if (resumeInitialViewRef.current) {
          // Center/zoom are already restored. Native map restrictions may have
          // flattened the URL angles before the addon could free the camera.
          // Lens setup also closes MapLibre's pending terrain camera update
          // before jumpTo clones the now unrestricted transform.
          map.setVerticalFieldOfView(dataset.enterFovDeg);
          const initial = initialViewRef.current;
          if (
            initial &&
            (initial.bearingDeg !== undefined || initial.pitchDeg !== undefined)
          )
            map.jumpTo({
              ...(initial.bearingDeg !== undefined
                ? { bearing: initial.bearingDeg }
                : {}),
              ...(initial.pitchDeg !== undefined
                ? { pitch: initial.pitchDeg }
                : {}),
            });
          const restoredPitch = map.getPitch() as Degrees;
          session.restoredView = true;
          lockPitch(map, restoredPitch);
          lockedPitchRef.current = restoredPitch;
          setPhase("active");
          return;
        }
        const entryPitch = pitchRef.current;
        const flight = enterObliqueView(
          map,
          entryPitch === dataset.pitchDeg
            ? dataset
            : { ...dataset, pitchDeg: entryPitch },
          entryBearingRef.current
        );
        session.flight = flight;
        await flight.done;
        if (cancelled || sessionRef.current !== session) return;
        // Cancelled flights also resolve. A preview/mode transition may already
        // own the camera, so an obsolete entry must not restore its pitch lock.
        if (session.flight === flight) {
          session.flight = null;
          lockPitch(map, entryPitch);
          lockedPitchRef.current = entryPitch;
        }
        setPhase("active");
      });
      return () => {
        cancelled = true;
        if (entryFrame !== undefined) cancelAnimationFrame(entryFrame);
        session.flight?.cancel();
      };
    }

    const session = sessionRef.current;
    if (!session) return undefined;
    setPhase("leaving");
    freePitch(map);
    const preparation = beforeLeaveRef.current?.();
    pendingReturnRef.current = preparation ?? null;
    let flight: CameraFlight | null = preparation ?? null;
    session.flight = flight;
    let cancelled = false;
    (preparation?.done ?? Promise.resolve()).then(async () => {
      if (pendingReturnRef.current === preparation)
        pendingReturnRef.current = null;
      if (cancelled) return;
      flight = leaveObliqueView(
        map,
        datasetRef.current,
        session.savedFovDeg,
        preparation ? 250 : 1100
      );
      session.flight = flight;
      await flight.done;
      if (cancelled) return;
      sessionRef.current = null;
      releaseCamera(map);
      map.scrollZoom.enable();
      if (session.terrainByUs && getCameraRestriction(map)?.restricted) {
        map.setTerrain(null);
      }
      setPhase("idle");
    });
    return () => {
      cancelled = true;
      // Re-enabling waits for the preview to recenter rather than cancelling
      // halfway and restoring its limits abruptly.
      if (flight !== preparation) flight?.cancel();
    };
  }, [map, enabled, terrainSourceId]);

  // A catalog/series update changes only pitch, never reenters the mode or resets zoom/FOV.
  useEffect(() => {
    const session = sessionRef.current;
    if (
      !map ||
      !enabled ||
      !session ||
      phase !== "active" ||
      skipEntryFlight ||
      session.restoredView ||
      suspended ||
      manuallySuspendedRef.current ||
      lockedPitchRef.current === requestedPitch
    )
      return;
    freePitch(map);
    const flight = settleToPitch(map, requestedPitch, { durationMs: 250 });
    session.flight = flight;
    let cancelled = false;
    flight.done.then(() => {
      if (
        cancelled ||
        sessionRef.current !== session ||
        session.flight !== flight
      )
        return;
      session.flight = null;
      lockPitch(map, requestedPitch);
      lockedPitchRef.current = requestedPitch;
    });
    return () => {
      cancelled = true;
      if (session.flight === flight) {
        session.flight = null;
        flight.cancel();
      }
    };
  }, [map, enabled, phase, requestedPitch, skipEntryFlight, suspended]);

  // the map going away, or the addon leaving the route while on
  useEffect(() => {
    if (!map) return undefined;
    return () => {
      const session = sessionRef.current;
      if (!session) return;
      sessionRef.current = null;
      session.flight?.cancel();
      pendingReturnRef.current?.cancel();
      pendingReturnRef.current = null;
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
  const freeCamera = useCallback(
    (preservePitch = false) => {
      if (map && sessionRef.current) {
        manuallySuspendedRef.current = true;
        const session = sessionRef.current;
        session.restoredView = false;
        const flight = session.flight;
        session.flight = null;
        flight?.cancel();
        if (!preservePitch) freePitch(map);
      }
    },
    [map]
  );

  /** back to the browsing tilt lock once the camera is level with it again */
  const lockCamera = useCallback(
    (pitchDeg: number = pitchRef.current, preserveView = false) => {
      if (map && sessionRef.current) {
        manuallySuspendedRef.current = false;
        sessionRef.current.restoredView = preserveView;
        lockedPitchRef.current = pitchDeg as Degrees;
        lockPitch(map, pitchDeg);
      }
    },
    [map]
  );

  return { phase, freeCamera, lockCamera };
};
