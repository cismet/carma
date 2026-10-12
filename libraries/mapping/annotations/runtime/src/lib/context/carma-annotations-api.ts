import { useLayoutEffect, useRef } from "react";
import {
  registerAnnotations,
  registerCamera,
  type AnnotationsAdapter,
  type AnnotationsState,
} from "@carma-api";
import type { AnnotationToolId } from "@carma-mapping/annotations/core";

import type { AnnotationEngine } from "../engine";
import type {
  AnnotationToolDraftStore,
  AnnotationToolRegistry,
} from "../registry";
import {
  ANNOTATION_ENTRY_ROLES,
  resolveAnnotationsRuntimePersistenceFromGeoJson,
  type AnnotationGeographicCoordinate,
  type AnnotationsRuntimePersistenceEnvelope,
  type AnnotationsStore,
  type AnnotationsStoreState,
} from "../store";
import { parseAnnotationsRuntimePersistenceEnvelope } from "../store/persistence/annotations-store-persistence";
import type { AnnotationDeleteRequestOptions } from "./annotation-delete-confirmation";
import { flyToAnnotationIds } from "./annotation-fly-to";
import { createCarmaCameraApiAdapter } from "./carma-camera-api";

/**
 * `carma.annotations` on the runtime: the paths the toolbar, a click
 * (a coordinate via `requestPointAt`) and the import take.
 */
export type CarmaAnnotationsApiServices = {
  engine: AnnotationEngine | null;
  registry: AnnotationToolRegistry;
  annotationsStore: AnnotationsStore;
  annotationToolDraftStore: AnnotationToolDraftStore;
  requestModeChange: (toolId: AnnotationToolId) => void;
  requestFinishMeasurement: () => boolean;
  requestPointAt: (coordinate: AnnotationGeographicCoordinate) => boolean;
  appendAnnotationsRuntimePersistenceState: (
    persistenceState: AnnotationsRuntimePersistenceEnvelope
  ) => readonly string[];
  removeAnnotationsByIds: (
    annotationIds: readonly string[],
    options?: AnnotationDeleteRequestOptions
  ) => void;
  buildAllAnnotationsGeoJson: () => unknown;
  setSelectedAnnotationIds: (annotationIds: readonly string[]) => void;
  flyToAllAnnotations: () => void;
  labelTextDialogState: {
    open: boolean;
    initialValue: string;
    onFinish: (text: string) => void;
    onAbort: () => void;
  };
};

export const CARMA_ANNOTATIONS_API_DEFAULTS = Object.freeze({
  settleTimeoutMs: 2000,
});

/** After the next paint: React has rendered what the last call dispatched. */
const nextFrame = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 16);
    }
  });

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const waitForStore = (
  store: AnnotationsStore,
  predicate: (state: AnnotationsStoreState) => boolean,
  timeoutMs: number
) =>
  new Promise<boolean>((resolve) => {
    if (predicate(store.getState())) {
      resolve(true);
      return;
    }
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(result);
    };
    const unsubscribe = store.subscribe(() => {
      if (predicate(store.getState())) finish(true);
    });
    const timer = setTimeout(() => finish(false), timeoutMs);
  });

const entryIds = (state: AnnotationsStoreState) =>
  new Set(state.annotationEntries.map((entry) => entry.id));

const firstNewEntryId = (
  state: AnnotationsStoreState,
  before: ReadonlySet<string>
) => state.annotationEntries.find((entry) => !before.has(entry.id))?.id ?? null;

export const createCarmaAnnotationsApiAdapter = (
  getServices: () => CarmaAnnotationsApiServices
): Required<AnnotationsAdapter> => {
  const store = () => getServices().annotationsStore;

  const getState = (): AnnotationsState => {
    const services = getServices();
    const state = services.annotationsStore.getState();
    const activeTool = state.annotationToolType ?? null;
    const draftNodeCount = activeTool
      ? services.annotationToolDraftStore.get(activeTool).coordinates.length
      : 0;
    return {
      activeTool,
      tools: services.registry.orderedDescriptors.map(
        (descriptor) => descriptor.id
      ),
      selectedIds: [...(state.selectionState.selectedAnnotationIds ?? [])],
      draft:
        activeTool && draftNodeCount > 0
          ? { tool: activeTool, nodeCount: draftNodeCount }
          : null,
      textPrompt: services.labelTextDialogState.open
        ? services.labelTextDialogState.initialValue
        : null,
      annotations: state.annotationEntries.map((entry) => ({
        id: entry.id,
        type: entry.toolType,
        label: entry.shortLabel ?? null,
        nodeCount: entry.nodeIds.length,
        external: entry.annotationRole === ANNOTATION_ENTRY_ROLES.EXTERNAL,
      })),
    };
  };

  const activateTool = async (toolId: string) => {
    const services = getServices();
    if (!services.registry.getPlugin(toolId as AnnotationToolId)) return false;
    if (services.annotationsStore.getState().annotationToolType !== toolId) {
      services.requestModeChange(toolId as AnnotationToolId);
    }
    const active = await waitForStore(
      services.annotationsStore,
      (state) => state.annotationToolType === toolId,
      CARMA_ANNOTATIONS_API_DEFAULTS.settleTimeoutMs
    );
    await nextFrame();
    return active;
  };

  const pickAt = async (coordinate: AnnotationGeographicCoordinate) => {
    await nextFrame();
    const taken = getServices().requestPointAt(coordinate);
    await nextFrame();
    return taken;
  };

  const finish = async () => {
    const before = entryIds(store().getState());
    if (getServices().requestFinishMeasurement()) {
      await waitForStore(
        store(),
        (state) => firstNewEntryId(state, before) !== null,
        CARMA_ANNOTATIONS_API_DEFAULTS.settleTimeoutMs
      );
    }
    await nextFrame();
    return firstNewEntryId(store().getState(), before);
  };

  const cancel = () => {
    const services = getServices();
    const activeTool = services.annotationsStore.getState().annotationToolType;
    if (activeTool) services.annotationToolDraftStore.clear(activeTool);
  };

  const answerTextPrompt = (text: string | null) => {
    const prompt = getServices().labelTextDialogState;
    if (!prompt.open) return false;
    if (text === null) prompt.onAbort();
    else prompt.onFinish(text);
    return true;
  };

  const createMeasurement: Required<AnnotationsAdapter>["createMeasurement"] =
    async (toolId, coordinates, options = {}) => {
      const { stepDelayMs = 0, select = true } = options;
      if (!(await activateTool(toolId))) return null;
      const before = entryIds(store().getState());
      getServices().annotationToolDraftStore.clear(toolId as AnnotationToolId);
      for (const coordinate of coordinates) {
        if (stepDelayMs > 0) await sleep(stepDelayMs);
        if (!(await pickAt(coordinate))) return null;
        const prompt = getServices().labelTextDialogState;
        if (prompt.open) {
          answerTextPrompt(options.text ?? prompt.initialValue);
          await waitForStore(
            store(),
            (state) => firstNewEntryId(state, before) !== null,
            CARMA_ANNOTATIONS_API_DEFAULTS.settleTimeoutMs
          );
        }
        if (firstNewEntryId(store().getState(), before)) break;
      }
      let createdId = firstNewEntryId(store().getState(), before);
      if (!createdId) {
        if (stepDelayMs > 0) await sleep(stepDelayMs);
        await finish();
        createdId = firstNewEntryId(store().getState(), before);
      }
      if (createdId && select) {
        getServices().setSelectedAnnotationIds([createdId]);
      }
      return createdId;
    };

  const addMeasurements: Required<AnnotationsAdapter>["addMeasurements"] = (
    geoJson,
    options = {}
  ) => {
    const services = getServices();
    const envelope =
      resolveAnnotationsRuntimePersistenceFromGeoJson(geoJson) ??
      parseAnnotationsRuntimePersistenceEnvelope(geoJson);
    if (!envelope) return [];
    if (options.replace) {
      const ownIds = services.annotationsStore
        .getState()
        .annotationEntries.filter(
          (entry) => entry.annotationRole !== ANNOTATION_ENTRY_ROLES.EXTERNAL
        )
        .map((entry) => entry.id);
      if (ownIds.length > 0) {
        services.removeAnnotationsByIds(ownIds, { skipConfirmation: true });
      }
    }
    const addedIds = [
      ...services.appendAnnotationsRuntimePersistenceState(envelope),
    ];
    if (options.select && addedIds.length > 0) {
      services.setSelectedAnnotationIds(addedIds);
    }
    return addedIds;
  };

  const flyTo = (ids?: readonly string[]) => {
    const services = getServices();
    if (!ids || ids.length === 0) {
      services.flyToAllAnnotations();
      return;
    }
    const state = services.annotationsStore.getState();
    flyToAnnotationIds({
      annotationEntries: state.annotationEntries,
      annotationIds: ids,
      nodes: state.nodes,
      engine: services.engine,
    });
  };

  return {
    getState,
    subscribe: (listener) => store().subscribe(listener),
    activateTool,
    pickAt,
    finish,
    cancel,
    answerTextPrompt,
    createMeasurement,
    addMeasurements,
    exportMeasurements: () => getServices().buildAllAnnotationsGeoJson(),
    select: (ids) => getServices().setSelectedAnnotationIds(ids),
    remove: (ids) =>
      getServices().removeAnnotationsByIds(ids, { skipConfirmation: true }),
    flyTo,
  };
};

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
