export const computeAlphaDamped = (dt: number, tauMs: number): number => {
  const tau = Math.max(1, tauMs);
  return 1 - Math.exp(-dt / tau);
};

export const computeAlphaTimed = (
  time: number,
  startTime: number,
  duration: number,
  easing: (t: number) => number
): number => {
  const t = Math.min((time - startTime) / Math.max(1, duration), 1);
  return easing(t);
};
