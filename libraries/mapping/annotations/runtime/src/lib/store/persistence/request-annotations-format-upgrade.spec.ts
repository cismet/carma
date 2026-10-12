import { afterEach, describe, expect, it, vi } from "vitest";
import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import {
  ANNOTATIONS_RUNTIME_PERSISTENCE_FORMAT_ID,
  ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION,
} from "./persistence-format";
import {
  loadAnnotationsRuntimePersistenceState,
  saveAnnotationsRuntimePersistenceState,
} from "./annotations-store-persistence";
import {
  ANNOTATIONS_PERSISTENCE_FORMAT_KINDS,
  CURRENT_ANNOTATIONS_PERSISTENCE_FORMAT,
  serializeAnnotationsPersistenceState,
} from "./annotations-persistence-format";
import { requestAnnotationsFormatUpgrade } from "./request-annotations-format-upgrade";

const key = "format-choice-measurements";
const state = () => ({
  formatId: ANNOTATIONS_RUNTIME_PERSISTENCE_FORMAT_ID,
  version: ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION,
  tables: {
    annotationEntries: [
      {
        id: "measurement-1",
        toolType: ANNOTATION_TYPES.POINT,
        nodeIds: ["node-1"],
        edgeIds: [],
      },
    ],
    nodes: [
      {
        id: "node-1",
        coordinate: { longitude: 7, latitude: 51, altitude: 100 },
      },
    ],
    linkedNodeGroups: [],
    edges: [],
  },
  settings: {
    lastActiveToolType: ANNOTATION_TYPES.POINT,
    elevationReferenceAnnotationId: null,
    nextShortLabelCounterByToolType: {},
  },
});
const seedLegacy = () => {
  localStorage.setItem(
    key,
    JSON.stringify(
      serializeAnnotationsPersistenceState(state(), {
        kind: ANNOTATIONS_PERSISTENCE_FORMAT_KINDS.ENVELOPE,
        persistenceVersion: 1,
      })
    )
  );
  return localStorage.getItem(key);
};
afterEach(() => localStorage.clear());

describe("stored measurement format choice", () => {
  it("does not rewrite legacy data while loading or waiting for a choice", async () => {
    const original = seedLegacy();
    loadAnnotationsRuntimePersistenceState(key);
    expect(localStorage.getItem(key)).toBe(original);
    let choose!: (upgrade: boolean) => void;
    const confirm = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          choose = resolve;
        })
    );
    const first = requestAnnotationsFormatUpgrade(key, confirm);
    const second = requestAnnotationsFormatUpgrade(key, confirm);
    expect(second).toBe(first);
    await Promise.resolve();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(key)).toBe(original);
    choose(false);
    await first;
    expect(localStorage.getItem(key)).toBe(original);
  });

  it("remembers keeping the old shape and preserves its version on subsequent edits", async () => {
    seedLegacy();
    const confirm = vi.fn().mockResolvedValue(false);
    await requestAnnotationsFormatUpgrade(key, confirm);
    const edited = loadAnnotationsRuntimePersistenceState(key)!;
    edited.tables.nodes[0]!.coordinate.altitude = 105;
    saveAnnotationsRuntimePersistenceState(key, edited);
    const raw = JSON.parse(localStorage.getItem(key)!);
    expect(raw.formatId).toBe(ANNOTATIONS_RUNTIME_PERSISTENCE_FORMAT_ID);
    expect(raw.version).toBe(1);
    expect(raw.tables.nodes[0].coordinate.altitude).toBe(105);
    expect(raw.tables.annotationEntries[0]).not.toHaveProperty("uuid");
    expect(raw.tables.annotationEntries[0]).not.toHaveProperty("updatedAt");
    await requestAnnotationsFormatUpgrade(key, confirm);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("upgrades only with consent and migrates the latest geometry instead of an old snapshot", async () => {
    seedLegacy();
    let choose!: (upgrade: boolean) => void;
    const pending = requestAnnotationsFormatUpgrade(
      key,
      () =>
        new Promise<boolean>((resolve) => {
          choose = resolve;
        })
    );
    await Promise.resolve();
    const edited = loadAnnotationsRuntimePersistenceState(key)!;
    edited.tables.nodes[0]!.coordinate.altitude = 110;
    saveAnnotationsRuntimePersistenceState(key, edited);
    choose(true);
    await pending;
    const raw = JSON.parse(localStorage.getItem(key)!);
    expect(raw.type).toBe("FeatureCollection");
    expect(raw.metadata.carmaConf.formatVersion).toBe(2);
    expect(raw.metadata.carmaConf.annotationsRuntimePersistence.version).toBe(
      2
    );
    expect(
      raw.metadata.carmaConf.annotationsRuntimePersistence.tables.nodes[0]
        .coordinate.altitude
    ).toBe(110);
    expect(
      raw.metadata.carmaConf.annotationsRuntimePersistence.tables
        .annotationEntries
    ).toHaveLength(1);
    expect(raw.features[0].geometry.coordinates).toEqual([7, 51, 110]);
  });

  it("does not overwrite unsupported stored data without an explicit target", () => {
    const original = JSON.stringify({
      formatId: ANNOTATIONS_RUNTIME_PERSISTENCE_FORMAT_ID,
      version: 99,
    });
    localStorage.setItem(key, original);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      saveAnnotationsRuntimePersistenceState(key, state());
      expect(localStorage.getItem(key)).toBe(original);
    } finally {
      warn.mockRestore();
    }
  });

  it("does not ask for current-format or unrelated 2D data", async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    saveAnnotationsRuntimePersistenceState(
      key,
      state(),
      CURRENT_ANNOTATIONS_PERSISTENCE_FORMAT
    );
    await requestAnnotationsFormatUpgrade(key, confirm);
    localStorage.setItem(
      key,
      JSON.stringify({ type: "FeatureCollection", features: [] })
    );
    await requestAnnotationsFormatUpgrade(key, confirm);
    expect(confirm).not.toHaveBeenCalled();
  });
});
