import { useCallback, useEffect, useRef, useState } from "react";

import { setGeolocationSource } from "@carma-mapping/contexts";

import { useAddonState } from "../../lib/AddonStateContext";
import type { AddonComponentProps } from "../../lib/registry";
import { useRouteNavigation } from "../Routing/routeChannel";
import {
  DEFAULT_ACCURACY_METERS,
  DEFAULT_INTERVAL_MS,
  DEFAULT_JITTER_METERS,
  DEFAULT_POSITION,
  DEFAULT_SPEED_METERS_PER_SECOND,
} from "./config";
import { createFakeDevice } from "./fakeDevice";
import type { FakeDevice } from "./fakeDevice";

/** how far "Abweichen" turns the pretend user, clockwise: a right turn */
const DETOUR_TURN_DEGREES = 90;

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
 * along the route being driven at the configured speed; the routing addon sees
 * the fixes come in along its own route and ends the navigation on arrival,
 * after which the user is back home for the next search. A reroute is a new
 * route being driven, and the receiver drives it from its start.
 *
 * The drive can be moved by hand: the addon publishes a handle on the
 * `locationSimulation` channel with `seek`, `setPaused`, `detour` and
 * `setSpeedFactor`, which the routing's ribbon turns into a slider, a pause
 * button, an "Abweichen" button and a speed selector, so a tester can look at
 * any spot on the route without driving there first, get through a long route
 * quickly, and leave it to see the reroute. Alt + click on the map puts the
 * pretend user anywhere, see below.
 *
 * Dev only: the component does nothing at all outside a dev build, so an
 * entry left on a route never fakes a position in a deployment.
 */
export const LocationSimulator = ({
  config,
  libreMap,
}: AddonComponentProps<"locationSimulator">) => {
  const {
    position = DEFAULT_POSITION,
    speedMetersPerSecond = DEFAULT_SPEED_METERS_PER_SECOND,
    intervalMs = DEFAULT_INTERVAL_MS,
    jitterMeters = DEFAULT_JITTER_METERS,
    accuracyMeters = DEFAULT_ACCURACY_METERS,
  } = config ?? {};
  const enabled = import.meta.env.DEV;

  // the route being driven, which a reroute replaces during the navigation
  const navigation = useRouteNavigation();
  const coordinates = navigation?.route?.coordinates ?? null;
  const navigating = navigation?.navigating ?? false;

  const deviceRef = useRef<FakeDevice | null>(null);
  // where the pretend user stands between drives: the configured position,
  // until an Alt + click puts them somewhere else
  const [placed, setPlaced] = useState<[number, number] | null>(null);
  // the tuple is rebuilt by a default per render; its values are what count
  const [lng, lat] = placed ?? position;

  // not a dependency of the device below: a new device is a new source, and
  // the locate context only asks for the source when locating starts
  const homeRef = useRef<[number, number]>([lng, lat]);
  homeRef.current = [lng, lat];

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const device = createFakeDevice({
      intervalMs,
      jitterMeters,
      accuracyMeters,
    });
    device.stand(homeRef.current);
    deviceRef.current = device;
    setGeolocationSource(device);
    return () => {
      setGeolocationSource(null);
      device.dispose();
      deviceRef.current = null;
    };
  }, [enabled, intervalMs, jitterMeters, accuracyMeters]);

  // the tester's multiplier on the configured pace, kept across drives so a
  // route checked at 4× is followed by the next one, and a reroute of it, at
  // 4× too
  const [speedFactor, setSpeedFactor] = useState(1);
  const speedFactorRef = useRef(speedFactor);
  speedFactorRef.current = speedFactor;

  // a new driven route, the first or a reroute, is driven from its start,
  // which is where the pretend user is
  const driving = Boolean(navigating && coordinates);
  useEffect(() => {
    const device = deviceRef.current;
    if (!device) {
      return;
    }
    if (navigating && coordinates) {
      device.drive(coordinates, speedMetersPerSecond * speedFactorRef.current);
    } else {
      device.stand([lng, lat]);
    }
  }, [navigating, coordinates, speedMetersPerSecond, lng, lat]);

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

  const detour = useCallback(() => {
    deviceRef.current?.detour(DETOUR_TURN_DEGREES);
  }, []);

  /**
   * Alt + click puts the pretend user where the click is; a plain click stays
   * the map's, for picking features. Between drives they stay there, so the
   * next search starts from that spot. During a drive they stand there, as if
   * they had driven there, and the navigation reroutes from it.
   *
   * Caught on the map's container while the event goes down, before the map
   * sees it, so the Alt + click does not also pick the feature under it.
   */
  const navigatingRef = useRef(navigating);
  navigatingRef.current = navigating;
  useEffect(() => {
    if (!enabled || !libreMap) {
      return;
    }
    const container = libreMap.getContainer();
    const onClick = (event: MouseEvent) => {
      if (!event.altKey) {
        return;
      }
      event.stopPropagation();
      event.preventDefault();
      const rect = libreMap.getCanvasContainer().getBoundingClientRect();
      const at = libreMap.unproject([
        event.clientX - rect.left,
        event.clientY - rect.top,
      ]);
      if (navigatingRef.current) {
        deviceRef.current?.stand([at.lng, at.lat]);
      } else {
        setPlaced([at.lng, at.lat]);
      }
    };
    container.addEventListener("click", onClick, { capture: true });
    return () => {
      container.removeEventListener("click", onClick, { capture: true });
    };
  }, [enabled, libreMap]);

  const [, publishSimulation] = useAddonState("locationSimulation");
  useEffect(() => {
    publishSimulation({
      simulation: enabled
        ? {
            driving,
            paused,
            setPaused,
            seek,
            detour,
            speedFactor,
            setSpeedFactor,
          }
        : null,
    });
  }, [publishSimulation, enabled, driving, paused, seek, detour, speedFactor]);
  // the handle goes with the addon, so nothing offers to move a real device
  useEffect(
    () => () => publishSimulation({ simulation: null }),
    [publishSimulation]
  );

  return null;
};
