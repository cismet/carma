import { useContext } from "react";
import { EventBusContext } from "./EventBusContext";
import type { EventBus } from "./EventBus";

export function useEventBus<
  M extends Record<PropertyKey, unknown>
>(): EventBus<M> {
  const bus = useContext(EventBusContext);
  if (!bus) {
    throw new Error("useEventBus must be used within an EventBusProvider");
  }
  return bus as EventBus<M>;
}
