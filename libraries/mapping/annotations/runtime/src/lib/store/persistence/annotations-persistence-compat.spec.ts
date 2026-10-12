import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import { afterEach, describe, expect, it } from "vitest";

import { buildMeasurementEntities } from "../annotation-entity-builder.helpers";
import type { AnnotationsStoreState } from "../annotations-store.types";
import {
  buildAnnotationsRuntimeGeoJsonFeatureCollection,
  buildAnnotationsRuntimePersistenceState,
  loadAnnotationsRuntimeGeoJsonFeatureCollection,
  loadAnnotationsRuntimePersistenceState,
  resolveAnnotationsRuntimePersistenceFromGeoJson,
  resolvePersistedAnnotationsStoreState,
  saveAnnotationsRuntimePersistenceState,
} from "./annotations-store-persistence";
import {
  ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID,
  ANNOTATIONS_RUNTIME_PERSISTENCE_FORMAT_ID,
  type AnnotationsRuntimePersistenceEnvelope,
} from "./persistence-format";

const KEY = "annotations-compat";
const UPDATED_AT = "2026-10-12T12:00:00.000Z";

const createState = (
  withUuids: boolean
): AnnotationsRuntimePersistenceEnvelope => ({
  formatId: ANNOTATIONS_RUNTIME_PERSISTENCE_FORMAT_ID,
  version: 1,
  tables: {
    annotationEntries: [
      {
        id: "distance-1",
        ...(withUuids ? { uuid: "uuid-distance" } : {}),
        toolType: ANNOTATION_TYPES.DISTANCE,
        nodeIds: ["node-1", "node-2"],
        edgeIds: ["edge-1"],
        shortLabel: "D1",
        shortLabelCounter: 1,
      },
      {
        id: "area-1",
        ...(withUuids ? { uuid: "uuid-area" } : {}),
        toolType: ANNOTATION_TYPES.AREA_PLANAR,
        nodeIds: ["node-1", "node-2", "node-3"],
        edgeIds: ["edge-1", "edge-2", "edge-3"],
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
    elevationReferenceAnnotationId: null,
    nextShortLabelCounterByToolType: { distance: 2 },
  },
});

/** Adds the version 2 entry stamp to everything that looks like an entry. */
const stampUpdatedAt = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stampUpdatedAt);
  if (typeof value !== "object" || value === null) return value;
  const stamped = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, stampUpdatedAt(child)])
  );
  return "toolType" in stamped && "nodeIds" in stamped
    ? { ...stamped, updatedAt: UPDATED_AT }
    : stamped;
};

const createVersion2GeoJson = () => {
  const { metadata, ...collection } =
    buildAnnotationsRuntimeGeoJsonFeatureCollection(createState(true));
  return stampUpdatedAt({
    ...collection,
    metadata: {
      carmaConf: {
        ...metadata.carmaConf,
        formatVersion: 2,
        annotationsRuntimePersistence: {
          ...metadata.carmaConf.annotationsRuntimePersistence,
          version: 2,
        },
      },
    },
  });
};

const createVersion2Envelope = () =>
  stampUpdatedAt({ ...createState(true), version: 2 });

type StoredEntry = { id: string; uuid?: unknown };
type StrictEnvelope = {
  tables: { annotationEntries: StoredEntry[] };
};
type StoredCollection = {
  type?: unknown;
  metadata?: {
    carmaConf?: {
      formatId?: unknown;
      formatVersion?: unknown;
      annotationsRuntimePersistence?: unknown;
    };
  };
};

const isStrictEnvelope = (value: unknown): value is StrictEnvelope => {
  const candidate = value as {
    formatId?: unknown;
    version?: unknown;
    tables?: Record<string, unknown>;
  } | null;
  return (
    candidate?.formatId === "annotations-runtime-persistence" &&
    candidate.version === 1 &&
    Array.isArray(candidate.tables?.annotationEntries) &&
    Array.isArray(candidate.tables?.nodes) &&
    Array.isArray(candidate.tables?.linkedNodeGroups) &&
    Array.isArray(candidate.tables?.edges)
  );
};

/**
 * The check the released code applies to a stored set: the envelope or the
 * GeoJSON wrapper must be exactly version 1, anything else counted as no data.
 */
const readAsReleased = (stored: unknown): StrictEnvelope | null => {
  const collection = stored as StoredCollection | null;
  if (collection?.type !== "FeatureCollection") {
    return isStrictEnvelope(stored) ? stored : null;
  }
  const carmaConf = collection.metadata?.carmaConf;
  return carmaConf?.formatId === ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID &&
    carmaConf.formatVersion === 1 &&
    isStrictEnvelope(carmaConf.annotationsRuntimePersistence)
    ? carmaConf.annotationsRuntimePersistence
    : null;
};

const createStoreState = (
  persisted: AnnotationsRuntimePersistenceEnvelope | null
): AnnotationsStoreState =>
  resolvePersistedAnnotationsStoreState({
    initialToolType: ANNOTATION_TYPES.DISTANCE,
    initialPointTemporaryMode: false,
    initialPersistenceState: persisted,
  });

/** What the provider does: load, run the store on it, save its next state. */
const loadAndSave = (key: string) => {
  const store = createStoreState(loadAnnotationsRuntimePersistenceState(key));
  saveAnnotationsRuntimePersistenceState(
    key,
    buildAnnotationsRuntimePersistenceState(store)
  );
  const raw = localStorage.getItem(key) ?? "";
  return { raw, stored: JSON.parse(raw) as unknown };
};

const uuidsOf = (envelope: StrictEnvelope | null) =>
  envelope?.tables.annotationEntries.map(({ uuid }) => uuid);

describe("annotations persistence compatibility", () => {
  afterEach(() => localStorage.clear());

  it("gives a new entry a uuid at creation", () => {
    const [first, second] = [1, 2].map(
      () =>
        buildMeasurementEntities({
          toolType: ANNOTATION_TYPES.POINT,
          coordinates: [{ longitude: 7, latitude: 51, altitude: 100 }],
          measurementSequenceRef: { current: 0 },
          nodeSequenceRef: { current: 0 },
          edgeSequenceRef: { current: 0 },
        }).annotationEntry
    );
    expect(first?.uuid).toEqual(expect.any(String));
    expect(first?.uuid).not.toBe(second?.uuid);
  });

  it("loads a version 1 set without uuids and saves it as version 1 with uuids", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify(
        buildAnnotationsRuntimeGeoJsonFeatureCollection(createState(false))
      )
    );
    const loaded = loadAnnotationsRuntimePersistenceState(KEY);
    expect(loaded?.tables.annotationEntries.map(({ uuid }) => uuid)).toEqual([
      undefined,
      undefined,
    ]);

    const { raw, stored } = loadAndSave(KEY);
    const [distanceUuid, areaUuid] = uuidsOf(readAsReleased(stored))!;
    expect(distanceUuid).toEqual(expect.any(String));
    expect(areaUuid).toEqual(expect.any(String));
    expect(distanceUuid).not.toBe(areaUuid);
    expect(raw).not.toContain("updatedAt");

    // the uuids written once are the ones loaded from then on
    expect(uuidsOf(readAsReleased(loadAndSave(KEY).stored))).toEqual([
      distanceUuid,
      areaUuid,
    ]);
  });

  it.each([
    ["GeoJSON", createVersion2GeoJson],
    ["bare envelope", createVersion2Envelope],
  ])(
    "loads a version 2 %s with uuid and updatedAt and saves it as version 1 with the uuids only",
    (_kind, createVersion2) => {
      localStorage.setItem(KEY, JSON.stringify(createVersion2()));
      const loaded = loadAnnotationsRuntimePersistenceState(KEY);
      expect(loaded?.version).toBe(1);
      expect(JSON.stringify(loaded)).not.toContain("updatedAt");

      const { raw, stored } = loadAndSave(KEY);
      expect(uuidsOf(readAsReleased(stored))).toEqual([
        "uuid-distance",
        "uuid-area",
      ]);
      expect(raw).not.toContain("updatedAt");
    }
  );

  it("drops updatedAt from plain version 2 features", () => {
    const { features } = createVersion2GeoJson() as {
      features: unknown[];
    };
    expect(JSON.stringify(features)).toContain("updatedAt");
    const state = resolveAnnotationsRuntimePersistenceFromGeoJson({
      type: "FeatureCollection",
      features,
    });
    expect(state?.tables.annotationEntries.map(({ uuid }) => uuid)).toEqual([
      "uuid-distance",
      "uuid-area",
    ]);
    expect(JSON.stringify(state)).not.toContain("updatedAt");
  });

  it("writes a local set and a GeoJSON export that the released reader still accepts", () => {
    const state = createState(true);
    saveAnnotationsRuntimePersistenceState(KEY, state);
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as unknown;
    const exported = buildAnnotationsRuntimeGeoJsonFeatureCollection(state);
    const shared = loadAnnotationsRuntimeGeoJsonFeatureCollection(KEY);

    for (const written of [saved, exported, shared]) {
      expect(written).toMatchObject({
        metadata: { carmaConf: { formatVersion: 1 } },
      });
      expect(uuidsOf(readAsReleased(written))).toEqual([
        "uuid-distance",
        "uuid-area",
      ]);
      expect(JSON.stringify(written)).not.toContain("updatedAt");
    }
    expect(readAsReleased(saved)).toMatchObject({
      tables: { nodes: state.tables.nodes, edges: state.tables.edges },
    });
  });

  it("exports an entry without a uuid as it is", () => {
    const exported = buildAnnotationsRuntimeGeoJsonFeatureCollection(
      createState(false)
    );
    expect(uuidsOf(readAsReleased(exported))).toEqual([undefined, undefined]);
  });

  it.each([
    ["an envelope of an unknown version", { ...createState(true), version: 3 }],
    [
      "an envelope of another format",
      { ...createState(true), formatId: "annotations-runtime-other" },
    ],
    [
      "a GeoJSON wrapper of an unknown version",
      {
        type: "FeatureCollection",
        features: [],
        metadata: {
          carmaConf: {
            formatId: ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID,
            formatVersion: 3,
            annotationsRuntimePersistence: createState(true),
          },
        },
      },
    ],
  ])("treats %s as no data", (_kind, stored) => {
    localStorage.setItem(KEY, JSON.stringify(stored));
    expect(loadAnnotationsRuntimePersistenceState(KEY)).toBeNull();
  });
});
