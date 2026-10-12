import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import type { AnnotationToolRegistry } from "../registry";
import {
  appendAnnotationEntities,
  removeAnnotationById,
  setAnnotationToolType,
  updateNodeCoordinateById,
} from "../store/create-annotations-store";
import { loadAnnotationsRuntimePersistenceState } from "../store/persistence/annotations-store-persistence";
import { useLocalAnnotationsRuntimePersistence } from "../store/persistence/useLocalAnnotationsStorePersistence";
import { useAnnotationsRuntimeStores } from "./use-annotations-runtime-stores";

const registry = { getPlugin: () => ({}) } as unknown as AnnotationToolRegistry;
const coordinate = { longitude: 7, latitude: 51, altitude: 100 };
const addPoint = appendAnnotationEntities({
  annotationEntry: {
    id: "measurement-1",
    toolType: ANNOTATION_TYPES.POINT,
    nodeIds: ["node-1"],
    edgeIds: [],
  },
  nodes: [{ id: "node-1", coordinate }],
  linkedNodeGroups: [],
  edges: [],
});
const useRuntime = (storageKey: string, shared = true) => {
  const persistence = useLocalAnnotationsRuntimePersistence({ storageKey });
  return useAnnotationsRuntimeStores({
    registry,
    initialToolType: ANNOTATION_TYPES.POINT,
    initialPointTemporaryMode: false,
    storeKey: shared ? storageKey : undefined,
    ...persistence,
  });
};
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("working measurements across mapping engines", () => {
  it("keeps creation, editing and deletion synchronized without stale writes", () => {
    const key = "shared-measurements";
    const maplibre = renderHook(() => useRuntime(key));
    const cesium = renderHook(() => useRuntime(key));
    act(() => maplibre.result.current.annotationsStore.dispatch(addPoint));
    expect(
      cesium.result.current.annotationsStore.getState().annotationEntries
    ).toHaveLength(1);
    act(() =>
      cesium.result.current.annotationsStore.dispatch(
        setAnnotationToolType(ANNOTATION_TYPES.DISTANCE)
      )
    );
    expect(
      loadAnnotationsRuntimePersistenceState(key)?.tables.annotationEntries
    ).toHaveLength(1);
    act(() =>
      cesium.result.current.annotationsStore.dispatch(
        updateNodeCoordinateById({
          nodeId: "node-1",
          coordinate: { ...coordinate, altitude: 105 },
        })
      )
    );
    expect(
      maplibre.result.current.annotationsStore.getState().nodes[0]?.coordinate
        .altitude
    ).toBe(105);
    expect(
      loadAnnotationsRuntimePersistenceState(key)?.tables.nodes[0]?.coordinate
        .altitude
    ).toBe(105);
    act(() =>
      maplibre.result.current.annotationsStore.dispatch(
        removeAnnotationById({ annotationId: "measurement-1" })
      )
    );
    expect(
      cesium.result.current.annotationsStore.getState().annotationEntries
    ).toHaveLength(0);
    expect(
      loadAnnotationsRuntimePersistenceState(key)?.tables.annotationEntries
    ).toHaveLength(0);
  });

  it("keeps shared drafts and counters while one host unmounts, then reloads persistence on a fresh mount", () => {
    const key = "remounted-measurements";
    const first = renderHook(() => useRuntime(key));
    const second = renderHook(() => useRuntime(key));
    act(() => {
      first.result.current.annotationsStore.dispatch(addPoint);
      first.result.current.annotationToolDraftStore.set(
        ANNOTATION_TYPES.DISTANCE,
        { coordinates: [coordinate], linkedNodeGroupIds: [null] }
      );
      first.result.current.sequenceRefs.measurementSequenceRef.current = 2;
    });
    first.unmount();
    expect(
      second.result.current.annotationToolDraftStore.get(
        ANNOTATION_TYPES.DISTANCE
      ).coordinates
    ).toEqual([coordinate]);
    expect(
      second.result.current.sequenceRefs.measurementSequenceRef.current
    ).toBe(2);
    second.unmount();
    const fresh = renderHook(() => useRuntime(key));
    expect(
      fresh.result.current.annotationsStore.getState().annotationEntries
    ).toHaveLength(1);
    expect(
      fresh.result.current.annotationToolDraftStore.get(
        ANNOTATION_TYPES.DISTANCE
      ).coordinates
    ).toHaveLength(0);
    expect(
      fresh.result.current.sequenceRefs.measurementSequenceRef.current
    ).toBe(1);
  });

  it("keeps different keys and explicitly standalone stores isolated", () => {
    const first = renderHook(() => useRuntime("first"));
    const other = renderHook(() => useRuntime("other"));
    const standalone = renderHook(() => useRuntime("first", false));
    act(() => first.result.current.annotationsStore.dispatch(addPoint));
    expect(
      other.result.current.annotationsStore.getState().annotationEntries
    ).toHaveLength(0);
    expect(
      standalone.result.current.annotationsStore.getState().annotationEntries
    ).toHaveLength(0);
  });
});
