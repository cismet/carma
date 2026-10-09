import { createContext, useContext, type ReactNode } from "react";

import type { GeoportalAnnotationEngineState } from "../../hooks/use-geoportal-annotation-engine";

const NO_ANNOTATION_HOST: GeoportalAnnotationEngineState = Object.freeze({
  engine: null,
  is3dAnnotationHost: false,
});

const GeoportalAnnotationHostContext =
  createContext<GeoportalAnnotationEngineState>(NO_ANNOTATION_HOST);

type GeoportalAnnotationHostProviderProps = {
  value: GeoportalAnnotationEngineState;
  children: ReactNode;
};

/**
 * Whether the 3D view hosts the app's annotation runtime right now. Consumers
 * gate the measurement mode on this instead of `isCesium`, so the gate follows
 * the engine rather than the framework switch.
 */
export const GeoportalAnnotationHostProvider = ({
  value,
  children,
}: GeoportalAnnotationHostProviderProps) => (
  <GeoportalAnnotationHostContext.Provider value={value}>
    {children}
  </GeoportalAnnotationHostContext.Provider>
);

export const useGeoportalAnnotationHost = (): GeoportalAnnotationEngineState =>
  useContext(GeoportalAnnotationHostContext);
