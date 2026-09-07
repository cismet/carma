export type AddonStateRecord = Record<string, unknown>;
export type AddonStateSet = (key: string, action: unknown) => void;

/** Route-local channels: unrelated producers must not invalidate each other. */
export const createAddonStateStore = (initialState: AddonStateRecord = {}) => {
  let state = initialState;
  const listeners = new Map<string | undefined, Set<() => void>>();
  const subscribe = (key: string | undefined, listener: () => void) => {
    const channel = listeners.get(key) ?? new Set<() => void>();
    channel.add(listener);
    listeners.set(key, channel);
    return () => {
      channel.delete(listener);
      if (!channel.size) listeners.delete(key);
    };
  };
  const set: AddonStateSet = (key, action) => {
    const previous = state[key];
    const next = typeof action === "function" ? action(previous) : action;
    if (Object.is(previous, next)) return;
    state = { ...state, [key]: next };
    listeners.get(key)?.forEach((listener) => listener());
    listeners.get(undefined)?.forEach((listener) => listener());
  };
  return { getSnapshot: () => state, subscribe, set };
};
