import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import { describe, expect, it } from "vitest";
import type { StoredAnnotation } from "../store/annotations-store.types";
import {
  buildStoredAnnotationGeoJsonFeatureCollection,
  sanitizeAnnotationExportFileSegment,
} from "./annotation-geo-json-export";
const {
  AREA_GROUND: ANNOTATION_TYPE_AREA_GROUND,
  DISTANCE: ANNOTATION_TYPE_DISTANCE,
  LABEL: ANNOTATION_TYPE_LABEL,
  POINT: ANNOTATION_TYPE_POINT,
} = ANNOTATION_TYPES;

const createAnnotation = (
  overrides: Partial<StoredAnnotation> = {}
): StoredAnnotation => ({
  id: "annotation-1",
  toolType: ANNOTATION_TYPE_DISTANCE,
  nodeIds: [],
  edgeIds: [],
  ...overrides,
});

describe("runtimeAnnotationGeoJsonExport", () => {
  it("closes polygon rings for area annotations", () => {
    const collection = buildStoredAnnotationGeoJsonFeatureCollection({
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
    const pointCollection = buildStoredAnnotationGeoJsonFeatureCollection({
      annotation: createAnnotation({
        toolType: ANNOTATION_TYPE_POINT,
      }),
      coordinates: [{ longitude: 7.0, latitude: 51.0, altitude: 100 }],
    });
    const labelCollection = buildStoredAnnotationGeoJsonFeatureCollection({
      annotation: createAnnotation({
        toolType: ANNOTATION_TYPE_LABEL,
      }),
      coordinates: [
        { longitude: 7.0, latitude: 51.0, altitude: 100 },
        { longitude: 7.1, latitude: 51.1, altitude: 101 },
      ],
    });
    const lineCollection = buildStoredAnnotationGeoJsonFeatureCollection({
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
      sanitizeAnnotationExportFileSegment("  Messung Nord/Ost  ")
    ).toBe("messung-nord-ost");
    expect(sanitizeAnnotationExportFileSegment("___")).toBe(
      "annotation"
    );
    expect(sanitizeAnnotationExportFileSegment(null)).toBe("annotation");
  });

  it("normalizes nested annotation properties and omits undefined entries", () => {
    const annotation = createAnnotation({
      displayName: "  Testexport  ",
      shortLabel: "M-1",
    }) as StoredAnnotation & {
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

    const collection = buildStoredAnnotationGeoJsonFeatureCollection({
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
