import { describe, expect, it, vi } from "vitest";

import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import {
  ANNOTATION_NODE_EDIT_RULES,
  BASIC_ANNOTATION_NODE_EDIT_RULES,
  type AnnotationToolPlugin,
  type AnnotationToolVisualModelContext,
  type StoredAnnotation,
} from "@carma-mapping/annotations/runtime";
import {
  createDefaultAnnotationToolPlugins,
  defaultAnnotationToolPlugins,
} from "./default-annotation-tool-plugins";

const nodes = [
  { id: "a", coordinate: { longitude: 7, latitude: 51, altitude: 100 } },
  { id: "b", coordinate: { longitude: 7.0001, latitude: 51, altitude: 101 } },
  { id: "c", coordinate: { longitude: 7, latitude: 51.0001, altitude: 102 } },
  {
    id: "d",
    coordinate: { longitude: 7.0001, latitude: 51.0001, altitude: 103 },
  },
];

const entryOf = (toolType: StoredAnnotation["toolType"]): StoredAnnotation => ({
  id: "m1",
  toolType,
  nodeIds:
    toolType === ANNOTATION_TYPES.AREA_VERTICAL
      ? ["a", "b", "d", "c"]
      : ["a", "b", "c"],
  edgeIds: [],
  closed: true,
  shortLabel: "M1",
});

const buildContext = (
  annotationEntries: StoredAnnotation[]
): AnnotationToolVisualModelContext => ({
  nodes,
  edges: [],
  linkedNodeGroups: [],
  annotationEntries,
  draftStatesByToolType: {},
  elevationReferenceAnnotationId: null,
  selectedAnnotationId: null,
  selectedAnnotationIds: [],
  isSelectionAdditiveModifierPressed: false,
  setSelectedAnnotationId: vi.fn(),
  setElevationReferenceAnnotationId: vi.fn(),
  toggleAnnotationElevationDisplayMode: vi.fn(),
  formatOptions: {},
});

const pointLabelsOf = (plugin: AnnotationToolPlugin) =>
  plugin.visualModels?.build(
    buildContext([
      entryOf(plugin.annotationType as StoredAnnotation["toolType"]),
    ])
  )?.pointLabels ?? [];

const pluginFor = (
  plugins: readonly AnnotationToolPlugin[],
  annotationType: string
) => plugins.find((plugin) => plugin.annotationType === annotationType);

describe("createDefaultAnnotationToolPlugins node edit rules", () => {
  it("declares only the roof rule of the Cesium measurement by default", () => {
    const declared = defaultAnnotationToolPlugins.filter(
      (plugin) => plugin.nodeEdit
    );

    expect(declared.map((plugin) => plugin.annotationType)).toEqual(
      Array(4).fill(ANNOTATION_TYPES.AREA_PLANAR)
    );
    for (const plugin of declared) {
      expect(plugin.nodeEdit).toBe(
        BASIC_ANNOTATION_NODE_EDIT_RULES[ANNOTATION_TYPES.AREA_PLANAR]
      );
    }
  });

  it("declares the per-type rule on every measurement tool with nodeEditRules", () => {
    const plugins = createDefaultAnnotationToolPlugins({
      nodeEditRules: true,
    });

    for (const plugin of plugins) {
      expect(plugin.nodeEdit).toEqual(
        plugin.annotationType
          ? ANNOTATION_NODE_EDIT_RULES[
              plugin.annotationType as keyof typeof ANNOTATION_NODE_EDIT_RULES
            ]
          : undefined
      );
    }
  });
});

describe("createDefaultAnnotationToolPlugins area value labels", () => {
  const areaTypes = [
    ANNOTATION_TYPES.AREA_GROUND,
    ANNOTATION_TYPES.AREA_PLANAR,
    ANNOTATION_TYPES.AREA_VERTICAL,
  ];

  it.each(areaTypes)("keeps the plain %s label by default", (type) => {
    const labels = pointLabelsOf(
      pluginFor(createDefaultAnnotationToolPlugins(), type)!
    );

    expect(labels).toHaveLength(1);
    expect(labels[0]).not.toHaveProperty("areaFit");
    expect(labels[0]).toHaveProperty("allowLongPressWhenBlocked", true);
  });

  it.each(areaTypes)(
    "adds the pill twin of the %s label with areaLabelPills",
    (type) => {
      const labels = pointLabelsOf(
        pluginFor(
          createDefaultAnnotationToolPlugins({ areaLabelPills: true }),
          type
        )!
      );

      expect(labels.map((label) => label.areaFit?.role)).toEqual([
        "inside",
        "outside",
      ]);
    }
  );
});

describe("createDefaultAnnotationToolPlugins polyline label", () => {
  const polylineLabel = (polylineEndBadge?: boolean) =>
    pointLabelsOf(
      pluginFor(
        createDefaultAnnotationToolPlugins({ polylineEndBadge }),
        ANNOTATION_TYPES.POLYLINE
      )!
    )[0];

  it("anchors the label on the last node by default", () => {
    expect(polylineLabel()).toMatchObject({ nodeId: "c", badgeContent: "M1" });
    expect(polylineLabel()?.content).toMatch(/^M1\s+/);
  });

  it("anchors the badge on the screen-left end with polylineEndBadge", () => {
    expect(polylineLabel(true)).toMatchObject({
      nodeId: "a",
      badgeContent: "M1",
      hideMarker: true,
    });
    expect(polylineLabel(true)?.content).not.toMatch(/M1/);
  });
});
