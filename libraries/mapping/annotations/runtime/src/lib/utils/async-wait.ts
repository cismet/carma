/** Resolves after the next paint, so React has rendered what was dispatched before. */
export const nextFrame = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 16);
    }
  });

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

type ObservableState<TState> = {
  getState: () => TState;
  subscribe: (listener: () => void) => () => void;
};

/** True once `predicate` holds for the source's state, false after `timeoutMs`. */
export const waitForState = <TState>(
  source: ObservableState<TState>,
  predicate: (state: TState) => boolean,
  timeoutMs: number
) =>
  new Promise<boolean>((resolve) => {
    if (predicate(source.getState())) {
      resolve(true);
      return;
    }
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(result);
    };
    const unsubscribe = source.subscribe(() => {
      if (predicate(source.getState())) finish(true);
    });
    const timer = setTimeout(() => finish(false), timeoutMs);
  });
