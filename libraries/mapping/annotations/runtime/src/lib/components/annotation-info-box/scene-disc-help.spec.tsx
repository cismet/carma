import type { ReactElement } from "react";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ANNOTATION_TYPES,
  ANNOTATION_SELECT_TOOL_ID,
  type AnnotationEngine,
} from "@carma-mapping/annotations/core";
import {
  ANNOTATION_INFO_BOX_HELP_ITEM_KINDS,
  type AnnotationInfoBoxHelpItem,
} from "@carma-mapping/annotations/ui";
import type { AnnotationToolPlugin } from "../../registry";
import { useRuntimeAnnotationInfoBoxAuthoringInstruction } from "./use-runtime-annotation-info-box-authoring-instruction";
import { useRuntimeAnnotationInfoBoxEditingInstruction } from "./use-runtime-annotation-info-box-editing-instruction";
import { resolveNodeEditHelpItems } from "./node-edit-help";
const legacy = [
  {
    kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.TEXT,
    text: "Bestehender Werkzeughinweis",
  },
] as const;
const pluginFor = (toolType: string, pointQuery = true) =>
  ({
    id: toolType,
    annotationType: toolType,
    pointQuery: pointQuery ? {} : undefined,
    helpText: legacy,
  } as unknown as AnnotationToolPlugin);
const registry = (plugin: AnnotationToolPlugin) => ({
  getPlugin: () => plugin,
  getPluginsByAnnotationType: () => [plugin],
});
const engine = (inScene: boolean) =>
  ({
    kind: inScene ? "maplibre" : "cesium",
    capabilities: { pointQueryDiscInScene: inScene },
  } as unknown as AnnotationEngine);
const items = (content: unknown) =>
  (
    content as ReactElement<{
      children: ReactElement<{ items: readonly AnnotationInfoBoxHelpItem[] }>;
    }>
  ).props.children.props.items;
const authoring = (e: AnnotationEngine, plugin: AnnotationToolPlugin) =>
  ({
    engine: e,
    activeToolType: plugin.id,
    registry: registry(plugin),
    activePointQueryPickResult: null,
    activeToolDraftFeedback: null,
    activeToolDraftState: {},
    includeAuthoringInstruction: true,
  } as unknown as Parameters<
    typeof useRuntimeAnnotationInfoBoxAuthoringInstruction
  >[0]);
const editing = (e: AnnotationEngine, plugin: AnnotationToolPlugin) =>
  ({
    engine: e,
    activeEditedNodeId: "node",
    activeToolType: ANNOTATION_SELECT_TOOL_ID,
    annotationEntries: [
      { id: "measurement", toolType: plugin.id, nodeIds: ["node"] },
    ],
    registry: registry(plugin),
    includeAuthoringInstruction: true,
  } as unknown as Parameters<
    typeof useRuntimeAnnotationInfoBoxEditingInstruction
  >[0]);
describe("stable-tool help parity and Three extra-tool guide instructions", () => {
  it.each([ANNOTATION_TYPES.POINT, ANNOTATION_TYPES.DISTANCE])(
    "retains identical authoring text for stable %s in Three and Cesium",
    (toolType) => {
      const plugin = pluginFor(toolType),
        { result, rerender } = renderHook(
          ({ e }) =>
            useRuntimeAnnotationInfoBoxAuthoringInstruction(
              authoring(e, plugin)
            ),
          { initialProps: { e: engine(false) } }
        );
      expect(items(result.current!.content)).toBe(legacy);
      rerender({ e: engine(true) });
      expect(items(result.current!.content)).toBe(legacy);
      expect(plugin.helpText).toBe(legacy);
    }
  );
  it.each([ANNOTATION_TYPES.POINT, ANNOTATION_TYPES.DISTANCE])(
    "retains identical edit actions/text for stable %s in Three and Cesium",
    (toolType) => {
      const plugin = pluginFor(toolType),
        { result, rerender } = renderHook(
          ({ e }) =>
            useRuntimeAnnotationInfoBoxEditingInstruction(editing(e, plugin)),
          { initialProps: { e: engine(false) } }
        );
      const prior = items(result.current!.slots.content);
      expect(prior).toEqual(resolveNodeEditHelpItems({ toolType }));
      rerender({ e: engine(true) });
      expect(items(result.current!.slots.content)).toEqual(prior);
    }
  );
  it("keeps Three symbology/snap guidance for Polyline while preserving Cesium plugin text", () => {
    const plugin = pluginFor(ANNOTATION_TYPES.POLYLINE),
      { result, rerender } = renderHook(
        ({ e }) =>
          useRuntimeAnnotationInfoBoxAuthoringInstruction(authoring(e, plugin)),
        { initialProps: { e: engine(false) } }
      );
    expect(items(result.current!.content)).toBe(legacy);
    rerender({ e: engine(true) });
    const next = items(result.current!.content);
    expect(next.slice(0, legacy.length)).toEqual(legacy);
    expect(next).toHaveLength(legacy.length + 2);
    expect(JSON.stringify(next)).toContain("waagerecht");
    expect(JSON.stringify(next)).toContain("R zeigt");
    expect(JSON.stringify(next)).toContain("Snap");
    expect(plugin.helpText).toBe(legacy);
  });
  it("adds only the Three reticle description for Polyline edit without altering its actions", () => {
    const plugin = pluginFor(ANNOTATION_TYPES.POLYLINE),
      { result, rerender } = renderHook(
        ({ e }) =>
          useRuntimeAnnotationInfoBoxEditingInstruction(editing(e, plugin)),
        { initialProps: { e: engine(false) } }
      );
    const prior = items(result.current!.slots.content);
    rerender({ e: engine(true) });
    const next = items(result.current!.slots.content);
    expect(
      next.filter(
        (item) => !JSON.stringify(item).includes("Der kleine offene Kreis")
      )
    ).toEqual(prior);
    expect(
      next.filter((item) =>
        JSON.stringify(item).includes("Der kleine offene Kreis")
      )
    ).toHaveLength(1);
  });
  it("does not append query help for extra tools without a point-query contract", () => {
    const plugin = pluginFor(ANNOTATION_TYPES.POLYLINE, false),
      { result } = renderHook(() =>
        useRuntimeAnnotationInfoBoxAuthoringInstruction(
          authoring(engine(true), plugin)
        )
      );
    expect(items(result.current!.content)).toBe(legacy);
  });
});
