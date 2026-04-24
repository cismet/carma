import { useEffect, useRef } from "react";

export type ModeLifecycleAction = () => void;

export type ModeLifecycleActions = {
  onEnter?: readonly ModeLifecycleAction[];
  onLeave?: readonly ModeLifecycleAction[];
};

type UseModeLifecycleActionsOptions = ModeLifecycleActions & {
  active: boolean;
  runOnMount?: boolean;
};

const EMPTY_ACTIONS: readonly ModeLifecycleAction[] = [];

const runActions = (actions: readonly ModeLifecycleAction[]) => {
  actions.forEach((action) => action());
};

export const useModeLifecycleActions = ({
  active,
  onEnter = EMPTY_ACTIONS,
  onLeave = EMPTY_ACTIONS,
  runOnMount = true,
}: UseModeLifecycleActionsOptions) => {
  const onEnterRef = useRef(onEnter);
  const onLeaveRef = useRef(onLeave);
  const previousActiveRef = useRef(active);
  const didMountRef = useRef(false);

  onEnterRef.current = onEnter;
  onLeaveRef.current = onLeave;

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      previousActiveRef.current = active;

      if (active && runOnMount) {
        runActions(onEnterRef.current);
      }
      return;
    }

    const wasActive = previousActiveRef.current;
    if (wasActive === active) {
      return;
    }

    previousActiveRef.current = active;
    runActions(active ? onEnterRef.current : onLeaveRef.current);
  }, [active, runOnMount]);

  useEffect(
    () => () => {
      if (!previousActiveRef.current) {
        return;
      }

      previousActiveRef.current = false;
      runActions(onLeaveRef.current);
    },
    []
  );
};
