import { useContext, useEffect, useMemo, useRef, type ReactNode } from "react";

import * as L from "leaflet";
import {
  TopicMapContextProvider,
  TopicMapContext as ReactCismapTopicMapContext,
} from "react-cismap/contexts/TopicMapContextProvider";
import { createEventBus } from "@carma/providers/event-bus";

import {
  CarmaTopicMapContext,
  type CarmaTopicMapContextType,
} from "./CarmaTopicMapContext";
import type { TopicMapContextEventMap } from "./carmaTopicMapContextEventMap";
import { TopicMapCtxEvent } from "./carmaTopicMapContextEventMap";

export interface CarmaTopicMapContextProviderProps {
  children: ReactNode;
  infoBoxPixelWidth?: number;
}

/**
 * Inner component that accesses react-cismap context and provides leafletMap
 */
const CarmaTopicMapContextInner = ({ children }: { children: ReactNode }) => {
  const reactCismapContext = useContext(ReactCismapTopicMapContext);
  const isSuspendedRef = useRef(false);
  const leafletMapRef = useRef<L.Map | undefined>(undefined);

  // Event bus for the TopicMap context
  const { subscribe, emit } = useMemo(
    () => createEventBus<TopicMapContextEventMap>(),
    []
  );

  // Update isSuspendedRef when suspend/activate events are emitted
  useEffect(() => {
    const unsubActivate = subscribe(TopicMapCtxEvent.Activate, () => {
      isSuspendedRef.current = false;
      console.debug("[TopicMapContext] Activate");
    });
    const unsubSuspend = subscribe(TopicMapCtxEvent.Suspend, () => {
      isSuspendedRef.current = true;
      console.debug("[TopicMapContext] Suspend");
    });
    return () => {
      unsubActivate();
      unsubSuspend();
    };
  }, [subscribe]);

  // Direct access to leaflet map element
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletMap = (reactCismapContext as any).routedMapRef?.leafletMap
    ?.leafletElement;

  // Update the ref and emit MapReady event
  useEffect(() => {
    leafletMapRef.current = leafletMap;
    if (leafletMap) {
      leafletMap.whenReady(() => {
        console.debug("[TopicMapContext] Leaflet map ready");
        emit(TopicMapCtxEvent.MapReady, undefined);
      });
    }
  }, [leafletMap, emit]);

  const contextValue = useMemo<CarmaTopicMapContextType>(
    () => ({
      isSuspendedRef,
      subscribe,
      emit,
      leafletMapRef,
    }),
    [subscribe, emit]
  );

  console.debug("[CarmaTopicMapContextProvider] Rendered", contextValue);

  return (
    <CarmaTopicMapContext.Provider value={contextValue}>
      {children}
    </CarmaTopicMapContext.Provider>
  );
};

/**
 * Augments react-cismap TopicMapContextProvider with event bus for engine-level coordination.
 * Manages suspended state and emits/subscribes to TopicMap-specific events.
 */
export const CarmaTopicMapContextProvider = ({
  children,
  infoBoxPixelWidth = 350,
}: CarmaTopicMapContextProviderProps) => {
  return (
    <TopicMapContextProvider infoBoxPixelWidth={infoBoxPixelWidth}>
      <CarmaTopicMapContextInner>{children}</CarmaTopicMapContextInner>
    </TopicMapContextProvider>
  );
};

export default CarmaTopicMapContextProvider;
