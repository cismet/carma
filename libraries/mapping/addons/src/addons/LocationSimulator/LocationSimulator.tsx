import { useCallback, useEffect, useRef, useState } from "react";

import { setGeolocationSource } from "@carma-mapping/contexts";

import { useAddonState } from "../../lib/AddonStateContext";
import type { AddonComponentProps } from "../../lib/registry";
import { useActiveRoute, useRouteNavigation } from "../Routing/routeChannel";
import {
  DEFAULT_ACCURACY_METERS,
  DEFAULT_INTERVAL_MS,
  DEFAULT_JITTER_METERS,
  DEFAULT_POSITION,
  DEFAULT_SPEED_METERS_PER_SECOND,
} from "./config";
import { createFakeDevice } from "./fakeDevice";
import type { FakeDevice } from "./fakeDevice";

/**
 * Pretends to be the device, for testing the routing from anywhere: the
 * routes only exist around Wuppertal, and the person testing them mostly is
 * not there.
 *
 * It replaces the source of positions, not the readers: the locate context
 * asks the geolocation slot, and this addon puts a pretend receiver into it
 * while mounted. The locate button, the origin search and the routing camera
 * keep reading `currentPosition` and cannot tell. Switching the addon off in
 * the addon manager hands the slot back to the real device; the location
 * mode has to be switched off and on for the context to ask it again.
 *
 * While no navigation runs the pretend user stands at the configured
 * position, so "In der Nähe" ranks from there and a route starts there. When
 * a navigation starts on the `routeNavigation` channel, the receiver drives
 * along the route in focus at the configured speed; the routing addon sees
 * the fixes come in along its own route and ends the navigation on arrival,
 * after which the user is back home for the next search.
 *
 * The drive can be moved by hand: the addon publishes a handle on the
 * `locationSimulation` channel with `seek`, `setPaused` and `setSpeedFactor`,
 * which the routing's ribbon turns into a slider, a pause button and a speed
 * selector, so a tester can look at any spot on the route without driving
 * there first, and get through a long route quickly.
 *
 * Dev only: the component does nothing at all outside a dev build, so an
 * entry left on a route never fakes a position in a deployment.
 */
export const LocationSimulator = ({
  config,
}: AddonComponentProps<"locationSimulator">) => {
  const {
    position = DEFAULT_POSITION,
    speedMetersPerSecond = DEFAULT_SPEED_METERS_PER_SECOND,
    intervalMs = DEFAULT_INTERVAL_MS,
    jitterMeters = DEFAULT_JITTER_METERS,
    accuracyMeters = DEFAULT_ACCURACY_METERS,
  } = config ?? {};
  const enabled = import.meta.env.DEV;

  const [route] = useActiveRoute();
  const coordinates = route?.coordinates ?? null;
  const navigating = useRouteNavigation()?.navigating ?? false;

  const deviceRef = useRef<FakeDevice | null>(null);
  // the tuple is rebuilt by a default per render; its values are what count
  const [lng, lat] = position;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const device = createFakeDevice({
      intervalMs,
      jitterMeters,
      accuracyMeters,
    });
    device.stand([lng, lat]);
    deviceRef.current = device;
    setGeolocationSource(device);
    return () => {
      setGeolocationSource(null);
      device.dispose();
      deviceRef.current = null;
    };
  }, [enabled, intervalMs, jitterMeters, accuracyMeters, lng, lat]);

  const driving = Boolean(navigating && coordinates);
  useEffect(() => {
    const device = deviceRef.current;
    if (!device) {
      return;
    }
    if (navigating && coordinates) {
      device.drive(coordinates, speedMetersPerSecond);
    } else {
      device.stand([lng, lat]);
    }
  }, [navigating, coordinates, speedMetersPerSecond, lng, lat]);

  // the tester's multiplier on the configured pace, kept across drives so a
  // route checked at 4× is followed by the next one at 4× too; applied after
  // the drive above starts, which sets the pace back to the configured one
  const [speedFactor, setSpeedFactor] = useState(1);
  useEffect(() => {
    if (driving) {
      deviceRef.current?.setSpeed(speedMetersPerSecond * speedFactor);
    }
  }, [driving, speedMetersPerSecond, speedFactor]);

  // a pause belongs to one drive; the next one starts moving
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!driving) {
      setPaused(false);
    }
  }, [driving]);
  useEffect(() => {
    deviceRef.current?.setPaused(paused);
  }, [paused]);

  const seek = useCallback((fraction: number) => {
    deviceRef.current?.seek(fraction);
  }, []);

  const [, publishSimulation] = useAddonState("locationSimulation");
  useEffect(() => {
    publishSimulation({
      simulation: enabled
        ? { driving, paused, setPaused, seek, speedFactor, setSpeedFactor }
        : null,
    });
  }, [publishSimulation, enabled, driving, paused, seek, speedFactor]);
  // the handle goes with the addon, so nothing offers to move a real device
  useEffect(
    () => () => publishSimulation({ simulation: null }),
    [publishSimulation]
  );

  return null;
};
