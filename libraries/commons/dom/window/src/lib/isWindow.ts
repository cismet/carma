export const isWindow = (window: unknown): window is Window => {
  return window instanceof Window;
};
