import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import { PI_OVER_TWO } from "@carma-units";
import { describe, expect, it } from "vitest";

import { buildAnnotationsRuntimeGeoJsonFeatureCollection } from "./annotations-geojson";
import {
  ANNOTATIONS_PERSISTENCE_FORMAT_KINDS,
  CURRENT_ANNOTATIONS_PERSISTENCE_FORMAT,
  inspectAnnotationsPersistenceFormat,
  serializeAnnotationsPersistenceState,
  type AnnotationsPersistenceFormat,
} from "./annotations-persistence-format";
import {
  ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID,
  ANNOTATIONS_RUNTIME_PERSISTENCE_FORMAT_ID,
  ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION,
  type AnnotationsRuntimePersistenceEnvelope,
} from "./persistence-format";

const createState = (): AnnotationsRuntimePersistenceEnvelope => ({
  formatId: ANNOTATIONS_RUNTIME_PERSISTENCE_FORMAT_ID,
  version: ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION,
  tables: {
    annotationEntries: [
      {
        id: "distance-1",
        uuid: "stable-distance-identity",
        updatedAt: "2026-10-12T12:00:00.000Z",
        toolType: ANNOTATION_TYPES.DISTANCE,
        nodeIds: ["node-1", "node-2"],
        edgeIds: ["edge-1"],
        displayName: "Measured roof edge",
        shortLabel: "D1",
        shortLabelCounter: 1,
        hidden: false,
        locked: true,
      },
      {
        id: "area-1",
        uuid: "stable-area-identity",
        updatedAt: "2026-10-12T12:01:00.000Z",
        toolType: ANNOTATION_TYPES.AREA_PLANAR,
        nodeIds: ["node-1", "node-2", "node-3"],
        edgeIds: ["edge-1", "edge-2", "edge-3"],
        preferredNormalBearingRad: PI_OVER_TWO,
        closed: true,
      },
    ],
    nodes: [
      {
        id: "node-1",
        coordinate: { longitude: 7, latitude: 51, altitude: 100 },
      },
      {
        id: "node-2",
        coordinate: { longitude: 7.001, latitude: 51, altitude: 110 },
      },
      {
        id: "node-3",
        coordinate: { longitude: 7, latitude: 51.001, altitude: 120 },
      },
    ],
    linkedNodeGroups: [{ id: "group-1", nodeIds: ["node-1", "node-2"] }],
    edges: [
      { id: "edge-1", startNodeId: "node-1", endNodeId: "node-2" },
      { id: "edge-2", startNodeId: "node-2", endNodeId: "node-3" },
      { id: "edge-3", startNodeId: "node-3", endNodeId: "node-1" },
    ],
  },
  settings: {
    lastActiveToolType: ANNOTATION_TYPES.DISTANCE,
    elevationReferenceAnnotationId: "area-1",
    nextShortLabelCounterByToolType: { distance: 2, "area-planar": 2 },
  },
});

const createLegacyEnvelope = () => {
  const state = createState();
  return {
    ...state,
    version: 1 as const,
    tables: {
      ...state.tables,
      annotationEntries: state.tables.annotationEntries.map(
        ({ uuid: _uuid, updatedAt: _updatedAt, ...entry }) => entry
      ),
    },
  };
};

const createLegacyGeoJson = () => {
  const legacyEnvelope = createLegacyEnvelope();
  const collection = buildAnnotationsRuntimeGeoJsonFeatureCollection({
    ...legacyEnvelope,
    version: ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION,
  });
  return {
    ...collection,
    metadata: {
      carmaConf: {
        ...collection.metadata.carmaConf,
        formatVersion: 1 as const,
        annotationsRuntimePersistence: legacyEnvelope,
      },
    },
  };
};

const deepFreeze = (value: unknown): void => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value))
    return;
  Object.values(value).forEach(deepFreeze);
  Object.freeze(value);
};

describe("annotations persistence format", () => {
  it("uses an immutable current GeoJSON/envelope format for fresh storage", () => {
    expect(CURRENT_ANNOTATIONS_PERSISTENCE_FORMAT).toEqual({
      kind: "geojson",
      persistenceVersion: 2,
      geoJsonVersion: 2,
    });
    expect(Object.isFrozen(CURRENT_ANNOTATIONS_PERSISTENCE_FORMAT)).toBe(true);
    expect(Object.isFrozen(ANNOTATIONS_PERSISTENCE_FORMAT_KINDS)).toBe(true);
  });

  it.each([1, 2] as const)(
    "recognizes raw persisted envelope version %s",
    (version) => {
      const state = { ...createState(), version };
      const before = JSON.stringify(state);
      expect(inspectAnnotationsPersistenceFormat(state)).toEqual({
        kind: "envelope",
        persistenceVersion: version,
      });
      expect(JSON.stringify(state)).toBe(before);
    }
  );

  it.each([
    [1, 1],
    [1, 2],
    [2, 1],
    [2, 2],
  ] as const)(
    "recognizes GeoJSON %s with nested envelope %s independently",
    (geoJsonVersion, persistenceVersion) => {
      const current = buildAnnotationsRuntimeGeoJsonFeatureCollection(
        createState()
      );
      const collection = {
        ...current,
        metadata: {
          carmaConf: {
            ...current.metadata.carmaConf,
            formatVersion: geoJsonVersion,
            annotationsRuntimePersistence: {
              ...current.metadata.carmaConf.annotationsRuntimePersistence,
              version: persistenceVersion,
            },
          },
        },
      };
      expect(inspectAnnotationsPersistenceFormat(collection)).toEqual({
        kind: "geojson",
        geoJsonVersion,
        persistenceVersion,
      });
    }
  );

  it("keeps a legacy envelope's shape, versions, geometry and settings without identities", () => {
    const legacy = createLegacyEnvelope();
    const target = inspectAnnotationsPersistenceFormat(legacy)!;
    const serialized = serializeAnnotationsPersistenceState(
      createState(),
      target
    );
    expect(serialized).toEqual(legacy);
    expect(inspectAnnotationsPersistenceFormat(serialized)).toEqual(target);
    expect(JSON.stringify(serialized)).not.toContain('"uuid"');
    expect(JSON.stringify(serialized)).not.toContain('"updatedAt"');
  });

  it("keeps legacy GeoJSON 1 and envelope 1 without adding per-feature identities", () => {
    const legacy = createLegacyGeoJson();
    const target = inspectAnnotationsPersistenceFormat(legacy)!;
    const serialized = serializeAnnotationsPersistenceState(
      createState(),
      target
    );
    expect(serialized).toEqual(legacy);
    expect(inspectAnnotationsPersistenceFormat(serialized)).toEqual(target);
    expect(JSON.stringify(serialized)).not.toContain('"uuid"');
    expect(JSON.stringify(serialized)).not.toContain('"updatedAt"');
    expect(legacy.features[0]?.geometry).toEqual({
      type: "LineString",
      coordinates: [
        [7, 51, 100],
        [7.001, 51, 110],
      ],
    });
    expect(legacy.features[1]?.geometry).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [7, 51, 100],
          [7.001, 51, 110],
          [7, 51.001, 120],
          [7, 51, 100],
        ],
      ],
    });
  });

  it("retains current envelope 2 entries and identity fields", () => {
    const state = createState();
    expect(
      serializeAnnotationsPersistenceState(state, {
        kind: "envelope",
        persistenceVersion: 2,
      })
    ).toEqual(state);
  });

  it("retains current GeoJSON 2, nested envelope 2 and per-feature identities", () => {
    const state = createState();
    const current = buildAnnotationsRuntimeGeoJsonFeatureCollection(state);
    expect(
      serializeAnnotationsPersistenceState(
        state,
        CURRENT_ANNOTATIONS_PERSISTENCE_FORMAT
      )
    ).toEqual(current);
    expect(
      current.metadata.carmaConf.annotationsRuntimePersistence.tables
        .annotationEntries[0]?.uuid
    ).toBe("stable-distance-identity");
    expect(current.features[0]?.properties?.carmaConf).toMatchObject({
      annotationRuntime: {
        annotation: {
          uuid: "stable-distance-identity",
          updatedAt: "2026-10-12T12:00:00.000Z",
        },
      },
    });
  });

  it.each([
    [1, 2],
    [2, 1],
  ] as const)(
    "preserves mixed GeoJSON %s/envelope %s and follows the envelope identity schema",
    (geoJsonVersion, persistenceVersion) => {
      const target: AnnotationsPersistenceFormat = {
        kind: "geojson",
        geoJsonVersion,
        persistenceVersion,
      };
      const serialized = serializeAnnotationsPersistenceState(
        createState(),
        target
      );
      expect(inspectAnnotationsPersistenceFormat(serialized)).toEqual(target);
      expect(JSON.stringify(serialized).includes('"uuid"')).toBe(
        persistenceVersion === 2
      );
      expect(JSON.stringify(serialized).includes('"updatedAt"')).toBe(
        persistenceVersion === 2
      );
    }
  );

  it.each(
    [
      null,
      undefined,
      [],
      "not a saved measurement",
      { ...createState(), version: 3 },
      { ...createState(), version: "1" },
      { ...createState(), version: 0 },
      { ...createState(), formatId: "other-runtime" },
      {
        formatId: ANNOTATIONS_RUNTIME_PERSISTENCE_FORMAT_ID,
        version: 1,
        tables: {},
      },
      { type: "FeatureCollection", features: [] },
      {
        type: "FeatureCollection",
        features: [],
        metadata: {
          carmaConf: {
            formatId: "carma-2d-measurements-geojson",
            formatVersion: 1,
          },
        },
      },
      {
        type: "FeatureCollection",
        features: [],
        metadata: {
          carmaConf: {
            formatId: ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID,
            formatVersion: 3,
            annotationsRuntimePersistence: createState(),
          },
        },
      },
      {
        type: "FeatureCollection",
        features: [],
        metadata: {
          carmaConf: {
            formatId: ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID,
            formatVersion: 1,
            annotationsRuntimePersistence: { ...createState(), version: 5 },
          },
        },
      },
      {
        type: "FeatureCollection",
        features: [],
        metadata: {
          carmaConf: {
            formatId: ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID,
            formatVersion: 1,
          },
        },
      },
    ].map((value) => ({ value }))
  )(
    "rejects unknown, unsupported, malformed and 2D data: $value",
    ({ value }) => {
      expect(inspectAnnotationsPersistenceFormat(value)).toBeNull();
    }
  );

  it("never mutates the caller's frozen state while encoding any known format", () => {
    const state = createState();
    const before = JSON.stringify(state);
    deepFreeze(state);
    const targets: AnnotationsPersistenceFormat[] = [
      { kind: "envelope", persistenceVersion: 1 },
      { kind: "envelope", persistenceVersion: 2 },
      { kind: "geojson", persistenceVersion: 1, geoJsonVersion: 1 },
      CURRENT_ANNOTATIONS_PERSISTENCE_FORMAT,
    ];
    targets.forEach((target) => {
      expect(() =>
        serializeAnnotationsPersistenceState(state, target)
      ).not.toThrow();
      expect(JSON.stringify(state)).toBe(before);
    });
  });
});
