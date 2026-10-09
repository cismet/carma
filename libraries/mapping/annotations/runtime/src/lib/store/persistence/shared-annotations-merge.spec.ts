import { describe, expect, it } from "vitest";
import {
  ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION,
  buildAnnotationsRuntimeGeoJsonFeatureCollection,
  parseAnnotationsRuntimePersistenceEnvelope,
  resolveAnnotationsRuntimePersistenceFromGeoJson,
  resolveSharedAnnotationsMerge,
  stampAnnotationIdentity,
  type AnnotationsRuntimePersistenceEnvelope,
} from "./annotations-store-persistence";
import type { AnnotationNode, StoredAnnotation } from "../annotations-store.types";

const node = (id: string, altitude: number): AnnotationNode =>
  ({
    id,
    coordinate: { longitude: 7.2, latitude: 51.27, altitude },
  }) as AnnotationNode;

const entry = (id: string, nodeIds: string[], extra: Partial<StoredAnnotation> = {}): StoredAnnotation =>
  ({ id, toolType: "distance", nodeIds, edgeIds: [], ...extra }) as StoredAnnotation;

const envelope = (
  entries: StoredAnnotation[],
  nodes: AnnotationNode[]
): AnnotationsRuntimePersistenceEnvelope =>
  ({
    formatId: "carma-3d-annotations-runtime",
    version: 1,
    tables: { annotationEntries: entries, nodes, linkedNodeGroups: [], edges: [] },
    settings: {
      lastActiveToolType: null,
      elevationReferenceAnnotationId: null,
      nextShortLabelCounterByToolType: {},
    },
  }) as unknown as AnnotationsRuntimePersistenceEnvelope;

describe("stampAnnotationIdentity", () => {
  it("gives every entry a uuid and keeps the time while the content stays", () => {
    const first = stampAnnotationIdentity(
      envelope([entry("distance-1", ["n1", "n2"])], [node("n1", 1), node("n2", 2)]),
      null,
      "2026-10-09T10:00:00.000Z"
    );
    const [stamped] = first.tables.annotationEntries;
    expect(stamped!.uuid).toBeTruthy();
    expect(stamped!.updatedAt).toBe("2026-10-09T10:00:00.000Z");

    const unchanged = stampAnnotationIdentity(
      envelope([entry("distance-1", ["n1", "n2"])], [node("n1", 1), node("n2", 2)]),
      first,
      "2026-10-09T11:00:00.000Z"
    );
    expect(unchanged.tables.annotationEntries[0]!.uuid).toBe(stamped!.uuid);
    expect(unchanged.tables.annotationEntries[0]!.updatedAt).toBe("2026-10-09T10:00:00.000Z");

    const moved = stampAnnotationIdentity(
      envelope([entry("distance-1", ["n1", "n2"])], [node("n1", 1), node("n2", 5)]),
      first,
      "2026-10-09T12:00:00.000Z"
    );
    expect(moved.tables.annotationEntries[0]!.uuid).toBe(stamped!.uuid);
    expect(moved.tables.annotationEntries[0]!.updatedAt).toBe("2026-10-09T12:00:00.000Z");
  });
});

describe("resolveSharedAnnotationsMerge", () => {
  const local = stampAnnotationIdentity(
    envelope(
      [entry("distance-1", ["n1", "n2"]), entry("distance-2", ["n3", "n4"])],
      [node("n1", 1), node("n2", 2), node("n3", 3), node("n4", 4)]
    ),
    null
  );
  const [localA, localB] = local.tables.annotationEntries;

  it("adds unknown entries, skips unchanged ones and flags changed ones", () => {
    const incoming = envelope(
      [
        entry("distance-1", ["n1", "n2"], { uuid: localA!.uuid }),
        entry("distance-2", ["n3", "n4"], { uuid: localB!.uuid }),
        entry("distance-9", ["n9", "n10"], { uuid: "other" }),
      ],
      [node("n1", 1), node("n2", 2), node("n3", 3), node("n4", 40), node("n9", 9), node("n10", 10)]
    );
    const merge = resolveSharedAnnotationsMerge(incoming, local);
    expect(merge.unchangedCount).toBe(1);
    expect(merge.additions.tables.annotationEntries.map((e) => e.id)).toEqual(["distance-9"]);
    expect(merge.additions.tables.nodes.map((n) => n.id)).toEqual(["n9", "n10"]);
    expect(merge.conflictPairs.map((c) => c.local.id)).toEqual(["distance-2"]);
    expect(merge.conflicts.tables.annotationEntries.map((e) => e.id)).toEqual(["distance-2"]);
  });

  it("matches by id while a side has no uuid", () => {
    const incoming = envelope([entry("distance-1", ["n1", "n2"])], [node("n1", 1), node("n2", 2)]);
    const merge = resolveSharedAnnotationsMerge(incoming, local);
    expect(merge.unchangedCount).toBe(1);
    expect(merge.additions.tables.annotationEntries).toHaveLength(0);
  });
});

describe("persistence versions", () => {
  const legacy = {
    formatId: "annotations-runtime-persistence",
    version: 1,
    tables: {
      annotationEntries: [entry("distance-1", ["n1", "n2"])],
      nodes: [node("n1", 160), node("n2", 162)],
      linkedNodeGroups: [],
      edges: [],
    },
    settings: {
      lastActiveToolType: null,
      elevationReferenceAnnotationId: null,
      nextShortLabelCounterByToolType: {},
    },
  };

  it("upgrades a version 1 envelope to the current version with identity stamps", () => {
    const upgraded = parseAnnotationsRuntimePersistenceEnvelope(legacy);
    expect(upgraded?.version).toBe(ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION);
    const [first] = upgraded!.tables.annotationEntries;
    expect(first!.uuid).toBeTruthy();
    expect(first!.updatedAt).toBeTruthy();
    expect(upgraded!.tables.nodes[0]!.coordinate.altitude).toBe(160);
  });

  it("accepts the version 1 GeoJSON wrapper of the Cesium measurement", () => {
    const wrapper = {
      type: "FeatureCollection",
      features: [],
      metadata: {
        carmaConf: {
          formatId: "carma-3d-annotations-geojson",
          formatVersion: 1,
          source: "geoportal-cesium-annotations",
          annotationsRuntimePersistence: legacy,
        },
      },
    };
    const resolved = resolveAnnotationsRuntimePersistenceFromGeoJson(wrapper);
    expect(resolved?.version).toBe(ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION);
    expect(resolved?.tables.annotationEntries[0]?.uuid).toBeTruthy();
  });

  it("rejects an unknown future version and writes the current one", () => {
    expect(parseAnnotationsRuntimePersistenceEnvelope({ ...legacy, version: 99 })).toBeNull();
    const written = buildAnnotationsRuntimeGeoJsonFeatureCollection(
      parseAnnotationsRuntimePersistenceEnvelope(legacy)!
    );
    expect(written.metadata.carmaConf.formatVersion).toBe(2);
    expect(written.metadata.carmaConf.annotationsRuntimePersistence.version).toBe(2);
  });
});
