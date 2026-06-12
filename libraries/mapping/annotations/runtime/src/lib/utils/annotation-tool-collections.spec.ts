import { describe, expect, it } from "vitest";
import {
  ANNOTATION_SELECT_TOOL_ID,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";

import type { AnnotationToolPlugin, AnnotationToolRegistry } from "../registry";
import { ANNOTATION_TOOL_PLUGIN_KINDS } from "../registry";
import { ANNOTATION_ENTRY_ROLES, type StoredAnnotation } from "../store";
import {
  areAnnotationEntriesHidden,
  buildExternalAnnotationsAppendOptions,
  isReadOnlyAnnotationEntry,
  resolveAnnotationCancelToolId,
  resolveAnnotationCountByToolType,
  resolveAnnotationEntriesByToolType,
  resolveAnnotationEntryRole,
  resolveAnnotationIdsByToolType,
  resolveAnnotationToolAuthoringInstructionPlugin,
  resolvePrimaryAnnotationInteractionToolId,
  resolveVisibleMeasurementAnnotationToolPlugins,
  selectAuthoringAnnotationEntries,
  selectRenderableAnnotationEntries,
} from "./annotation-tool-collections";

const createPlugin = ({
  annotationType,
  id,
  kind = ANNOTATION_TOOL_PLUGIN_KINDS.MEASUREMENT,
  order,
}: {
  annotationType?: AnnotationToolPlugin["annotationType"];
  id: AnnotationToolPlugin["id"];
  kind?: AnnotationToolPlugin["kind"];
  order: number;
}): AnnotationToolPlugin => ({
  annotationType,
  descriptor: {
    id,
    label: id,
    order,
    tooltip: id,
  },
  id,
  kind,
});

const createAnnotation = ({
  annotationRole,
  hidden = false,
  id,
  locked,
  readOnly,
  toolType,
}: {
  annotationRole?: StoredAnnotation["annotationRole"];
  hidden?: boolean;
  id: string;
  locked?: boolean;
  readOnly?: boolean;
  toolType: StoredAnnotation["toolType"];
}): StoredAnnotation =>
  ({
    annotationRole,
    hidden,
    id,
    locked,
    nodeIds: [],
    readOnly,
    toolType,
  } as StoredAnnotation);

describe("annotation-tool-collections", () => {
  it("lists visible select and measurement tools in descriptor order", () => {
    const plugins = [
      createPlugin({
        annotationType: ANNOTATION_TYPES.DISTANCE,
        id: ANNOTATION_TYPES.DISTANCE,
        order: 2,
      }),
      createPlugin({
        id: ANNOTATION_TYPES.POLYLINE,
        kind: ANNOTATION_TOOL_PLUGIN_KINDS.INTERACTION,
        order: 1,
      }),
      createPlugin({ id: ANNOTATION_SELECT_TOOL_ID, order: 0 }),
      createPlugin({ id: ANNOTATION_TYPES.LABEL, order: 3 }),
    ];

    expect(
      resolveVisibleMeasurementAnnotationToolPlugins(plugins).map(
        (plugin) => plugin.id
      )
    ).toEqual([ANNOTATION_SELECT_TOOL_ID, ANNOTATION_TYPES.DISTANCE]);
  });

  it("limits visible measurement tools to an explicit tool id allow-list", () => {
    const plugins = [
      createPlugin({ id: ANNOTATION_SELECT_TOOL_ID, order: 0 }),
      createPlugin({
        annotationType: ANNOTATION_TYPES.DISTANCE,
        id: ANNOTATION_TYPES.DISTANCE,
        order: 2,
      }),
      createPlugin({
        annotationType: ANNOTATION_TYPES.AREA_GROUND,
        id: ANNOTATION_TYPES.AREA_GROUND,
        order: 3,
      }),
    ];

    expect(
      resolveVisibleMeasurementAnnotationToolPlugins(plugins, {
        toolIds: [ANNOTATION_SELECT_TOOL_ID, ANNOTATION_TYPES.DISTANCE],
      }).map((plugin) => plugin.id)
    ).toEqual([ANNOTATION_SELECT_TOOL_ID, ANNOTATION_TYPES.DISTANCE]);
  });

  it("groups annotation entries by tool type", () => {
    const entries = [
      createAnnotation({ id: "a", toolType: ANNOTATION_TYPES.DISTANCE }),
      createAnnotation({ id: "b", toolType: ANNOTATION_TYPES.AREA_GROUND }),
      createAnnotation({ id: "c", toolType: ANNOTATION_TYPES.DISTANCE }),
    ];

    expect(
      resolveAnnotationCountByToolType(entries).get(ANNOTATION_TYPES.DISTANCE)
    ).toBe(2);
    expect(
      resolveAnnotationIdsByToolType(entries).get(ANNOTATION_TYPES.DISTANCE)
    ).toEqual(["a", "c"]);
    expect(
      resolveAnnotationEntriesByToolType(entries)
        .get(ANNOTATION_TYPES.DISTANCE)
        ?.map((entry) => entry.id)
    ).toEqual(["a", "c"]);
  });

  it("excludes external annotation entries from authoring groups", () => {
    const entries = [
      createAnnotation({ id: "a", toolType: ANNOTATION_TYPES.DISTANCE }),
      createAnnotation({
        annotationRole: ANNOTATION_ENTRY_ROLES.EXTERNAL,
        id: "b",
        toolType: ANNOTATION_TYPES.DISTANCE,
      }),
    ];

    expect(
      resolveAnnotationCountByToolType(entries).get(ANNOTATION_TYPES.DISTANCE)
    ).toBe(1);
    expect(
      resolveAnnotationIdsByToolType(entries).get(ANNOTATION_TYPES.DISTANCE)
    ).toEqual(["a"]);
    expect(
      resolveAnnotationEntriesByToolType(entries)
        .get(ANNOTATION_TYPES.DISTANCE)
        ?.map((entry) => entry.id)
    ).toEqual(["a"]);
  });

  it("keeps external annotation entries renderable but outside authoring groups", () => {
    const entries = [
      createAnnotation({ id: "a", toolType: ANNOTATION_TYPES.DISTANCE }),
      createAnnotation({
        annotationRole: ANNOTATION_ENTRY_ROLES.EXTERNAL,
        id: "b",
        toolType: ANNOTATION_TYPES.DISTANCE,
      }),
    ];
    const state = { annotationEntries: entries };

    expect(
      selectAuthoringAnnotationEntries(state).map((entry) => entry.id)
    ).toEqual(["a"]);
    expect(
      selectRenderableAnnotationEntries(state).map((entry) => entry.id)
    ).toEqual(["a", "b"]);
  });

  it("limits renderable annotation entries by role when requested", () => {
    const entries = [
      createAnnotation({ id: "a", toolType: ANNOTATION_TYPES.DISTANCE }),
      createAnnotation({
        annotationRole: ANNOTATION_ENTRY_ROLES.EXTERNAL,
        id: "b",
        toolType: ANNOTATION_TYPES.DISTANCE,
      }),
    ];

    expect(
      selectRenderableAnnotationEntries(
        { annotationEntries: entries },
        { roles: [ANNOTATION_ENTRY_ROLES.EXTERNAL] }
      ).map((entry) => entry.id)
    ).toEqual(["b"]);
  });

  it("derives the external role from collection membership when no role is set", () => {
    const externalCollection = {
      type: "saved-measurement" as const,
      id: "measurement-3d-abc",
    };
    const implicitExternalEntry = {
      ...createAnnotation({ id: "a", toolType: ANNOTATION_TYPES.DISTANCE }),
      externalCollection,
    } as StoredAnnotation;
    const authoringEntry = createAnnotation({
      id: "b",
      toolType: ANNOTATION_TYPES.DISTANCE,
    });

    expect(resolveAnnotationEntryRole(implicitExternalEntry)).toBe(
      ANNOTATION_ENTRY_ROLES.EXTERNAL
    );
    expect(resolveAnnotationEntryRole(authoringEntry)).toBe(
      ANNOTATION_ENTRY_ROLES.AUTHORING
    );
    expect(
      selectAuthoringAnnotationEntries({
        annotationEntries: [implicitExternalEntry, authoringEntry],
      }).map((entry) => entry.id)
    ).toEqual(["b"]);
  });

  it("keeps read-only state independent from external role", () => {
    const externalEntry = {
      ...createAnnotation({ id: "a", toolType: ANNOTATION_TYPES.DISTANCE }),
      externalCollection: {
        type: "saved-measurement" as const,
        id: "measurement-3d-abc",
      },
    } as StoredAnnotation;
    const readOnlyEntry = createAnnotation({
      id: "b",
      readOnly: true,
      toolType: ANNOTATION_TYPES.DISTANCE,
    });

    expect(resolveAnnotationEntryRole(externalEntry)).toBe(
      ANNOTATION_ENTRY_ROLES.EXTERNAL
    );
    expect(isReadOnlyAnnotationEntry(externalEntry)).toBe(false);
    expect(isReadOnlyAnnotationEntry(readOnlyEntry)).toBe(true);
  });

  it("builds canonical append options for external annotation collections", () => {
    const externalCollection = {
      type: "saved-measurement" as const,
      id: "measurement-3d-abc",
    };

    expect(buildExternalAnnotationsAppendOptions(externalCollection)).toEqual({
      idPrefix: "measurement-3d-abc",
      annotationRole: ANNOTATION_ENTRY_ROLES.EXTERNAL,
      readOnly: true,
      externalCollection,
      selectAnnotationId: null,
      skipExisting: true,
    });
  });

  it("resolves interaction and authoring instruction plugins", () => {
    const selectPlugin = createPlugin({
      id: ANNOTATION_SELECT_TOOL_ID,
      kind: ANNOTATION_TOOL_PLUGIN_KINDS.INTERACTION,
      order: 0,
    });
    const interactionPlugin = createPlugin({
      id: ANNOTATION_TYPES.POLYLINE,
      kind: ANNOTATION_TOOL_PLUGIN_KINDS.INTERACTION,
      order: 1,
    });
    const registry = {
      plugins: [selectPlugin, interactionPlugin],
      getPlugin: (id: string) =>
        [selectPlugin, interactionPlugin].find((plugin) => plugin.id === id),
    } as unknown as AnnotationToolRegistry;

    expect(resolvePrimaryAnnotationInteractionToolId(registry.plugins)).toEqual(
      ANNOTATION_SELECT_TOOL_ID
    );
    expect(resolveAnnotationCancelToolId(registry)).toEqual(
      ANNOTATION_SELECT_TOOL_ID
    );
    expect(
      resolveAnnotationToolAuthoringInstructionPlugin({
        activeToolType: ANNOTATION_TYPES.POINT,
        registry,
      })
    ).toBe(selectPlugin);
  });

  it("does not invent an authoring instruction plugin when active and default tools are unavailable", () => {
    const interactionPlugin = createPlugin({
      id: ANNOTATION_TYPES.POLYLINE,
      kind: ANNOTATION_TOOL_PLUGIN_KINDS.INTERACTION,
      order: 1,
    });
    const registry = {
      plugins: [interactionPlugin],
      getPlugin: (id: string) =>
        [interactionPlugin].find((plugin) => plugin.id === id),
    } as unknown as AnnotationToolRegistry;

    expect(
      resolveAnnotationToolAuthoringInstructionPlugin({
        activeToolType: ANNOTATION_TYPES.POINT,
        registry,
      })
    ).toBeNull();
  });

  it("falls back to the first interaction tool when select is unavailable", () => {
    const interactionPlugin = createPlugin({
      id: ANNOTATION_TYPES.POLYLINE,
      kind: ANNOTATION_TOOL_PLUGIN_KINDS.INTERACTION,
      order: 1,
    });

    expect(resolvePrimaryAnnotationInteractionToolId([interactionPlugin])).toBe(
      ANNOTATION_TYPES.POLYLINE
    );
    expect(
      resolveAnnotationCancelToolId({
        getPlugin: () => null,
        plugins: [interactionPlugin],
      })
    ).toBe(ANNOTATION_TYPES.POLYLINE);
  });

  it("detects all-hidden entry groups", () => {
    expect(
      areAnnotationEntriesHidden([
        createAnnotation({
          hidden: true,
          id: "a",
          toolType: ANNOTATION_TYPES.DISTANCE,
        }),
        createAnnotation({
          hidden: true,
          id: "b",
          toolType: ANNOTATION_TYPES.DISTANCE,
        }),
      ])
    ).toBe(true);
    expect(areAnnotationEntriesHidden([])).toBe(false);
  });
});
