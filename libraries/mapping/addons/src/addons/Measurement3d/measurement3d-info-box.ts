import { useSyncExternalStore, type ComponentType } from "react";

/** What the host's info box gets from the runtime: rendered inside its provider. */
export type Measurement3dInfoBoxProps = {
  /** The tool is on: drafting and editing help belongs in the box. */
  authoring: boolean;
  controlOrder: number;
  pixelWidth: number;
};

type InfoBoxComponent = ComponentType<Measurement3dInfoBoxProps>;

// Registrations in order; the latest one still registered is the box. A host
// component that remounts registers again before its old instance cleans up,
// so a plain setter would let that cleanup clear the new registration.
const registrations: InfoBoxComponent[] = [];
let infoBox: InfoBoxComponent | null = null;
const listeners = new Set<() => void>();

const publish = () => {
  const next = registrations[registrations.length - 1] ?? null;
  if (next === infoBox) return;
  infoBox = next;
  for (const listener of listeners) listener();
};

/**
 * A host may replace the runtime's plain info box with its own, the one its
 * other measurement view shows (Geoportal: the Cesium info box with its
 * hidden actions, help texts and the header of saved sets). Returns the
 * unregister call; with no registration left the plain box returns.
 */
export const registerMeasurement3dInfoBox = (
  component: InfoBoxComponent
): (() => void) => {
  registrations.push(component);
  publish();
  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    const index = registrations.lastIndexOf(component);
    if (index >= 0) registrations.splice(index, 1);
    publish();
  };
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useMeasurement3dInfoBox = () =>
  useSyncExternalStore(subscribe, () => infoBox, () => null);
