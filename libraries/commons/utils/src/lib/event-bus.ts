// Generic, framework-agnostic typed event bus
// M is a map from event keys to payload types
export type SubscribeFn<M extends Record<PropertyKey, unknown>> = <
  E extends keyof M
>(
  type: E,
  listener: (payload: M[E]) => void
) => () => void;

export type EmitFn<M extends Record<PropertyKey, unknown>> = <
  E extends keyof M
>(
  type: E,
  payload: M[E]
) => void;

export type EventBus<M extends Record<PropertyKey, unknown>> = {
  subscribe: SubscribeFn<M>;
  emit: EmitFn<M>;
};

export function createEventBus<
  M extends Record<PropertyKey, unknown>
>(): EventBus<M> {
  type InternalListener = (payload: unknown) => void;
  const bus = new Map<keyof M, Set<InternalListener>>();

  const subscribe: SubscribeFn<M> = (type, listener) => {
    let set = bus.get(type);
    if (!set) {
      set = new Set<InternalListener>();
      bus.set(type, set);
    }
    const wrapped: InternalListener = (payload) =>
      listener(payload as M[typeof type]);
    set.add(wrapped);
    return () => set!.delete(wrapped);
  };

  const emit: EmitFn<M> = (type, payload) => {
    const set = bus.get(type);
    if (!set || set.size === 0) return;
    set.forEach((fn) => fn(payload as unknown));
  };

  return { subscribe, emit };
}
