import { describe, expect, it } from "vitest";

import type {
  AnnotationNode,
  StoredAnnotation,
} from "../annotations-store.types";
import {
  appendAnnotationEntities,
  createAnnotationsStore,
  createInitialAnnotationsStoreState,
} from "../create-annotations-store";
import {
  appendPersistenceStateToStore,
  removeExternalAnnotationsFromStore,
} from "./append-persistence-state";
import type { AnnotationsRuntimePersistenceEnvelope } from "./persistence-format";

const node = (id: string): AnnotationNode =>
  ({
    id,
    coordinate: { longitude: 7.2, latitude: 51.27, altitude: 150 },
  } as AnnotationNode);

const entry = (
  id: string,
  nodeIds: string[],
  extra: Partial<StoredAnnotation> = {}
): StoredAnnotation =>
  ({
    id,
    toolType: "point",
    nodeIds,
    edgeIds: [],
    ...extra,
  } as StoredAnnotation);

const envelope = (
  entries: StoredAnnotation[]
): AnnotationsRuntimePersistenceEnvelope =>
  ({
    formatId: "annotations-runtime-persistence",
    version: 1,
    tables: {
      annotationEntries: entries,
      nodes: entries.flatMap((annotationEntry) =>
        annotationEntry.nodeIds.map(node)
      ),
      linkedNodeGroups: [],
      edges: [],
    },
    settings: {
      lastActiveToolType: null,
      elevationReferenceAnnotationId: null,
      nextShortLabelCounterByToolType: {},
    },
  } as AnnotationsRuntimePersistenceEnvelope);

const createStore = (entries: StoredAnnotation[] = []) => {
  const store = createAnnotationsStore(createInitialAnnotationsStoreState());
  entries.forEach((annotationEntry) =>
    store.dispatch(
      appendAnnotationEntities({
        annotationEntry,
        nodes: annotationEntry.nodeIds.map(node),
        linkedNodeGroups: [],
        edges: [],
      })
    )
  );
  return store;
};

const ids = (store: ReturnType<typeof createStore>) =>
  store.getState().annotationEntries.map(({ id }) => id);

describe("appendPersistenceStateToStore", () => {
  it("appends new entries under their own ids", () => {
    const store = createStore();
    expect(
      appendPersistenceStateToStore(store, envelope([entry("p1", ["n1"])]))
    ).toEqual(["p1"]);
    expect(store.getState().nodes.map(({ id }) => id)).toEqual(["n1"]);
  });

  it("prefixes a foreign entry whose ids are taken", () => {
    const store = createStore([entry("p1", ["n1"], { uuid: "local" })]);
    const [addedId] = appendPersistenceStateToStore(
      store,
      envelope([entry("p1", ["n1"], { uuid: "foreign" })])
    );
    expect(addedId).toBe("sforeign:p1");
    expect(ids(store)).toEqual(["p1", "sforeign:p1"]);
  });

  it("replaces the counterpart with the same uuid under its local id", () => {
    const store = createStore([entry("p1", ["n1"], { uuid: "u1" })]);
    appendPersistenceStateToStore(
      store,
      envelope([entry("p9", ["n9"], { uuid: "u1", displayName: "new" })]),
      { replaceExisting: true }
    );
    expect(store.getState().annotationEntries).toMatchObject([
      { id: "p1", displayName: "new" },
    ]);
  });

  it("appends an external collection once and removes it again", () => {
    const externalCollection = { type: "saved", id: "c1" } as NonNullable<
      StoredAnnotation["externalCollection"]
    >;
    const options = {
      idPrefix: "c1",
      externalCollection,
      skipExisting: true,
    };
    const store = createStore([entry("p1", ["n1"], { uuid: "u1" })]);
    const saved = envelope([entry("p1", ["n1"], { uuid: "u1" })]);
    expect(appendPersistenceStateToStore(store, saved, options)).toEqual([
      "c1:p1",
    ]);
    expect(appendPersistenceStateToStore(store, saved, options)).toEqual([]);
    expect(
      removeExternalAnnotationsFromStore(store, externalCollection)
    ).toEqual(["c1:p1"]);
    expect(ids(store)).toEqual(["p1"]);
  });
});
