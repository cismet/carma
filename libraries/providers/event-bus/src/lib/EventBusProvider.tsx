import { useMemo, type ReactNode } from "react";
import { EventBusContext } from "./EventBusContext";
import { createEventBus, type EventBus } from "./EventBus";

interface EventBusProviderProps<M extends Record<PropertyKey, unknown>> {
  children: ReactNode;
  bus?: EventBus<M>;
}

export function EventBusProvider<M extends Record<PropertyKey, unknown>>({
  children,
  bus,
}: EventBusProviderProps<M>) {
  const eventBus = useMemo(() => bus ?? createEventBus<M>(), [bus]);

  return (
    <EventBusContext.Provider value={eventBus}>
      {children}
    </EventBusContext.Provider>
  );
}
