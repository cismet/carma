import { describe, expect, it } from "vitest";

import type { AnnotationToolPlugin, AnnotationToolRegistry } from "../registry";
import { ANNOTATION_TOOL_PLUGIN_KINDS } from "../registry";
import type { StoredAnnotation } from "../store";
import {
  areAnnotationEntriesHidden,
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
  annotationType?: string | null;
  id: string;
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
  toolType,
}: {
  hidden?: boolean;
  id: string;
  toolType: string;
}): StoredAnnotation =>
  ({
    hidden,
    id,
    nodeIds: [],
    toolType,
  } as StoredAnnotation);

describe("annotation-tool-collections", () => {
  it("lists visible select and measurement tools in descriptor order", () => {
    const plugins = [
      createPlugin({
        annotationType: "distance",
        id: "distance",
        order: 2,
      }),
      createPlugin({
        id: "interaction",
        kind: ANNOTATION_TOOL_PLUGIN_KINDS.INTERACTION,
        order: 1,
      }),
      createPlugin({ id: "select", order: 0 }),
      createPlugin({ id: "draft", order: 3 }),
    ];

    expect(
      resolveVisibleMeasurementAnnotationToolPlugins(plugins).map(
        (plugin) => plugin.id
      )
    ).toEqual(["select", "distance"]);
  });

  it("limits visible measurement tools to an explicit tool id allow-list", () => {
    const plugins = [
      createPlugin({ id: "select", order: 0 }),
      createPlugin({
        annotationType: "distance",
        id: "distance",
        order: 2,
      }),
      createPlugin({
        annotationType: "area",
        id: "area",
        order: 3,
      }),
    ];

    expect(
      resolveVisibleMeasurementAnnotationToolPlugins(plugins, {
        toolIds: ["select", "distance"],
      }).map((plugin) => plugin.id)
    ).toEqual(["select", "distance"]);
  });

  it("groups annotation entries by tool type", () => {
    const entries = [
      createAnnotation({ id: "a", toolType: "distance" }),
      createAnnotation({ id: "b", toolType: "area" }),
      createAnnotation({ id: "c", toolType: "distance" }),
    ];

    expect(resolveAnnotationCountByToolType(entries).get("distance")).toBe(2);
    expect(resolveAnnotationIdsByToolType(entries).get("distance")).toEqual([
      "a",
      "c",
    ]);
    expect(
      resolveAnnotationEntriesByToolType(entries)
        .get("distance")
        ?.map((entry) => entry.id)
    ).toEqual(["a", "c"]);
  });

  it("resolves interaction and fallback plugins", () => {
    const selectPlugin = createPlugin({ id: "select", order: 0 });
    const interactionPlugin = createPlugin({
      id: "interaction",
      kind: ANNOTATION_TOOL_PLUGIN_KINDS.INTERACTION,
      order: 1,
    });
    const registry = {
      plugins: [selectPlugin, interactionPlugin],
      getPlugin: (id: string) =>
        [selectPlugin, interactionPlugin].find((plugin) => plugin.id === id),
    } as unknown as AnnotationToolRegistry;

    expect(resolvePrimaryAnnotationInteractionToolId(registry.plugins)).toEqual(
      "interaction"
    );
    expect(
      resolveAnnotationToolFallbackPlugin({
        activeToolType: "missing",
        registry,
      })
    ).toBe(selectPlugin);
  });

  it("detects all-hidden entry groups", () => {
    expect(
      areAnnotationEntriesHidden([
        createAnnotation({ hidden: true, id: "a", toolType: "distance" }),
        createAnnotation({ hidden: true, id: "b", toolType: "distance" }),
      ])
    ).toBe(true);
    expect(areAnnotationEntriesHidden([])).toBe(false);
  });
});
