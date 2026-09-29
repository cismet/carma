import { useEffect, useRef, useState } from "react";

/**
 * The scene autoplay goes to from `activeId`: the next one of the story, after
 * the last the first again. With no scene of the story on the display yet, the
 * first.
 */
export const nextAutoplayScene = <T extends { id: string }>(
  scenes: readonly T[],
  activeId: string | null
): T | undefined => {
  if (scenes.length === 0) {
    return undefined;
  }
  const index = scenes.findIndex(({ id }) => id === activeId);
  return scenes[(index + 1) % scenes.length];
};

export type UseAutoplayOptions<T extends { id: string }> = {
  /** the scenes of the story that plays; undefined when none does */
  scenes: readonly T[] | undefined;
  activeSceneId: string | null;
  /**
   * The clock waits: while a change runs, the screen is black or the display
   * is out of reach. Each scene gets its full time once it is on the model.
   */
  isHolding: boolean;
  seconds: number;
  goToScene: (scene: T) => void;
  /** a scene of another story was picked */
  onStop: () => void;
};

/** the running wait for the next scene: since when, and how long in all */
export type AutoplayCountdown = { startedAt: number; ms: number };

/**
 * Walks the playing story on its own, one scene every `seconds`, round and
 * round until it is stopped. A scene picked by hand inside the story restarts
 * the clock from there. Returns the running wait, null while none runs.
 */
export const useAutoplay = <T extends { id: string }>({
  scenes,
  activeSceneId,
  isHolding,
  seconds,
  goToScene,
  onStop,
}: UseAutoplayOptions<T>): AutoplayCountdown | null => {
  const [countdown, setCountdown] = useState<AutoplayCountdown | null>(null);
  // the display's clocks re-render the remote all the time; the timer must
  // only start over when what it waits for changes
  const goToSceneRef = useRef(goToScene);
  goToSceneRef.current = goToScene;
  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;

  useEffect(() => {
    if (!scenes || scenes.length === 0 || isHolding) {
      setCountdown(null);
      return;
    }
    if (
      activeSceneId !== null &&
      !scenes.some(({ id }) => id === activeSceneId)
    ) {
      setCountdown(null);
      onStopRef.current();
      return;
    }
    const ms = seconds * 1000;
    setCountdown({ startedAt: Date.now(), ms });
    const timer = window.setTimeout(() => {
      const next = nextAutoplayScene(scenes, activeSceneId);
      if (next) {
        goToSceneRef.current(next);
      }
    }, ms);
    return () => window.clearTimeout(timer);
  }, [scenes, activeSceneId, isHolding, seconds]);

  return countdown;
};
