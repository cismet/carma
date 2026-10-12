import { createContext, useContext } from "react";

import type { GeoportalAnnotationEngineState } from "../../hooks/use-geoportal-annotation-engine";

/**
 * Whether the 3D view hosts the app's annotation runtime right now. Consumers
 * gate the measurement mode on this instead of `isCesium`, so the gate follows
 * the engine rather than the framework switch.
 */
export const GeoportalAnnotationHostContext =
  createContext<GeoportalAnnotationEngineState>(
    Object.freeze({ engine: null, is3dAnnotationHost: false })
  );

export const useGeoportalAnnotationHost = (): GeoportalAnnotationEngineState =>
  useContext(GeoportalAnnotationHostContext);
