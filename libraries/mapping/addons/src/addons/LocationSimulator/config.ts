export type LocationSimulatorConfig = {
  /**
   * where the pretend user stands while no navigation runs, `[lng, lat]`;
   * default the Wuppertal main station, which the routes exist around
   */
  position?: [number, number];
  /** how fast the pretend user moves along the route, in m/s; default 8, about 30 km/h */
  speedMetersPerSecond?: number;
  /** ms between two fixes; default 1000 */
  intervalMs?: number;
  /** meters of random scatter on every fix; default 2, 0 for a clean track */
  jitterMeters?: number;
  /** the accuracy the fixes report, in meters; default 5 */
  accuracyMeters?: number;
};

export const DEFAULT_POSITION: [number, number] = [7.1494, 51.2547];
export const DEFAULT_SPEED_METERS_PER_SECOND = 8;
export const DEFAULT_INTERVAL_MS = 1000;
export const DEFAULT_JITTER_METERS = 2;
export const DEFAULT_ACCURACY_METERS = 5;
