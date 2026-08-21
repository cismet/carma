import { useCallback } from "react";

import { useAddonState } from "../../lib/AddonStateContext";

/**
 * Whether the comparison is running, shared between the button that switches it
 * and the mode addons that render the panels.
 *
 * Kept in the addon state rather than in each mode addon so a route can carry
 * several modes and still have one switch, and so the state dies with the route
 * the way every other channel does.
 */
export type CompareState = {
  isOn: boolean;
};

export const COMPARE_STATE_DEFAULT: CompareState = { isOn: false };

/** One entry point for both writers, so the button and the modes cannot drift. */
export const useComparingActions = () => {
  const [state, setState] = useAddonState("compareState");
  const isOn = state?.isOn ?? false;

  const setOn = useCallback(
    (next: boolean) => {
      setState((previous) => ({ ...(previous ?? COMPARE_STATE_DEFAULT), isOn: next }));
    },
    [setState]
  );

  const toggle = useCallback(() => {
    setState((previous) => {
      const current = previous ?? COMPARE_STATE_DEFAULT;
      return { ...current, isOn: !current.isOn };
    });
  }, [setState]);

  return { isOn, setOn, toggle };
};
