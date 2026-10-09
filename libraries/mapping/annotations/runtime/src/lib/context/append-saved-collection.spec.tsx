import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  AnnotationsProvider,
  useAnnotationsRuntime,
} from "./AnnotationsProvider";
import {
  ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION,
  type AnnotationsRuntimePersistenceEnvelope,
} from "../store/persistence/annotations-store-persistence";
import { buildExternalAnnotationsAppendOptions } from "../utils/annotation-tool-collections";
import { ANNOTATION_ENTRY_ROLES } from "../store";
import {
  ANNOTATION_TOOL_PLUGIN_KINDS,
  type AnnotationToolPlugin,
} from "../registry";

const distancePlugin = {
  id: "distance",
  annotationType: "distance",
  kind: ANNOTATION_TOOL_PLUGIN_KINDS.MEASUREMENT,
  descriptor: {
    id: "distance",
    label: "Distanz",
    order: 0,
    tooltip: "Distanz",
  },
  visualModels: {
    build: () => ({ points: [], edges: [], pointLabels: [] }),
  },
} as unknown as AnnotationToolPlugin;
const plugins = [distancePlugin];

const envelope = (): AnnotationsRuntimePersistenceEnvelope =>
  ({
    formatId: "annotations-runtime-persistence",
    version: ANNOTATIONS_RUNTIME_PERSISTENCE_VERSION,
    tables: {
      annotationEntries: [
        {
          id: "distance-1",
          uuid: "11111111-1111-4111-8111-111111111111",
          updatedAt: "2026-10-09T20:00:00.000Z",
          toolType: "distance",
          nodeIds: ["node-1", "node-2"],
          edgeIds: ["edge-1"],
        },
      ],
      nodes: [
        { id: "node-1", coordinate: { longitude: 7.2, latitude: 51.27, altitude: 170 } },
        { id: "node-2", coordinate: { longitude: 7.2001, latitude: 51.27, altitude: 170 } },
      ],
      linkedNodeGroups: [
        { id: "node-1", nodeIds: ["node-1"] },
        { id: "node-2", nodeIds: ["node-2"] },
      ],
      edges: [{ id: "edge-1", startNodeId: "node-1", endNodeId: "node-2" }],
    },
    settings: {
      lastActiveToolType: "select",
      elevationReferenceAnnotationId: null,
      nextShortLabelCounterByToolType: {},
    },
  }) as unknown as AnnotationsRuntimePersistenceEnvelope;

describe("appending a saved collection next to its working measurements", () => {
  it("adds read-only copies and leaves the working measurement as it was", () => {
    let runtime: ReturnType<typeof useAnnotationsRuntime> | null = null;
    const Probe = () => {
      runtime = useAnnotationsRuntime();
      return null;
    };
    render(
      <AnnotationsProvider engine={null} plugins={plugins} renderEnabled={false}>
        <Probe />
      </AnnotationsProvider>
    );
    act(() => {
      runtime!.appendAnnotationsRuntimePersistenceState(envelope());
    });
    const collection = { type: "saved-measurement", id: "measurement-3d-abc" } as const;
    act(() => {
      runtime!.appendAnnotationsRuntimePersistenceState(
        envelope(),
        buildExternalAnnotationsAppendOptions(collection)
      );
    });

    const entries = runtime!.annotationEntries;
    expect(entries).toHaveLength(2);
    const working = entries.find((entry) => entry.externalCollection === undefined);
    const saved = entries.find((entry) => entry.externalCollection !== undefined);
    expect(working).toMatchObject({ id: "distance-1" });
    expect(working?.readOnly).not.toBe(true);
    expect(working?.annotationRole).not.toBe(ANNOTATION_ENTRY_ROLES.EXTERNAL);
    expect(saved).toMatchObject({
      externalCollection: collection,
      annotationRole: ANNOTATION_ENTRY_ROLES.EXTERNAL,
      readOnly: true,
    });

    // registering the same collection again stays idempotent
    act(() => {
      runtime!.appendAnnotationsRuntimePersistenceState(
        envelope(),
        buildExternalAnnotationsAppendOptions(collection)
      );
    });
    expect(runtime!.annotationEntries).toHaveLength(2);
  });
});
