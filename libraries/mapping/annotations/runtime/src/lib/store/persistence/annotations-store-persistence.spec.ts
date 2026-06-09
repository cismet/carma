import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import { PI_OVER_TWO } from "@carma-units";
import { afterEach, describe, expect, it } from "vitest";
import type {
  AnnotationsRuntimePersistenceEnvelope,
  AnnotationsStoreState,
  StoredAnnotation,
} from "../index";
import {
  ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID,
  ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_VERSION,
  buildAnnotationsRuntimeGeoJsonFeatureCollection,
  buildAnnotationsRuntimePersistenceState,
  loadAnnotationsRuntimePersistenceState,
  resolvePersistedAnnotationsStoreState,
  saveAnnotationsRuntimePersistenceState,
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

describe("annotationsStorePersistence", () => {
  afterEach(() => {
    localStorage.clear();
  });

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

  it("restores the last active tool when it is available", () => {
    const state = resolvePersistedAnnotationsStoreState({
      initialToolType: ANNOTATION_TYPES.DISTANCE,
      initialPointTemporaryMode: false,
      initialPersistenceState: {
        formatId: "annotations-runtime-persistence",
        version: 1,
        tables: {
          annotationEntries: [],
          nodes: [],
          linkedNodeGroups: [],
          edges: [],
        },
        settings: {
          lastActiveToolType: ANNOTATION_TYPES.POINT,
          elevationReferenceAnnotationId: null,
          nextShortLabelCounterByToolType: {},
        },
      },
      isToolTypeAvailable: (toolType) => toolType === ANNOTATION_TYPES.POINT,
    });

    expect(state.annotationToolType).toBe(ANNOTATION_TYPES.POINT);
  });

  it("uses the configured initial tool when the persisted active tool is unavailable", () => {
    const state = resolvePersistedAnnotationsStoreState({
      initialToolType: ANNOTATION_TYPES.DISTANCE,
      initialPointTemporaryMode: false,
      initialPersistenceState: {
        formatId: "annotations-runtime-persistence",
        version: 1,
        tables: {
          annotationEntries: [],
          nodes: [],
          linkedNodeGroups: [],
          edges: [],
        },
        settings: {
          lastActiveToolType: "label",
          elevationReferenceAnnotationId: null,
          nextShortLabelCounterByToolType: {},
        },
      },
      isToolTypeAvailable: () => false,
    });

    expect(state.annotationToolType).toBe(ANNOTATION_TYPES.DISTANCE);
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
    expect(persistenceState.settings.lastActiveToolType).toBe(
      ANNOTATION_TYPES.AREA_PLANAR
    );
    expect(
      persistenceState.tables.annotationEntries[0]?.preferredNormalBearingRad
    ).toBe(PI_OVER_TWO);
    expect(
      Object.keys(persistenceState.tables.annotationEntries[0] ?? {})
    ).not.toContain(["preferredNormalBearing", "Deg"].join(""));
  });

  it("keeps saved read-only measurement annotations out of live runtime persistence", () => {
    const persistenceState = buildAnnotationsRuntimePersistenceState(
      createStoreState([
        createStoredAnnotation({
          id: "live-distance",
          toolType: ANNOTATION_TYPES.DISTANCE,
        }),
        createStoredAnnotation({
          id: "measurement-3d-abc:distance-1",
          toolType: ANNOTATION_TYPES.DISTANCE,
          locked: true,
          readOnlySource: {
            type: "saved-measurement",
            id: "measurement-3d-abc",
          },
        }),
      ])
    );

    expect(
      persistenceState.tables.annotationEntries.map(({ id }) => id)
    ).toEqual(["live-distance"]);
  });

  it("persists per-annotation label appearance data", () => {
    const persistenceState = buildAnnotationsRuntimePersistenceState(
      createStoreState([
        createStoredAnnotation({
          labelAppearance: {
            backgroundColor: "#123456",
            fontSizePx: 22,
            textColor: "#abcdef",
          },
          toolType: ANNOTATION_TYPES.LABEL,
        }),
      ])
    );

    expect(
      persistenceState.tables.annotationEntries[0]?.labelAppearance
    ).toEqual({
      backgroundColor: "#123456",
      fontSizePx: 22,
      textColor: "#abcdef",
    });

    const restoredState = resolvePersistedAnnotationsStoreState({
      initialPointTemporaryMode: false,
      initialToolType: ANNOTATION_TYPES.DISTANCE,
      initialPersistenceState: persistenceState,
    });

    expect(restoredState.annotationEntries[0]?.labelAppearance).toEqual({
      backgroundColor: "#123456",
      fontSizePx: 22,
      textColor: "#abcdef",
    });
  });

  it("builds canonical GeoJSON persistence with restore metadata and features", () => {
    const persistenceState = buildAnnotationsRuntimePersistenceState({
      ...createStoreState([
        createStoredAnnotation({
          id: "point-1",
          toolType: ANNOTATION_TYPES.POINT,
          nodeIds: ["node-1"],
        }),
      ]),
      nodes: [
        {
          id: "node-1",
          coordinate: {
            longitude: 7,
            latitude: 51,
            altitude: 100,
          },
        },
      ],
    });

    const geoJson =
      buildAnnotationsRuntimeGeoJsonFeatureCollection(persistenceState);

    expect(geoJson.type).toBe("FeatureCollection");
    expect(geoJson.metadata.carmaConf).toMatchObject({
      formatId: ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID,
      formatVersion: ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_VERSION,
      source: "geoportal-cesium-annotations",
    });
    expect(geoJson.features[0]).toMatchObject({
      id: "point-1",
      geometry: {
        type: "Point",
        coordinates: [7, 51, 100],
      },
    });
    expect(
      geoJson.metadata.carmaConf.annotationsRuntimePersistence.tables
        .annotationEntries[0]?.id
    ).toBe("point-1");
    expect(geoJson.features[0]?.properties?.carmaConf).toMatchObject({
      annotationRuntime: {
        formatId: "carma-3d-annotation-runtime-feature",
        formatVersion: 1,
        annotation: {
          id: "point-1",
          toolType: ANNOTATION_TYPES.POINT,
          nodeIds: ["node-1"],
        },
        nodes: [
          {
            id: "node-1",
            coordinate: {
              longitude: 7,
              latitude: 51,
              altitude: 100,
            },
          },
        ],
      },
    });
  });

  it("restores distance annotations from feature properties without collection restore metadata", () => {
    const persistenceState = buildAnnotationsRuntimePersistenceState({
      ...createStoreState([
        createStoredAnnotation({
          id: "distance-1",
          toolType: ANNOTATION_TYPES.DISTANCE,
          nodeIds: ["node-1", "node-2"],
          edgeIds: ["edge-1"],
        }),
      ]),
      nodes: [
        {
          id: "node-1",
          coordinate: {
            longitude: 7,
            latitude: 51,
            altitude: 100,
          },
        },
        {
          id: "node-2",
          coordinate: {
            longitude: 7.1,
            latitude: 51.1,
            altitude: 130,
          },
        },
      ],
      edges: [
        {
          id: "edge-1",
          startNodeId: "node-1",
          endNodeId: "node-2",
        },
      ],
    });

    const geoJson =
      buildAnnotationsRuntimeGeoJsonFeatureCollection(persistenceState);
    const featureOnlyGeoJson = {
      type: "FeatureCollection",
      features: geoJson.features,
    };

    localStorage.setItem(
      "annotations-test",
      JSON.stringify(featureOnlyGeoJson)
    );

    const restoredState =
      loadAnnotationsRuntimePersistenceState("annotations-test");

    expect(restoredState?.tables.annotationEntries[0]).toMatchObject({
      id: "distance-1",
      toolType: ANNOTATION_TYPES.DISTANCE,
      nodeIds: ["node-1", "node-2"],
      edgeIds: ["edge-1"],
    });
    expect(restoredState?.tables.nodes).toEqual([
      {
        id: "node-1",
        coordinate: {
          longitude: 7,
          latitude: 51,
          altitude: 100,
        },
      },
      {
        id: "node-2",
        coordinate: {
          longitude: 7.1,
          latitude: 51.1,
          altitude: 130,
        },
      },
    ]);
    expect(restoredState?.tables.edges).toEqual([
      {
        id: "edge-1",
        startNodeId: "node-1",
        endNodeId: "node-2",
      },
    ]);
  });

  it("saves local persistence as canonical GeoJSON and loads it again", () => {
    const persistenceState = buildAnnotationsRuntimePersistenceState(
      createStoreState([
        createStoredAnnotation({
          id: "annotation-geojson",
          toolType: ANNOTATION_TYPES.LABEL,
        }),
      ])
    );

    saveAnnotationsRuntimePersistenceState(
      "annotations-test",
      persistenceState
    );

    const raw = localStorage.getItem("annotations-test");
    const parsed = raw ? JSON.parse(raw) : null;
    expect(parsed?.metadata?.carmaConf?.formatId).toBe(
      ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID
    );

    const restoredState =
      loadAnnotationsRuntimePersistenceState("annotations-test");

    expect(restoredState?.tables.annotationEntries[0]?.id).toBe(
      "annotation-geojson"
    );
  });

  it("keeps loading legacy local persistence envelopes", () => {
    const legacyState = buildAnnotationsRuntimePersistenceState(
      createStoreState([
        createStoredAnnotation({
          id: "legacy-annotation",
          toolType: ANNOTATION_TYPES.LABEL,
        }),
      ])
    );

    localStorage.setItem("annotations-test", JSON.stringify(legacyState));

    const restoredState =
      loadAnnotationsRuntimePersistenceState("annotations-test");

    expect(restoredState?.tables.annotationEntries[0]?.id).toBe(
      "legacy-annotation"
    );
  });
});
