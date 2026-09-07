/**
 * The device's compass heading, as a subscription.
 *
 * Wraps the browser's orientation events so the caller only sees degrees
 * clockwise from north, or null when the device has no usable heading. The
 * event to listen to, the permission iOS wants first and the two ways the
 * browsers report the angle are all handled here.
 */

export type HeadingListener = (heading: number | null) => void;

type OrientationEventName = "deviceorientationabsolute" | "deviceorientation";

type OrientationEventWithWebkit = DeviceOrientationEvent & {
  /** iOS: the compass heading, clockwise from north */
  webkitCompassHeading?: number;
};

type OrientationPermission = {
  requestPermission?: () => Promise<"granted" | "denied">;
};

/** the orientation event this browser fires, absolute where available */
const getOrientationEventName = (): OrientationEventName | null => {
  if (typeof window === "undefined") {
    return null;
  }
  if ("ondeviceorientationabsolute" in window) {
    return "deviceorientationabsolute";
  }
  if ("ondeviceorientation" in window) {
    return "deviceorientation";
  }
  return null;
};

/** degrees clockwise from north, or null when the event carries no heading */
export const headingFromOrientationEvent = (
  event: DeviceOrientationEvent
): number | null => {
  const { webkitCompassHeading, absolute, alpha } =
    event as OrientationEventWithWebkit;
  let heading: number | null = null;
  if (typeof webkitCompassHeading === "number") {
    heading = webkitCompassHeading;
  } else if (absolute && alpha !== null) {
    // alpha is counterclockwise from north
    heading = 360 - alpha;
  }
  if (heading === null || !Number.isFinite(heading)) {
    return null;
  }
  return Math.round(heading) % 360;
};

/**
 * Start delivering the compass heading to `onHeading`. Returns the function
 * that stops it; the listener is called with null once on stop so the caller
 * can hide whatever showed the heading.
 *
 * iOS asks the user before it hands out orientation events, and only when
 * the request is made close to a tap. Call this from the interaction that
 * switched the feature on. A declined or unsupported request delivers
 * nothing and is not an error.
 */
export const subscribeCompassHeading = (onHeading: HeadingListener) => {
  const eventName = getOrientationEventName();
  let stopped = false;
  let handler: EventListener | null = null;

  const subscribe = () => {
    if (stopped || handler || !eventName) {
      return;
    }
    handler = (event) => {
      onHeading(headingFromOrientationEvent(event as DeviceOrientationEvent));
    };
    window.addEventListener(eventName, handler);
  };

  if (eventName) {
    const orientationEvent = (
      window as Window & { DeviceOrientationEvent?: OrientationPermission }
    ).DeviceOrientationEvent;
    if (typeof orientationEvent?.requestPermission === "function") {
      orientationEvent
        .requestPermission()
        .then((state) => {
          if (state === "granted") {
            subscribe();
          }
        })
        .catch(() => {
          // declined or not askable: no heading
        });
    } else {
      subscribe();
    }
  }

  return () => {
    stopped = true;
    if (handler && eventName) {
      window.removeEventListener(eventName, handler);
      handler = null;
    }
    onHeading(null);
  };
};
