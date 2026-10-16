import { describe, expect, it } from "vitest";
import {
  buildAnnotationContentSignature,
  resolveSharedAnnotationsMerge,
  type AnnotationsRuntimePersistenceEnvelope,
} from "./annotations-store-persistence";
import type {
  AnnotationNode,
  StoredAnnotation,
} from "../annotations-store.types";

const node = (id: string, altitude: number): AnnotationNode =>
  ({
    id,
    coordinate: { longitude: 7.2, latitude: 51.27, altitude },
  } as AnnotationNode);

const entry = (
  id: string,
  nodeIds: string[],
  extra: Partial<StoredAnnotation> = {}
): StoredAnnotation =>
  ({
    id,
    toolType: "distance",
    nodeIds,
    edgeIds: [],
    ...extra,
  } as StoredAnnotation);

const envelope = (
  entries: StoredAnnotation[],
  nodes: AnnotationNode[]
): AnnotationsRuntimePersistenceEnvelope =>
  ({
    formatId: "carma-3d-annotations-runtime",
    version: 1,
    tables: {
      annotationEntries: entries,
      nodes,
      linkedNodeGroups: [],
      edges: [],
    },
    settings: {
      lastActiveToolType: null,
      elevationReferenceAnnotationId: null,
      nextShortLabelCounterByToolType: {},
    },
  } as unknown as AnnotationsRuntimePersistenceEnvelope);

describe("buildAnnotationContentSignature", () => {
  const state = envelope(
    [entry("distance-1", ["n1", "n2"], { uuid: "uuid-1" })],
    [node("n1", 1), node("n2", 2)]
  );
  const [first] = state.tables.annotationEntries;

  it("ignores the uuid and the id", () => {
    expect(
      buildAnnotationContentSignature(state, {
        ...first!,
        id: "distance-7",
        uuid: "uuid-7",
      })
    ).toBe(buildAnnotationContentSignature(state, first!));
  });

  it("tells other content apart", () => {
    expect(
      buildAnnotationContentSignature(state, { ...first!, hidden: true })
    ).not.toBe(buildAnnotationContentSignature(state, first!));
  });
});

describe("resolveSharedAnnotationsMerge", () => {
  const local = envelope(
    [
      entry("distance-1", ["n1", "n2"], { uuid: "uuid-1" }),
      entry("distance-2", ["n3", "n4"], { uuid: "uuid-2" }),
    ],
    [node("n1", 1), node("n2", 2), node("n3", 3), node("n4", 4)]
  );

  it("adds unknown entries, skips unchanged ones and flags changed ones", () => {
    const incoming = envelope(
      [
        entry("distance-1", ["n1", "n2"], { uuid: "uuid-1" }),
        entry("distance-2", ["n3", "n4"], { uuid: "uuid-2" }),
        entry("distance-9", ["n9", "n10"], { uuid: "other" }),
      ],
      [
        node("n1", 1),
        node("n2", 2),
        node("n3", 3),
        node("n4", 40),
        node("n9", 9),
        node("n10", 10),
      ]
    );
    const merge = resolveSharedAnnotationsMerge(incoming, local);
    expect(merge.unchangedCount).toBe(1);
    expect(merge.additions.tables.annotationEntries.map((e) => e.id)).toEqual([
      "distance-9",
    ]);
    expect(merge.additions.tables.nodes.map((n) => n.id)).toEqual([
      "n9",
      "n10",
    ]);
    expect(merge.conflictPairs.map((c) => c.local.id)).toEqual(["distance-2"]);
    expect(merge.conflicts.tables.annotationEntries.map((e) => e.id)).toEqual([
      "distance-2",
    ]);
  });

  it("matches by id while a side has no uuid", () => {
    const incoming = envelope(
      [entry("distance-1", ["n1", "n2"])],
      [node("n1", 1), node("n2", 2)]
    );
    const merge = resolveSharedAnnotationsMerge(incoming, local);
    expect(merge.unchangedCount).toBe(1);
    expect(merge.additions.tables.annotationEntries).toHaveLength(0);
  });
});
