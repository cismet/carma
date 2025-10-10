import { createContext, MutableRefObject } from "react";
import type L from "leaflet";
import type {
  SubscribeTopicMapCtxFn,
  EmitTopicMapCtxFn,
} from "./carmaTopicMapContextEventMap";

export interface CarmaTopicMapContextType {
  isSuspendedRef: MutableRefObject<boolean>;
  subscribe: SubscribeTopicMapCtxFn;
  emit: EmitTopicMapCtxFn;
  leafletMapRef: MutableRefObject<L.Map | undefined>;
}

export const CarmaTopicMapContext =
  createContext<CarmaTopicMapContextType | null>(null);
