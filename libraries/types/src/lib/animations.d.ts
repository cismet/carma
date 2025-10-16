import type { Radians } from "../geo/geo";
import type { EasingFunction } from "../math";

// TODO: Move animation types to dedicated @carma-commons/animation library
// This should include AnimationConfig, easing functions, and animation utilities
export type AnimationConfig = {
  delay?: number; // in ms, useful for synchronizing independent animations
  duration?: number; // in ms, also max value for dynamic duration
  easingFunction?: EasingFunction;
};

export type AnimationMapEntry = {
  id: number;
  type: AnimationType;
  cancelable: boolean;
  next?: AnimationMapEntry;
};
export type AnimationMap = WeakMap<Scene, AnimationMapEntry>;

export const AnimationTypes = {
  ResetView: "ResetView",
  Tilt: "Tilt",
  Rotate: "Rotate",
  FovChange: "FovChange",
} as const;

export type AnimationType =
  (typeof AnimationTypes)[keyof typeof AnimationTypes];
