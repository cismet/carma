/**
 * Easing functions for animations.
 * Each function takes a time value between 0 and 1 and returns an eased value between 0 and 1.
 * Based on standard easing equations.
 *
 * @see https://easings.net/
 */

export type EasingFunction = (time: number) => number;

/**
 * Linear interpolation (no easing)
 */
export const LINEAR_NONE: EasingFunction = (time: number) => time;

/**
 * Quadratic ease-in
 */
export const QUADRATIC_IN: EasingFunction = (time: number) => time * time;

/**
 * Quadratic ease-out
 */
export const QUADRATIC_OUT: EasingFunction = (time: number) =>
  time * (2 - time);

/**
 * Quadratic ease-in-out
 */
export const QUADRATIC_IN_OUT: EasingFunction = (time: number) => {
  if (time < 0.5) {
    return 2 * time * time;
  }
  return -1 + (4 - 2 * time) * time;
};

/**
 * Cubic ease-in
 */
export const CUBIC_IN: EasingFunction = (time: number) => time * time * time;

/**
 * Cubic ease-out
 */
export const CUBIC_OUT: EasingFunction = (time: number) => {
  const t = time - 1;
  return t * t * t + 1;
};

/**
 * Cubic ease-in-out
 */
export const CUBIC_IN_OUT: EasingFunction = (time: number) => {
  if (time < 0.5) {
    return 4 * time * time * time;
  }
  const t = 2 * time - 2;
  return (t * t * t + 2) / 2;
};

/**
 * Sinusoidal ease-in
 */
export const SINUSOIDAL_IN: EasingFunction = (time: number) => {
  return 1 - Math.cos((time * Math.PI) / 2);
};

/**
 * Sinusoidal ease-out
 */
export const SINUSOIDAL_OUT: EasingFunction = (time: number) => {
  return Math.sin((time * Math.PI) / 2);
};

/**
 * Sinusoidal ease-in-out
 */
export const SINUSOIDAL_IN_OUT: EasingFunction = (time: number) => {
  return -(Math.cos(Math.PI * time) - 1) / 2;
};

/**
 * Exponential ease-in
 */
export const EXPONENTIAL_IN: EasingFunction = (time: number) => {
  return time === 0 ? 0 : Math.pow(2, 10 * (time - 1));
};

/**
 * Exponential ease-out
 */
export const EXPONENTIAL_OUT: EasingFunction = (time: number) => {
  return time === 1 ? 1 : 1 - Math.pow(2, -10 * time);
};

/**
 * Exponential ease-in-out
 */
export const EXPONENTIAL_IN_OUT: EasingFunction = (time: number) => {
  if (time === 0 || time === 1) return time;

  if (time < 0.5) {
    return Math.pow(2, 20 * time - 10) / 2;
  }
  return (2 - Math.pow(2, -20 * time + 10)) / 2;
};

/**
 * All easing functions grouped by family
 */
export const Easing = {
  LINEAR_NONE,
  QUADRATIC_IN,
  QUADRATIC_OUT,
  QUADRATIC_IN_OUT,
  CUBIC_IN,
  CUBIC_OUT,
  CUBIC_IN_OUT,
  SINUSOIDAL_IN,
  SINUSOIDAL_OUT,
  SINUSOIDAL_IN_OUT,
  EXPONENTIAL_IN,
  EXPONENTIAL_OUT,
  EXPONENTIAL_IN_OUT,
} as const;
