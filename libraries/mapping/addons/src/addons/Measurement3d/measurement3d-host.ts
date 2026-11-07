import { useSyncExternalStore, type ComponentType } from "react";
import type {
  AnnotationDeleteConfirmationRequester,
  RuntimeAnnotationsToolbarProps,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";

/** A value the addon's tree and the host's tree share, read as a hook. */
const createExternalStore = <T>(initial: T) => {
  let value = initial;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  return {
    get: () => value,
    set: (next: T) => {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of listeners) listener();
    },
    use: () =>
      useSyncExternalStore(
        subscribe,
        () => value,
        () => initial
      ),
  };
};

/**
 * The ribbon the host renders for the row lives outside the addon's React
 * tree, while the toolbar needs the addon's annotation runtime. The panel
 * publishes its element here and the addon portals the toolbar into it, which
 * keeps the toolbar inside the runtime's context.
 */
const panelHost = createExternalStore<HTMLElement | null>(null);
export const setMeasurement3dPanelHost = panelHost.set;
export const useMeasurement3dPanelHost = panelHost.use;

/**
 * The part of the annotations runtime the host needs outside the addon's
 * provider: the layer-bar row (show all, save, delete all), the save panel
 * under it and the sync of saved measurement collections all live in the
 * host's tree, so the runtime publishes these services while it is mounted.
 */
export type Measurement3dRuntimeServices = Pick<
  ReturnType<typeof useAnnotationsRuntime>,
  | "annotationEntries"
  | "nodes"
  | "engine"
  | "setSelectedAnnotationId"
  | "appendAnnotationsRuntimePersistenceState"
  | "removeExternalAnnotationsByCollection"
  | "buildAllAnnotationsGeoJson"
  | "removeAnnotationsByIds"
  | "flyToAllAnnotations"
  | "exportAllAnnotationsGeoJson"
>;

const runtimeServices =
  createExternalStore<Measurement3dRuntimeServices | null>(null);
export const setMeasurement3dRuntimeServices = runtimeServices.set;
/** Null while no measurement runtime is mounted. */
export const useMeasurement3dRuntimeServices = runtimeServices.use;

/** What the host's info box gets from the runtime: rendered inside its provider. */
export type Measurement3dInfoBoxProps = {
  /** The tool is on: drafting and editing help belongs in the box. */
  authoring: boolean;
  controlOrder: number;
  pixelWidth: number;
};

/**
 * What a host may replace in the addon's plain UI with its own, so the
 * MapLibre view looks and asks like its other measurement view. Everything is
 * optional; the addon's plain version stays where the host gives nothing.
 */
export type Measurement3dHostUi = {
  /** The info box (Geoportal: the Cesium one with hidden actions, help texts and the saved sets' header). */
  InfoBox?: ComponentType<Measurement3dInfoBoxProps>;
  /** Look of the ribbon toolbar. */
  toolbar?: Pick<
    RuntimeAnnotationsToolbarProps,
    "classNames" | "renderToolButtonBackdrop"
  >;
  /** Asked before measurements are deleted. */
  confirmDelete?: AnnotationDeleteConfirmationRequester;
};

const hostUi = createExternalStore<Measurement3dHostUi | null>(null);
export const useMeasurement3dHostUi = hostUi.use;

/**
 * Returns the unregister call. A host component that remounts registers again
 * before its old instance cleans up, so the cleanup only clears its own entry.
 */
export const registerMeasurement3dHostUi = (
  ui: Measurement3dHostUi
): (() => void) => {
  hostUi.set(ui);
  return () => {
    if (hostUi.get() === ui) hostUi.set(null);
  };
};
