import { createContext } from "react";
import type { EventBus } from "./EventBus";

export const EventBusContext = createContext<EventBus<any> | null>(null);
