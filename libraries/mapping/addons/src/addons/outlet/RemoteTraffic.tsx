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
 */
export const RemoteTraffic = ({
  wanted,
}: {
  wanted: TrafficControl | null;
}) => {
  const { isOn, networkUrl, setOffsetMinutes } = useTrafficAnimationActions();
  const trafficKey = isOn && networkUrl ? networkUrl : null;

  /** the entry last applied, and to which traffic */
  const appliedRef = useRef<{ key: string; wanted: TrafficControl } | null>(
    null
  );

  useEffect(() => {
    if (!trafficKey || !wanted) {
      if (!trafficKey) appliedRef.current = null;
      return;
    }
    const applied = appliedRef.current;
    if (
      applied?.key === trafficKey &&
      applied.wanted.offsetMinutes === wanted.offsetMinutes &&
      applied.wanted.seekAt === wanted.seekAt
    ) {
      return;
    }
    setOffsetMinutes(wanted.offsetMinutes);
    appliedRef.current = { key: trafficKey, wanted };
  }, [trafficKey, wanted, setOffsetMinutes]);

  return null;
};
