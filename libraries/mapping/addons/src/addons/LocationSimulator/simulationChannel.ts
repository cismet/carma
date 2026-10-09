import { useAddonState } from "../../lib/AddonStateContext";
import type { SimulatedSignal } from "./signalPresets";

/**
 * The handle on the pretend device, published by the `locationSimulator`
 * addon while it is mounted: whether it is going along a route right now, and
 * the two things a tester wants to do with that drive, put it somewhere on the
 * route and hold it there.
 *
 * Read by the routing's ribbon, which offers the slider only while this is
 * there. A real device has no such handle, and the ribbon says so instead.
 */
export type LocationSimulation = {
  /** the pretend user is going along the route in focus */
  driving: boolean;
  /** the drive is held where it is; the fixes keep coming, from that spot */
  paused: boolean;
  setPaused: (paused: boolean) => void;
  /**
   * put the pretend user at this fraction of the route, 0 the start and 1 the
   * destination; the routing sees the fix at once, not on the next tick
   */
  seek: (fraction: number) => void;
  /**
   * leave the route: turn right and go straight on, off every road, so the
   * navigation reroutes; again to turn again. The slider puts the pretend
   * user back on the route
   */
  detour: () => void;
  /**
   * put the pretend user there, `[lng, lat]`, as Alt + click does: between
   * drives they stay there, so the next route starts from that spot; during a
   * drive they stand there and the navigation reroutes from it
   */
  place: (position: [number, number]) => void;
  /**
   * the reception, one of the presets of `signalPresets.ts`: "good",
   * "medium", "bad" or "tunnel"; for testing how the navigation copes with a
   * weak or lost signal. "tunnel" goes back to "good" once its outage is over
   */
  signal: SimulatedSignal;
  setSignal: (signal: SimulatedSignal) => void;
  /**
   * what the device does: "simulate" drives the route, "record" hands the
   * real device through and keeps its fixes, "replay" plays a loaded track
   * back along the navigation
   */
  mode: "simulate" | "record" | "replay";
  /** how many fixes the running recording holds; null while none runs */
  recording: { fixes: number } | null;
  /** start recording the real device's fixes */
  startRecording: () => void;
  /** end the recording; `save` downloads it as GeoJSON */
  stopRecording: (save: boolean) => void;
  /** the loaded track, replayed during a navigation; null while there is none */
  track: {
    name: string;
    fixes: number;
    durationMs: number;
    start: [number, number];
    end: [number, number];
  } | null;
  /** load a track from a file; false when it holds none */
  loadTrackFile: (file: File) => Promise<boolean>;
  clearTrack: () => void;
  /** how much faster than the configured speed the drive goes; 1 is as configured */
  speedFactor: number;
  setSpeedFactor: (factor: number) => void;
};

export type LocationSimulationState = {
  /** the pretend device; null while a real one answers */
  simulation: LocationSimulation | null;
};

/** the pretend device, for a UI that wants to move it */
export const useLocationSimulation = (): LocationSimulation | null => {
  const [state] = useAddonState("locationSimulation");
  return state?.simulation ?? null;
};
