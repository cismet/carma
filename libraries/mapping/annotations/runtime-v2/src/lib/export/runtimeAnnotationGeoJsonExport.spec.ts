import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
} from "@carma-mapping/annotations/core";
import { describe, expect, it } from "vitest";

import type { RuntimeAnnotationEntry } from "../store/annotationsStore.types";
import {
  buildRuntimeAnnotationGeoJsonFeatureCollection,
  sanitizeRuntimeAnnotationExportFileSegment,
} from "./runtimeAnnotationGeoJsonExport";

const createAnnotation = (
  overrides: Partial<RuntimeAnnotationEntry> = {}
): RuntimeAnnotationEntry => ({
  id: "annotation-1",
  toolType: ANNOTATION_TYPE_DISTANCE,
  nodeIds: [],
  edgeIds: [],
  ...overrides,
});

describe("runtimeAnnotationGeoJsonExport", () => {
  it("closes polygon rings for area annotations", () => {
    const collection = buildRuntimeAnnotationGeoJsonFeatureCollection({
      annotation: createAnnotation({
        toolType: ANNOTATION_TYPE_AREA_GROUND,
      }),
      coordinates: [
        { longitude: 7.0, latitude: 51.0, altitude: 100 },
        { longitude: 7.1, latitude: 51.0, altitude: 100 },
        { longitude: 7.1, latitude: 51.1, altitude: 100 },
      ],
    });

    expect(collection?.features[0]?.geometry).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [7.0, 51.0, 100],
          [7.1, 51.0, 100],
          [7.1, 51.1, 100],
          [7.0, 51.0, 100],
        ],
      ],
    });
  });

  it("exports point-like tools as points and multi-node tools as lines", () => {
    const pointCollection = buildRuntimeAnnotationGeoJsonFeatureCollection({
      annotation: createAnnotation({
        toolType: ANNOTATION_TYPE_POINT,
      }),
      coordinates: [{ longitude: 7.0, latitude: 51.0, altitude: 100 }],
    });
    const labelCollection = buildRuntimeAnnotationGeoJsonFeatureCollection({
      annotation: createAnnotation({
        toolType: ANNOTATION_TYPE_LABEL,
      }),
      coordinates: [
        { longitude: 7.0, latitude: 51.0, altitude: 100 },
        { longitude: 7.1, latitude: 51.1, altitude: 101 },
      ],
    });
    const lineCollection = buildRuntimeAnnotationGeoJsonFeatureCollection({
      annotation: createAnnotation({
        toolType: ANNOTATION_TYPE_DISTANCE,
      }),
      coordinates: [
        { longitude: 7.0, latitude: 51.0, altitude: 100 },
        { longitude: 7.1, latitude: 51.1, altitude: 101 },
      ],
    });

    expect(pointCollection?.features[0]?.geometry).toEqual({
      type: "Point",
      coordinates: [7.0, 51.0, 100],
    });
    expect(labelCollection?.features[0]?.geometry).toEqual({
      type: "Point",
      coordinates: [7.0, 51.0, 100],
    });
    expect(lineCollection?.features[0]?.geometry).toEqual({
      type: "LineString",
      coordinates: [
        [7.0, 51.0, 100],
        [7.1, 51.1, 101],
      ],
    });
  });

  it("sanitizes empty and special-character-heavy file name segments", () => {
    expect(
      sanitizeRuntimeAnnotationExportFileSegment("  Messung Nord/Ost  ")
    ).toBe("messung-nord-ost");
    expect(sanitizeRuntimeAnnotationExportFileSegment("___")).toBe(
      "annotation"
    );
    expect(sanitizeRuntimeAnnotationExportFileSegment(null)).toBe("annotation");
  });

  it("normalizes nested annotation properties and omits undefined entries", () => {
    const annotation = createAnnotation({
      displayName: "  Testexport  ",
      shortLabel: "M-1",
    }) as RuntimeAnnotationEntry & {
      tags: unknown[];
      meta: Record<string, unknown>;
    };
    annotation.tags = ["one", undefined, { nested: true }];
    annotation.meta = {
      keep: "value",
      drop: undefined,
      nested: {
        keep: 3,
        drop: undefined,
      },
    };

    const collection = buildRuntimeAnnotationGeoJsonFeatureCollection({
      annotation,
      coordinates: [{ longitude: 7.0, latitude: 51.0, altitude: 100 }],
    });

    expect(collection?.features[0]?.properties?.annotation).toEqual({
      id: "annotation-1",
      toolType: ANNOTATION_TYPE_DISTANCE,
      nodeIds: [],
      edgeIds: [],
      displayName: "  Testexport  ",
      shortLabel: "M-1",
      tags: ["one", { nested: true }],
      meta: {
        keep: "value",
        nested: {
          keep: 3,
        },
      },
    });
  });
});
