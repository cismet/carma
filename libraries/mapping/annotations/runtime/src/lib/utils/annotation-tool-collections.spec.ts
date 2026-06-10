import { describe, expect, it } from "vitest";
import {
  ANNOTATION_SELECT_TOOL_ID,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";

import type { AnnotationToolPlugin, AnnotationToolRegistry } from "../registry";
import { ANNOTATION_TOOL_PLUGIN_KINDS } from "../registry";
import type { StoredAnnotation } from "../store";
import {
  areAnnotationEntriesHidden,
  resolveAnnotationCancelToolId,
  resolveAnnotationCountByToolType,
  resolveAnnotationEntriesByToolType,
  resolveAnnotationIdsByToolType,
  resolveAnnotationToolFallbackPlugin,
  resolvePrimaryAnnotationInteractionToolId,
  resolveVisibleMeasurementAnnotationToolPlugins,
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
  hidden = false,
  id,
  readOnlySource,
  toolType,
}: {
  hidden?: boolean;
  id: string;
  readOnlySource?: StoredAnnotation["readOnlySource"];
  toolType: StoredAnnotation["toolType"];
}): StoredAnnotation =>
  ({
    hidden,
    id,
    nodeIds: [],
    readOnlySource,
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

  it("excludes read-only annotation entries from authoring groups", () => {
    const entries = [
      createAnnotation({ id: "a", toolType: ANNOTATION_TYPES.DISTANCE }),
      createAnnotation({
        id: "b",
        readOnlySource: { type: "saved-measurement", id: "saved-layer" },
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

  it("resolves interaction and fallback plugins", () => {
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
      resolveAnnotationToolFallbackPlugin({
        activeToolType: ANNOTATION_TYPES.POINT,
        registry,
      })
    ).toBe(selectPlugin);
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
