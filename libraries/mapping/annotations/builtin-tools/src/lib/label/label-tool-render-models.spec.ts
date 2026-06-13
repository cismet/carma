import { describe, expect, it, vi } from "vitest";

import type {
  AnnotationNode,
  StoredAnnotation,
} from "@carma-mapping/annotations/runtime";

import { buildLabelToolRenderModels } from "./label-tool-render-models";

const createNode = (): AnnotationNode => ({
  coordinate: {
    altitude: 100,
    latitude: 51,
    longitude: 7,
  },
  id: "node-1",
});

const createNodeWithId = (id: string): AnnotationNode => ({
  ...createNode(),
  id,
});

const createLabelAnnotation = (
  overrides: Partial<StoredAnnotation> = {}
): StoredAnnotation => ({
  edgeIds: [],
  id: "label-1",
  nodeIds: ["node-1"],
  toolType: "label",
  ...overrides,
});

describe("buildLabelToolRenderModels", () => {
  it("applies per-annotation label appearance to selected label render models", () => {
    const { pointLabels } = buildLabelToolRenderModels({
      annotations: [
        createLabelAnnotation({
          labelAppearance: {
            backgroundColor: "#123456",
            fontSizePx: 22,
            textColor: "#abcdef",
          },
        }),
      ],
      nodes: [createNode()],
      onSelect: vi.fn(),
      selectedAnnotationIds: ["label-1"],
      toolType: "label",
    });

    expect(pointLabels[0]).toMatchObject({
      fontSize: "22px",
      hoverBackgroundColor: "#123456",
      markerBackgroundColor: "#123456",
      markerTextColor: "#abcdef",
      preserveFillOnSelection: true,
      selected: true,
      selectedBackgroundColor: "#123456",
      selectedTextColor: "#abcdef",
      textBackgroundColor: "#123456",
      textColor: "#abcdef",
    });
  });

  it("keeps default selected fill behavior when only the custom text color is set", () => {
    const { pointLabels } = buildLabelToolRenderModels({
      annotations: [
        createLabelAnnotation({
          labelAppearance: {
            textColor: "#abcdef",
          },
        }),
      ],
      nodes: [createNode()],
      onSelect: vi.fn(),
      selectedAnnotationIds: ["label-1"],
      toolType: "label",
    });

    expect(pointLabels[0]).toMatchObject({
      markerTextColor: "#abcdef",
      preserveFillOnSelection: false,
      selected: true,
      selectedTextColor: "#abcdef",
      textColor: "#abcdef",
    });
    expect(pointLabels[0]?.hoverBackgroundColor).toBeUndefined();
    expect(pointLabels[0]?.markerBackgroundColor).toBeUndefined();
    expect(pointLabels[0]?.selectedBackgroundColor).toBeUndefined();
    expect(pointLabels[0]?.textBackgroundColor).toBeUndefined();
  });

  it("keeps custom label appearance scoped to the matching label annotation", () => {
    const { pointLabels } = buildLabelToolRenderModels({
      annotations: [
        createLabelAnnotation({
          id: "label-1",
          labelAppearance: {
            backgroundColor: "#123456",
            textColor: "#abcdef",
          },
          nodeIds: ["node-1"],
        }),
        createLabelAnnotation({
          id: "label-2",
          nodeIds: ["node-2"],
        }),
      ],
      nodes: [createNodeWithId("node-1"), createNodeWithId("node-2")],
      onSelect: vi.fn(),
      selectedAnnotationIds: [],
      toolType: "label",
    });

    expect(pointLabels[0]).toMatchObject({
      markerBackgroundColor: "#123456",
      markerTextColor: "#abcdef",
      textBackgroundColor: "#123456",
      textColor: "#abcdef",
    });
    expect(pointLabels[1]?.markerBackgroundColor).toBeUndefined();
    expect(pointLabels[1]?.markerTextColor).toBeUndefined();
    expect(pointLabels[1]?.textBackgroundColor).toBeUndefined();
    expect(pointLabels[1]?.textColor).toBeUndefined();
  });

  it("keeps default selection fill behavior when a label has no custom appearance", () => {
    const { pointLabels } = buildLabelToolRenderModels({
      annotations: [createLabelAnnotation()],
      nodes: [createNode()],
      onSelect: vi.fn(),
      selectedAnnotationIds: ["label-1"],
      toolType: "label",
    });

    expect(pointLabels[0]?.preserveFillOnSelection).toBe(false);
    expect(pointLabels[0]?.hoverBackgroundColor).toBeUndefined();
    expect(pointLabels[0]?.markerBackgroundColor).toBeUndefined();
    expect(pointLabels[0]?.markerTextColor).toBeUndefined();
    expect(pointLabels[0]?.selectedBackgroundColor).toBeUndefined();
    expect(pointLabels[0]?.selectedTextColor).toBeUndefined();
    expect(pointLabels[0]?.textBackgroundColor).toBeUndefined();
    expect(pointLabels[0]?.textColor).toBeUndefined();
  });
});
