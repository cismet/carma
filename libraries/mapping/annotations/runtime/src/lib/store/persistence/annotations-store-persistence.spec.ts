import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import { PI_OVER_TWO } from "@carma-units";
import { describe, expect, it } from "vitest";
import type {
  AnnotationsRuntimePersistenceEnvelope,
  AnnotationsStoreState,
  StoredAnnotation,
} from "../index";
import {
  buildAnnotationsRuntimePersistenceState,
  resolvePersistedAnnotationsStoreState,
} from "./annotations-store-persistence";

const createStoredAnnotation = (
  overrides: Partial<StoredAnnotation> = {}
): StoredAnnotation => ({
  id: "annotation-1",
  toolType: ANNOTATION_TYPES.AREA_PLANAR,
  nodeIds: [],
  edgeIds: [],
  ...overrides,
});

const createStoreState = (
  annotationEntries: readonly StoredAnnotation[]
): AnnotationsStoreState => ({
  annotationToolType: ANNOTATION_TYPES.AREA_PLANAR,
  selectionState: {
    selectedAnnotationIds: [],
    previousSelectedAnnotationId: null,
  },
  annotationEntries,
  nodes: [],
  linkedNodeGroups: [],
  edges: [],
  infoBoxState: {
    activeAnnotationId: null,
  },
  settingsState: {
    pointTemporaryMode: false,
    elevationReferenceAnnotationId: null,
    nextShortLabelCounterByToolType: {},
  },
});

describe("annotationsStorePersistence bearing migration", () => {
  it("loads persisted current-format preferred normal bearings in radians", () => {
    const persistedState = {
      formatId: "annotations-runtime-persistence",
      version: 1,
      tables: {
        annotationEntries: [
          {
            id: "annotation-1",
            toolType: ANNOTATION_TYPES.AREA_PLANAR,
            nodeIds: [],
            edgeIds: [],
            preferredNormalBearingRad: PI_OVER_TWO,
          },
        ],
        nodes: [],
        linkedNodeGroups: [],
        edges: [],
      },
      settings: {
        elevationReferenceAnnotationId: null,
        nextShortLabelCounterByToolType: {},
      },
    } as unknown as AnnotationsRuntimePersistenceEnvelope;

    const state = resolvePersistedAnnotationsStoreState({
      initialToolType: ANNOTATION_TYPES.AREA_PLANAR,
      initialPointTemporaryMode: false,
      initialPersistenceState: persistedState,
    });

    expect(state.annotationEntries[0]?.preferredNormalBearingRad).toBeCloseTo(
      PI_OVER_TWO,
      8
    );
  });

  it("discards incompatible persisted formats", () => {
    const state = resolvePersistedAnnotationsStoreState({
      initialToolType: ANNOTATION_TYPES.AREA_PLANAR,
      initialPointTemporaryMode: false,
      initialPersistenceState: {
        formatId: "annotations-runtime-persistence",
        version: 5,
        tables: {
          annotationEntries: [
            {
              id: "annotation-1",
              toolType: ANNOTATION_TYPES.AREA_PLANAR,
              nodeIds: [],
              edgeIds: [],
              preferredNormalBearingRad: PI_OVER_TWO,
            },
          ],
          nodes: [],
          linkedNodeGroups: [],
          edges: [],
        },
        settings: {
          elevationReferenceAnnotationId: "annotation-1",
          nextShortLabelCounterByToolType: {},
        },
      } as unknown as AnnotationsRuntimePersistenceEnvelope,
    });

    expect(state.annotationEntries).toEqual([]);
    expect(state.nodes).toEqual([]);
    expect(state.linkedNodeGroups).toEqual([]);
    expect(state.edges).toEqual([]);
    expect(state.settingsState.elevationReferenceAnnotationId).toBeNull();
  });

  it("discards persisted state with the wrong format id", () => {
    const state = resolvePersistedAnnotationsStoreState({
      initialToolType: ANNOTATION_TYPES.AREA_PLANAR,
      initialPointTemporaryMode: false,
      initialPersistenceState: {
        formatId: "annotations-runtime-other",
        version: 1,
        tables: {
          annotationEntries: [
            {
              id: "annotation-1",
              toolType: ANNOTATION_TYPES.AREA_PLANAR,
              nodeIds: [],
              edgeIds: [],
              preferredNormalBearingRad: PI_OVER_TWO,
            },
          ],
          nodes: [],
          linkedNodeGroups: [],
          edges: [],
        },
        settings: {
          elevationReferenceAnnotationId: "annotation-1",
          nextShortLabelCounterByToolType: {},
        },
      } as unknown as AnnotationsRuntimePersistenceEnvelope,
    });

    expect(state.annotationEntries).toEqual([]);
    expect(state.nodes).toEqual([]);
    expect(state.linkedNodeGroups).toEqual([]);
    expect(state.edges).toEqual([]);
    expect(state.settingsState.elevationReferenceAnnotationId).toBeNull();
  });

  it("persists internal preferred normal bearings in radians", () => {
    const persistenceState = buildAnnotationsRuntimePersistenceState(
      createStoreState([
        createStoredAnnotation({
          preferredNormalBearingRad: PI_OVER_TWO,
        }),
      ])
    );

    expect(persistenceState.formatId).toBe("annotations-runtime-persistence");
    expect(persistenceState.version).toBe(1);
    expect(
      persistenceState.tables.annotationEntries[0]?.preferredNormalBearingRad
    ).toBe(PI_OVER_TWO);
    expect(
      Object.keys(persistenceState.tables.annotationEntries[0] ?? {})
    ).not.toContain(["preferredNormalBearing", "Deg"].join(""));
  });
});
