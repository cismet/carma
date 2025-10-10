import { createContext, MutableRefObject } from "react";
import type L from "leaflet";
import type {
  SubscribeTopicMapCtxFn,
  EmitTopicMapCtxFn,
} from "./carmaTopicMapContextEventMap";

export interface TopicMapContextType {
  isSuspendedRef: MutableRefObject<boolean>;
  subscribe: SubscribeTopicMapCtxFn;
  emit: EmitTopicMapCtxFn;
  leafletMap: L.Map | undefined;
  isMapReady: boolean;
}

export const TopicMapContext = createContext<TopicMapContextType | null>(null);
