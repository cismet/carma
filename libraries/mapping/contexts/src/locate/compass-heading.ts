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

type LegacyOrientationWindow = Window & {
  /** iOS: -90, 0, 90 or 180, always relative to portrait */
  orientation?: number;
};

/**
 * How far the screen is turned from the orientation the compass value is
 * measured in, degrees counterclockwise, 0 when unknown.
 *
 * `window.orientation` comes first on purpose: it is Apple's value, in the
 * same portrait-based frame as `webkitCompassHeading`, on iPhone and iPad.
 * `screen.orientation.angle` is relative to the device's "natural"
 * orientation instead, which iPadOS takes to be landscape, so it would put
 * the iPad a quarter turn off in every orientation. Android has no
 * `window.orientation`, and there `alpha` and the angle share the
 * natural-orientation frame, so the fallback is consistent.
 */
export const getScreenOrientationAngle = (): number => {
  if (typeof window === "undefined") {
    return 0;
  }
  const angle =
    (window as LegacyOrientationWindow).orientation ??
    window.screen?.orientation?.angle;
  if (typeof angle !== "number" || !Number.isFinite(angle)) {
    return 0;
  }
  return ((angle % 360) + 360) % 360;
};

/**
 * Degrees clockwise from north, or null when the event carries no heading.
 *
 * Both the iOS and the Android value are relative to the device's physical
 * top edge, not the screen's "up": a device held in landscape reports a
 * heading a quarter turn off from where the map's user is facing. Adding
 * the screen rotation moves the heading into the screen's frame.
 */
export const headingFromOrientationEvent = (
  event: DeviceOrientationEvent,
  screenAngle = getScreenOrientationAngle()
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
  return Math.round(heading + screenAngle) % 360;
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
