import { useLayoutEffect, useRef } from "react";
import { registerAnnotations, registerCamera } from "@carma-api";

import {
  createCarmaAnnotationsApiAdapter,
  type CarmaAnnotationsApiServices,
} from "./carma-annotations-api";
import { createCarmaCameraApiAdapter } from "./carma-camera-api";

// Runtimes mounted at once (a story next to another, a remount): the latest
// one answers, and when it unmounts the one before it takes over again.
const createAdapterStack = <TAdapter>(
  register: (adapter: TAdapter | null) => void
) => {
  const adapters: TAdapter[] = [];
  const publish = () => register(adapters.at(-1) ?? null);
  return (adapter: TAdapter) => {
    adapters.push(adapter);
    publish();
    return () => {
      const index = adapters.indexOf(adapter);
      if (index >= 0) adapters.splice(index, 1);
      publish();
    };
  };
};
const pushAnnotationsAdapter = createAdapterStack(registerAnnotations);
const pushCameraAdapter = createAdapterStack(registerCamera);

/**
 * Registers the runtime as `carma.annotations`, and its engine as
 * `carma.camera`, while it is mounted.
 */
export const useCarmaAnnotationsApi = (
  services: CarmaAnnotationsApiServices,
  enabled: boolean
) => {
  const servicesRef = useRef(services);
  servicesRef.current = services;
  useLayoutEffect(() => {
    if (!enabled) return;
    const removeAnnotations = pushAnnotationsAdapter(
      createCarmaAnnotationsApiAdapter(() => servicesRef.current)
    );
    const removeCamera = pushCameraAdapter(
      createCarmaCameraApiAdapter(() => servicesRef.current.engine)
    );
    return () => {
      removeCamera();
      removeAnnotations();
    };
  }, [enabled]);
};
