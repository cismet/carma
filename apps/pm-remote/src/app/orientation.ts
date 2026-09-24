/**
 * The phone's attitude, from the best source the browser offers.
 *
 * Android Chrome has the Generic Sensor API: `RelativeOrientationSensor` fuses
 * gyroscope and accelerometer into a quaternion, without the magnetometer,
 * whose readings wander indoors near projectors and steel. Everywhere else,
 * iOS included, `deviceorientation` gives the same attitude as angles; on iOS
 * that is CoreMotion's gyroscope and accelerometer fusion with a heading
 * relative to wherever the phone faced when it started, which is exactly
 * what a pointer needs. iOS hands it out only after the user allowed motion
 * access in a tap, and only on https.
 */

import {
  axesFromEuler,
  axesFromQuaternion,
  type DeviceAxes,
} from "./pointer-math";

export type OrientationSource = "orientation-sensor" | "deviceorientation";

export type OrientationReading = { axes: DeviceAxes; timeMs: number };

export type OrientationStream = {
  source: OrientationSource;
  stop: () => void;
};

const LOG_PREFIX = "[PM POINTER]";

/** how long a source may stay silent before the next one is tried */
const FIRST_READING_TIMEOUT_MS = 1500;
const SENSOR_FREQUENCY_HZ = 60;

type PermissionRequester = { requestPermission?: () => Promise<string> };

/** the Generic Sensor API is not in TypeScript's dom lib */
type OrientationSensor = EventTarget & {
  quaternion?: readonly number[] | null;
  start: () => void;
  stop: () => void;
};
type OrientationSensorConstructor = new (options: {
  frequency: number;
  referenceFrame: "device" | "screen";
}) => OrientationSensor;

export class OrientationError extends Error {
  readonly reason: "denied" | "unavailable";

  constructor(reason: "denied" | "unavailable", message: string) {
    super(message);
    this.name = "OrientationError";
    this.reason = reason;
  }
}

/**
 * Asks for motion access where the browser wants that (iOS). Must be the
 * first thing a tap handler does: iOS only shows the question while the tap
 * is still being handled.
 */
export const requestMotionAccess = (): Promise<void> => {
  const requesters = [
    typeof DeviceOrientationEvent !== "undefined"
      ? (DeviceOrientationEvent as unknown as PermissionRequester)
      : undefined,
    typeof DeviceMotionEvent !== "undefined"
      ? (DeviceMotionEvent as unknown as PermissionRequester)
      : undefined,
  ];
  const requests = requesters.flatMap((requester) =>
    requester && typeof requester.requestPermission === "function"
      ? [requester.requestPermission()]
      : []
  );
  if (requests.length === 0) {
    return Promise.resolve();
  }
  return Promise.all(requests).then(
    (answers) => {
      if (answers.some((answer) => answer !== "granted")) {
        throw new OrientationError(
          "denied",
          "Der Zugriff auf die Bewegungssensoren wurde abgelehnt. In den Safari-Einstellungen für diese Seite „Bewegung und Ausrichtung“ erlauben und neu laden."
        );
      }
    },
    (error: unknown) => {
      throw new OrientationError(
        "denied",
        `Die Bewegungssensoren lassen sich nicht freigeben (${
          error instanceof Error ? error.message : String(error)
        }).`
      );
    }
  );
};

/** resolves with the stream once the first reading arrived, rejects when none comes */
const startWithFirstReading = (
  source: OrientationSource,
  begin: (onReading: (reading: OrientationReading) => void) => () => void,
  onReading: (reading: OrientationReading) => void
): Promise<OrientationStream> =>
  new Promise((resolve, reject) => {
    let settled = false;
    let stop: () => void = () => undefined;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        stop();
        reject(new Error(`${source} sent no reading`));
      }
    }, FIRST_READING_TIMEOUT_MS);
    try {
      stop = begin((reading) => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          resolve({ source, stop });
        }
        onReading(reading);
      });
    } catch (error) {
      settled = true;
      window.clearTimeout(timer);
      reject(error);
    }
  });

const beginOrientationSensor =
  (Sensor: OrientationSensorConstructor) =>
  (onReading: (reading: OrientationReading) => void): (() => void) => {
    const sensor = new Sensor({
      frequency: SENSOR_FREQUENCY_HZ,
      referenceFrame: "device",
    });
    const handleReading = () => {
      const q = sensor.quaternion;
      if (q && q.length === 4) {
        onReading({ axes: axesFromQuaternion(q), timeMs: performance.now() });
      }
    };
    const handleError = (event: Event) => {
      console.warn(`${LOG_PREFIX} orientation sensor error`, event);
    };
    sensor.addEventListener("reading", handleReading);
    sensor.addEventListener("error", handleError);
    sensor.start();
    return () => {
      sensor.removeEventListener("reading", handleReading);
      sensor.removeEventListener("error", handleError);
      sensor.stop();
    };
  };

const beginDeviceOrientation = (
  onReading: (reading: OrientationReading) => void
): (() => void) => {
  const handle = (event: DeviceOrientationEvent) => {
    const { alpha, beta, gamma } = event;
    // desktops fire the event once, with every angle null
    if (alpha === null || beta === null || gamma === null) {
      return;
    }
    onReading({
      axes: axesFromEuler(alpha, beta, gamma),
      timeMs: event.timeStamp || performance.now(),
    });
  };
  window.addEventListener("deviceorientation", handle);
  return () => window.removeEventListener("deviceorientation", handle);
};

/**
 * Starts the best source that delivers. Call `requestMotionAccess` in the tap
 * before this.
 */
export const startOrientation = async (
  onReading: (reading: OrientationReading) => void
): Promise<OrientationStream> => {
  const Sensor = (window as unknown as Record<string, unknown>)[
    "RelativeOrientationSensor"
  ] as OrientationSensorConstructor | undefined;
  if (typeof Sensor === "function") {
    try {
      return await startWithFirstReading(
        "orientation-sensor",
        beginOrientationSensor(Sensor),
        onReading
      );
    } catch (error) {
      console.info(
        `${LOG_PREFIX} orientation sensor unusable, trying deviceorientation`,
        error
      );
    }
  }
  if (typeof DeviceOrientationEvent !== "undefined") {
    try {
      return await startWithFirstReading(
        "deviceorientation",
        beginDeviceOrientation,
        onReading
      );
    } catch (error) {
      console.info(`${LOG_PREFIX} deviceorientation unusable`, error);
    }
  }
  throw new OrientationError(
    "unavailable",
    window.isSecureContext
      ? "Dieses Gerät meldet keine Lage."
      : "Die Lagesensoren gibt es nur über https."
  );
};

export const SOURCE_LABEL: Record<OrientationSource, string> = {
  "orientation-sensor": "Lagesensor (Kreisel und Beschleunigung)",
  deviceorientation: "Geräteausrichtung (Kreisel und Beschleunigung)",
};
