import { useEffect, useRef } from "react";

import type { TrafficControl } from "@carma-mapping/show-remote";

import { useTrafficAnimationActions } from "../TrafficAnimation/traffic-actions";

/**
 * Sets which moment of the last 24 hours the traffic shows, as the remote's
 * state document says. Renders nothing, like `RemoteShadow`.
 *
 * The offset counts back from now and runs with the clock, so applying the
 * same entry again changes nothing; it is applied whenever the entry changes
 * and whenever traffic comes on with an entry waiting (a new scene's layer,
 * or a reload of this window). Without an entry the traffic runs as its layer
 * started it.
 *
 * A new `restartAt` restarts the traffic, but only one that was already
 * running: traffic that comes on with an entry waiting has just filled its
 * roads. The offset is then left alone unless it changed too, so a restart
 * does not undo the desktop panel.
 */
export const RemoteTraffic = ({
  wanted,
}: {
  wanted: TrafficControl | null;
}) => {
  const { isOn, networkUrl, setOffsetMinutes, restart } =
    useTrafficAnimationActions();
  const trafficKey = isOn && networkUrl ? networkUrl : null;

  /**
   * The entry last applied, and to which traffic; `wanted` is null for
   * traffic that ran before the remote had an entry.
   */
  const appliedRef = useRef<{
    key: string;
    wanted: TrafficControl | null;
  } | null>(null);

  useEffect(() => {
    if (!trafficKey) {
      appliedRef.current = null;
      return;
    }
    const isRunning = appliedRef.current?.key === trafficKey;
    const applied = isRunning ? appliedRef.current?.wanted ?? null : null;
    if (!wanted) {
      if (!isRunning) appliedRef.current = { key: trafficKey, wanted: null };
      return;
    }
    if (
      !isRunning ||
      applied?.offsetMinutes !== wanted.offsetMinutes ||
      applied.seekAt !== wanted.seekAt
    ) {
      setOffsetMinutes(wanted.offsetMinutes);
    }
    if (
      isRunning &&
      wanted.restartAt !== undefined &&
      wanted.restartAt !== applied?.restartAt
    ) {
      restart();
    }
    appliedRef.current = { key: trafficKey, wanted };
  }, [trafficKey, wanted, setOffsetMinutes, restart]);

  return null;
};
