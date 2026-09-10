import { useEffect, useRef, type MutableRefObject } from "react";

import {
  type ShadowDateState,
  type ShadowDateStateSetter,
  type ShadowSimulationState,
} from "../../contracts/shadow-simulation";
import { advanceShadowAnimationFrame } from "../../core/shadow-animation";
import type { SolarLocation } from "../../core/solar-position";

const SHADOW_ANIMATION_INTERVAL_MS = 1000 / 30;
/**
 * Shared addon state re-renders every reader on each write. The animated sun
 * therefore goes straight to the scene on every tick, and the shared date only
 * follows at this rate for the visible time label and the URL hash.
 */
export const SHADOW_ANIMATION_PUBLISH_INTERVAL_MS = 250;

/**
 * Advances the shadow date while the animation runs.
 *
 * `onFrame` receives every tick and is expected to drive the scene directly;
 * `setDateState` receives a throttled copy plus the final tick when the
 * animation stops. The returned ref holds the date the scene currently shows
 * whenever it is ahead of the shared date, and is null once both agree.
 */
export const useShadowAnimation = ({
  dateState,
  setDateState,
  location,
  shadowState,
  onFrame,
}: {
  dateState: ShadowDateState;
  setDateState: ShadowDateStateSetter;
  location: SolarLocation;
  shadowState: ShadowSimulationState;
  onFrame: (dateState: ShadowDateState) => void;
}): MutableRefObject<ShadowDateState | null> => {
  const animatedDateRef = useRef<ShadowDateState | null>(null);
  const lastPublishedRef = useRef<ShadowDateState | null>(null);
  const previousDateRef = useRef(dateState);
  const dateStateRef = useRef(dateState);
  const setDateStateRef = useRef(setDateState);
  const onFrameRef = useRef(onFrame);
  dateStateRef.current = dateState;
  setDateStateRef.current = setDateState;
  onFrameRef.current = onFrame;
  const { animationMode, animationSpeed, enabled, isAnimating } = shadowState;
  const animating = enabled && (isAnimating ?? false);

  useEffect(() => {
    const changed = dateState !== previousDateRef.current;
    previousDateRef.current = dateState;
    if (!changed) return;
    if (dateState === lastPublishedRef.current) {
      // The shared date caught up with the scene. While animating the scene
      // may already be a tick ahead, so the ref stays authoritative until stop.
      if (!animating) animatedDateRef.current = null;
      return;
    }
    // A slider, hash or another client chose a date: continue from it.
    animatedDateRef.current = null;
  }, [animating, dateState]);

  useEffect(() => {
    if (!animating) return;
    const animationState = { animationMode, animationSpeed, enabled, isAnimating };
    let yearDayProgress = 0;
    let lastPublishedAt = performance.now();
    const publish = (next: ShadowDateState) => {
      lastPublishedRef.current = next;
      setDateStateRef.current(next);
    };
    const interval = window.setInterval(() => {
      const base = animatedDateRef.current ?? dateStateRef.current;
      const frame = advanceShadowAnimationFrame(
        animationState,
        base,
        base,
        location,
        yearDayProgress
      );
      yearDayProgress = frame.yearDayProgress;
      animatedDateRef.current = frame.dateState;
      onFrameRef.current(frame.dateState);
      const now = performance.now();
      if (now - lastPublishedAt >= SHADOW_ANIMATION_PUBLISH_INTERVAL_MS) {
        lastPublishedAt = now;
        publish(frame.dateState);
      }
    }, SHADOW_ANIMATION_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
      const final = animatedDateRef.current;
      if (final && final !== lastPublishedRef.current) publish(final);
    };
  }, [animating, animationMode, animationSpeed, enabled, isAnimating, location]);

  return animatedDateRef;
};
