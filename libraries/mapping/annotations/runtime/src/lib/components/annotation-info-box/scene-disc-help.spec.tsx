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
const plugin = {
  id: ANNOTATION_TYPES.POINT,
  annotationType: ANNOTATION_TYPES.POINT,
  pointQuery: {},
  helpText: legacy,
} as unknown as AnnotationToolPlugin;
const registry = {
  getPlugin: () => plugin,
  getPluginsByAnnotationType: () => [plugin],
};
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
const authoring = (e: AnnotationEngine, p = plugin) =>
  ({
    engine: e,
    activeToolType: ANNOTATION_TYPES.POINT,
    registry: { ...registry, getPlugin: () => p },
    activePointQueryPickResult: null,
    activeToolDraftFeedback: null,
    activeToolDraftState: {},
    includeAuthoringInstruction: true,
  } as unknown as Parameters<
    typeof useRuntimeAnnotationInfoBoxAuthoringInstruction
  >[0]);
describe("Three-only guide instructions", () => {
  it("retains the exact existing plugin instructions for Cesium and appends Three guidance only for the scene capability", () => {
    const { result, rerender } = renderHook(
      ({ e }) => useRuntimeAnnotationInfoBoxAuthoringInstruction(authoring(e)),
      { initialProps: { e: engine(false) } }
    );
    expect(items(result.current!.content)).toBe(legacy);
    rerender({ e: engine(true) });
    const next = items(result.current!.content);
    expect(next.slice(0, legacy.length)).toEqual(legacy);
    expect(next).toHaveLength(legacy.length + 2);
    expect(JSON.stringify(next)).toContain("Ost/West");
    expect(JSON.stringify(next)).toContain("R zeigt");
    expect(plugin.helpText).toBe(legacy);
  });
  it("does not add query instructions for a tool without point-query behavior", () => {
    const noQuery = { ...plugin, pointQuery: undefined };
    const { result } = renderHook(() =>
      useRuntimeAnnotationInfoBoxAuthoringInstruction(
        authoring(engine(true), noQuery)
      )
    );
    expect(items(result.current!.content)).toBe(legacy);
  });
  it("retains all edit actions and legacy wording, with the Three description added by capability", () => {
    const options = {
      activeEditedNodeId: "node",
      activeToolType: ANNOTATION_SELECT_TOOL_ID,
      annotationEntries: [
        { id: "point", toolType: ANNOTATION_TYPES.POINT, nodeIds: ["node"] },
      ],
      registry,
      includeAuthoringInstruction: true,
    } as unknown as Omit<
      Parameters<typeof useRuntimeAnnotationInfoBoxEditingInstruction>[0],
      "engine"
    >;
    const { result, rerender } = renderHook(
      ({ e }) =>
        useRuntimeAnnotationInfoBoxEditingInstruction({
          ...options,
          engine: e,
        }),
      { initialProps: { e: engine(false) } }
    );
    const prior = items(result.current!.slots.content);
    expect(prior).toEqual(
      resolveNodeEditHelpItems({ toolType: ANNOTATION_TYPES.POINT })
    );
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
});
