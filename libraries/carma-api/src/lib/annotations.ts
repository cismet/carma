import { createNamespace } from "./create-namespace";

/** WGS84 degrees, altitude in meters as the measurement export stores it. */
export type AnnotationCoordinate = {
  longitude: number;
  latitude: number;
  altitude: number;
};

export type AnnotationSummary = {
  id: string;
  /** stored type: "point", "distance", "area", "planar", "vertical", ... */
  type: string;
  /** short label as on the map ("A", "1"), null without one */
  label: string | null;
  nodeCount: number;
  /** saved collections shown read-only next to the user's own measurements */
  external: boolean;
};

export type AnnotationsState = {
  /** the tool in charge, "select" between measurements */
  activeTool: string | null;
  /** tool ids the runtime offers, in toolbar order */
  tools: string[];
  selectedIds: string[];
  /** nodes placed so far by the active tool, null without a draft */
  draft: { tool: string; nodeCount: number } | null;
  /** the text a label proposes while its tool asks for one, else null */
  textPrompt: string | null;
  annotations: AnnotationSummary[];
};

export type CreateMeasurementOptions = {
  /** pause before each node, so a replay can be watched; default 0 */
  stepDelayMs?: number;
  /** the text a label gets; the proposed text when omitted */
  text?: string;
  /** select the new measurement when it is done; default true */
  select?: boolean;
};

export type AddMeasurementsOptions = {
  /** remove the user's own measurements first; default false */
  replace?: boolean;
  /** select what was added; default false */
  select?: boolean;
};

/** Registered by the mounted measurement runtime; the facade no-ops without one. */
export interface AnnotationsAdapter {
  getState?: () => AnnotationsState;
  subscribe?: (listener: () => void) => () => void;
  activateTool?: (toolId: string) => Promise<boolean>;
  pickAt?: (coordinate: AnnotationCoordinate) => Promise<boolean>;
  finish?: () => Promise<string | null>;
  cancel?: () => void;
  answerTextPrompt?: (text: string | null) => boolean;
  createMeasurement?: (
    toolId: string,
    coordinates: readonly AnnotationCoordinate[],
    options?: CreateMeasurementOptions
  ) => Promise<string | null>;
  addMeasurements?: (
    geoJson: unknown,
    options?: AddMeasurementsOptions
  ) => string[];
  exportMeasurements?: () => unknown;
  select?: (ids: readonly string[]) => void;
  remove?: (ids: readonly string[]) => void;
  flyTo?: (ids?: readonly string[]) => void;
}

/** The measurement tools as calls: replay how a measurement is made, or add finished ones. */
export interface AnnotationsFacade {
  /** whether a measurement runtime is mounted and registered */
  isAvailable: () => boolean;
  /** snapshot of tools, selection, draft and measurements; null without a runtime */
  getState: () => AnnotationsState | null;
  /** called on every change of the runtime state; returns its remover */
  subscribe: (listener: () => void) => () => void;
  /** Switch tools like the toolbar (finishing a draft); false for an unknown tool. */
  activateTool: (toolId: string) => Promise<boolean>;
  /** A click of the active tool at the coordinate; false when the tool takes no points. */
  pickAt: (coordinate: AnnotationCoordinate) => Promise<boolean>;
  /** finish the active tool's draft like a double click; resolves with the new id */
  finish: () => Promise<string | null>;
  /** drop the active tool's draft */
  cancel: () => void;
  /** Answer the label text prompt like the user (null cancels); false without a prompt. */
  answerTextPrompt: (text: string | null) => boolean;
  /** Activate, click every coordinate, finish if needed; resolves with the new id or null. */
  createMeasurement: (
    toolId: string,
    coordinates: readonly AnnotationCoordinate[],
    options?: CreateMeasurementOptions
  ) => Promise<string | null>;
  /** Add measurements from the measurement export; returns their ids. */
  addMeasurements: (
    geoJson: unknown,
    options?: AddMeasurementsOptions
  ) => string[];
  /** all measurements as the measurement export; null without a runtime */
  exportMeasurements: () => unknown;
  select: (ids: readonly string[]) => void;
  /** remove without asking */
  remove: (ids: readonly string[]) => void;
  /** frame these measurements, all of them without ids */
  flyTo: (ids?: readonly string[]) => void;
}

export const { facade: annotations, register: registerAnnotations } =
  createNamespace<AnnotationsAdapter, AnnotationsFacade>((get) => ({
    isAvailable: () => get() !== null,
    getState: () => get()?.getState?.() ?? null,
    subscribe: (listener) => get()?.subscribe?.(listener) ?? (() => undefined),
    activateTool: (toolId) =>
      get()?.activateTool?.(toolId) ?? Promise.resolve(false),
    pickAt: (coordinate) =>
      get()?.pickAt?.(coordinate) ?? Promise.resolve(false),
    finish: () => get()?.finish?.() ?? Promise.resolve(null),
    cancel: () => get()?.cancel?.(),
    answerTextPrompt: (text) => get()?.answerTextPrompt?.(text) ?? false,
    createMeasurement: (toolId, coordinates, options) =>
      get()?.createMeasurement?.(toolId, coordinates, options) ??
      Promise.resolve(null),
    addMeasurements: (geoJson, options) =>
      get()?.addMeasurements?.(geoJson, options) ?? [],
    exportMeasurements: () => get()?.exportMeasurements?.() ?? null,
    select: (ids) => get()?.select?.(ids),
    remove: (ids) => get()?.remove?.(ids),
    flyTo: (ids) => get()?.flyTo?.(ids),
  }));
