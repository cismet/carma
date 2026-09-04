import { useEffect, useRef } from "react";

import {
  type ShadowDateState,
  type ShadowDateStateSetter,
  type ShadowSimulationState,
} from "../../contracts/shadow-simulation";
import { advanceShadowAnimationFrame } from "../../core/shadow-animation";
import type { SolarLocation } from "../../core/solar-position";

const SHADOW_ANIMATION_INTERVAL_MS = 1000 / 30;

export const useShadowAnimation = ({
  initialDateState,
  setDateState,
  location,
  shadowState,
}: {
  initialDateState: ShadowDateState;
  setDateState: ShadowDateStateSetter;
  location: SolarLocation;
  shadowState: ShadowSimulationState;
}): void => {
  const yearAnimationDayProgress = useRef(0);
  const { animationMode, animationSpeed, enabled, isAnimating } = shadowState;

  useEffect(() => {
    if (!enabled || !isAnimating) return;
    const animationState = {
      animationMode,
      animationSpeed,
      enabled,
      isAnimating,
    };
    yearAnimationDayProgress.current = 0;
    const interval = window.setInterval(() => {
      setDateState((previous) => {
        const frame = advanceShadowAnimationFrame(
          animationState,
          previous,
          initialDateState,
          location,
          yearAnimationDayProgress.current
        );
        yearAnimationDayProgress.current = frame.yearDayProgress;
        return frame.dateState;
      });
    }, SHADOW_ANIMATION_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [
    initialDateState,
    animationMode,
    animationSpeed,
    enabled,
    isAnimating,
    location,
    setDateState,
  ]);
};
