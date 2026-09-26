import { useEffect, useMemo, useRef } from "react";

import {
  clampDayOfYear,
  planShadowApply,
  shadowOfConfig,
  type AppliedShadowControl,
  type ShadowControl,
} from "@carma-mapping/show-remote";

import { useAddonState, useRouteAddons } from "../../lib/AddonStateContext";
import { resolveAddonEntries } from "../../lib/registry";

/**
 * Sets date and time of the shadows, plays and pauses the day or the year and
 * sets how long a pass takes, as the remote's state document says. Renders
 * nothing, like `RemoteSeries`.
 *
 * The entry only takes effect on shadows a layer launched: the launch puts
 * them on the moment its style names (`ShadowTexture`), which would override a
 * moment set before it. Shadows that come on with an entry waiting (a reload
 * of this window) take it over; without one they run as their layer says, and
 * the remote's first entry then only changes what the presenter changed.
 */
export const RemoteShadow = ({ wanted }: { wanted: ShadowControl | null }) => {
  const routeAddons = useRouteAddons();
  const [shadowState, setShadowState] = useAddonState("shadowSimulation");
  const [dateState, setDateState] = useAddonState("shadowDate");

  /** which shadows a layer launched, the key the remote knows them by */
  const launchedKey = useMemo(() => {
    const launched = resolveAddonEntries(routeAddons).find(
      (entry) =>
        entry.kind === "shadowTexture" && entry.config?.startEnabled === true
    );
    return launched?.config
      ? shadowOfConfig(launched.config as Record<string, unknown>)?.key ?? null
      : null;
  }, [routeAddons]);
  const shadowKey =
    launchedKey && shadowState?.enabled && dateState ? launchedKey : null;

  const currentRef = useRef<Omit<AppliedShadowControl, "seekAt">>({
    play: null,
    cycleSeconds: 0,
  });
  currentRef.current = {
    play: shadowState?.isAnimating ? shadowState.animationMode ?? "day" : null,
    cycleSeconds: shadowState?.animationCycleSeconds ?? 0,
  };
  /** what was taken over for which shadows; another launch starts afresh */
  const appliedRef = useRef<{
    key: string;
    control: AppliedShadowControl;
  } | null>(null);

  useEffect(() => {
    if (!shadowKey) {
      appliedRef.current = null;
      return;
    }
    if (!wanted) {
      if (appliedRef.current?.key !== shadowKey) {
        appliedRef.current = { key: shadowKey, control: currentRef.current };
      }
      return;
    }
    const applied =
      appliedRef.current?.key === shadowKey ? appliedRef.current.control : null;
    const plan = planShadowApply(applied, wanted);
    const { seekTo, play, cycleSeconds } = plan;
    if (seekTo) {
      setDateState((previous) => ({
        ...previous!,
        dayOfYear: clampDayOfYear(previous!.year, seekTo.dayOfYear),
        minutes: seekTo.minutes,
      }));
    }
    if (play !== undefined || cycleSeconds !== undefined) {
      setShadowState((previous) => ({
        ...previous!,
        ...(play !== undefined
          ? { isAnimating: play !== null, ...(play ? { animationMode: play } : {}) }
          : {}),
        ...(cycleSeconds !== undefined
          ? { animationCycleSeconds: cycleSeconds }
          : {}),
      }));
    }
    appliedRef.current = {
      key: shadowKey,
      control: {
        play: wanted.play,
        cycleSeconds: wanted.cycleSeconds,
        seekAt: wanted.seekAt,
      },
    };
  }, [shadowKey, wanted, setDateState, setShadowState]);

  return null;
};
