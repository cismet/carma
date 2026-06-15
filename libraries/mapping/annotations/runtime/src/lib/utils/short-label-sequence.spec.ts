import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import { describe, expect, it } from "vitest";
import {
  ANNOTATION_SHORT_LABEL_SOURCES,
  type StoredAnnotation,
} from "../store/annotations-store.types";
import {
  normalizeAnnotationShortLabels,
  resolveNextShortLabelCounterForToolType,
} from "./short-label-sequence";

const buildAnnotation = (
  id: string,
  toolType: StoredAnnotation["toolType"],
  shortLabel?: string,
  shortLabelSource?: StoredAnnotation["shortLabelSource"],
  shortLabelCounter?: StoredAnnotation["shortLabelCounter"]
): StoredAnnotation => ({
  id,
  toolType,
  nodeIds: [],
  edgeIds: [],
  shortLabel,
  shortLabelSource,
  shortLabelCounter,
});

describe("short-label sequence", () => {
  it("ignores custom short labels when resolving the next distance counter", () => {
    expect(
      resolveNextShortLabelCounterForToolType({
        annotationEntries: [
          buildAnnotation(
            "distance-custom",
            ANNOTATION_TYPES.DISTANCE,
            "NAME",
            ANNOTATION_SHORT_LABEL_SOURCES.CUSTOM
          ),
        ],
        toolType: ANNOTATION_TYPES.DISTANCE,
      })
    ).toBe(1);
  });

  it("uses the next free default distance slot instead of incrementing from a custom label", () => {
    expect(
      resolveNextShortLabelCounterForToolType({
        annotationEntries: [
          buildAnnotation(
            "distance-a",
            ANNOTATION_TYPES.DISTANCE,
            "A",
            ANNOTATION_SHORT_LABEL_SOURCES.DEFAULT,
            1
          ),
          buildAnnotation(
            "distance-custom",
            ANNOTATION_TYPES.DISTANCE,
            "NAME",
            ANNOTATION_SHORT_LABEL_SOURCES.CUSTOM
          ),
        ],
        toolType: ANNOTATION_TYPES.DISTANCE,
      })
    ).toBe(2);
  });

  it("fills gaps in default point short labels", () => {
    expect(
      resolveNextShortLabelCounterForToolType({
        annotationEntries: [
          buildAnnotation(
            "point-1",
            ANNOTATION_TYPES.POINT,
            "1",
            ANNOTATION_SHORT_LABEL_SOURCES.DEFAULT,
            1
          ),
          buildAnnotation(
            "point-3",
            ANNOTATION_TYPES.POINT,
            "3",
            ANNOTATION_SHORT_LABEL_SOURCES.DEFAULT,
            3
          ),
        ],
        toolType: ANNOTATION_TYPES.POINT,
      })
    ).toBe(2);
  });

  it("does not derive counters from label text without metadata", () => {
    expect(
      resolveNextShortLabelCounterForToolType({
        annotationEntries: [
          buildAnnotation(
            "distance-legacy-custom",
            ANNOTATION_TYPES.DISTANCE,
            "NAME"
          ),
        ],
        toolType: ANNOTATION_TYPES.DISTANCE,
      })
    ).toBe(1);
  });

  it("marks normalized generated short labels as default labels", () => {
    expect(
      normalizeAnnotationShortLabels([
        buildAnnotation(
          "distance-a",
          ANNOTATION_TYPES.DISTANCE,
          "A",
          ANNOTATION_SHORT_LABEL_SOURCES.DEFAULT,
          1
        ),
        buildAnnotation(
          "distance-custom",
          ANNOTATION_TYPES.DISTANCE,
          "NAME",
          ANNOTATION_SHORT_LABEL_SOURCES.CUSTOM
        ),
        buildAnnotation("distance-new", ANNOTATION_TYPES.DISTANCE),
      ])
    ).toEqual([
      buildAnnotation(
        "distance-a",
        ANNOTATION_TYPES.DISTANCE,
        "A",
        ANNOTATION_SHORT_LABEL_SOURCES.DEFAULT,
        1
      ),
      buildAnnotation(
        "distance-custom",
        ANNOTATION_TYPES.DISTANCE,
        "NAME",
        ANNOTATION_SHORT_LABEL_SOURCES.CUSTOM
      ),
      buildAnnotation(
        "distance-new",
        ANNOTATION_TYPES.DISTANCE,
        "B",
        ANNOTATION_SHORT_LABEL_SOURCES.DEFAULT,
        2
      ),
    ]);
  });
});
