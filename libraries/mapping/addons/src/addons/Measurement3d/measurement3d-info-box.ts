import { useSyncExternalStore, type ComponentType } from "react";

/** What the host's info box gets from the runtime: rendered inside its provider. */
export type Measurement3dInfoBoxProps = {
  /** The tool is on: drafting and editing help belongs in the box. */
  authoring: boolean;
  controlOrder: number;
  pixelWidth: number;
};

let infoBox: ComponentType<Measurement3dInfoBoxProps> | null = null;
const listeners = new Set<() => void>();

/**
 * A host may replace the runtime's plain info box with its own, the one its
 * other measurement view shows (Geoportal: the Cesium info box with its
 * hidden actions, help texts and the header of saved sets). Null restores
 * the plain one.
 */
export const setMeasurement3dInfoBox = (
  next: ComponentType<Measurement3dInfoBoxProps> | null
) => {
  if (infoBox === next) return;
  infoBox = next;
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useMeasurement3dInfoBox = () =>
  useSyncExternalStore(subscribe, () => infoBox, () => null);
