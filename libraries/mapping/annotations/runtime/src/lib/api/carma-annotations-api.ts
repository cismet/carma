import type { AnnotationsAdapter, AnnotationsState } from "@carma-api";
import type {
  AnnotationToolId,
  AnnotationEngine,
} from "@carma-mapping/annotations/core";

import type {
  AnnotationToolDraftStore,
  AnnotationToolRegistry,
} from "../registry";
import {
  ANNOTATION_ENTRY_ROLES,
  parseAnnotationsRuntimePersistenceEnvelope,
  resolveAnnotationsRuntimePersistenceFromGeoJson,
  type AnnotationGeographicCoordinate,
  type AnnotationsRuntimePersistenceEnvelope,
  type AnnotationsStore,
  type AnnotationsStoreState,
} from "../store";
import type { AnnotationDeleteRequestOptions } from "../context/annotation-delete-confirmation";
import { flyToAnnotationIds } from "../context/annotation-fly-to";
import type { AnnotationLabelTextDialogState } from "../context/use-annotation-label-text-request";
import { nextFrame, sleep, waitForState } from "../utils/async-wait";

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
  labelTextDialogState: Pick<
    AnnotationLabelTextDialogState,
    "open" | "initialValue" | "onFinish" | "onAbort"
  >;
};

/** How long a call waits for the runtime to take a dispatched step. */
const SETTLE_TIMEOUT_MS = 2000;

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
    const active = await waitForState(
      services.annotationsStore,
      (state) => state.annotationToolType === toolId,
      SETTLE_TIMEOUT_MS
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
      await waitForState(
        store(),
        (state) => firstNewEntryId(state, before) !== null,
        SETTLE_TIMEOUT_MS
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
          await waitForState(
            store(),
            (state) => firstNewEntryId(state, before) !== null,
            SETTLE_TIMEOUT_MS
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
