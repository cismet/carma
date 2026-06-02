import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ANNOTATION_SELECT_TOOL_ID,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";
import {
  ANNOTATION_TOOL_PLUGIN_KINDS,
  type AnnotationToolPlugin,
} from "@carma-mapping/annotations/runtime";

const useFeatureFlagsMock = vi.hoisted(() => vi.fn());

vi.mock("@carma-providers/feature-flag", () => ({
  useFeatureFlags: () => useFeatureFlagsMock(),
}));

import { useGeoportalCesiumAnnotationToolPlugins } from "./use-geoportal-cesium-annotation-tool-plugins";

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

describe("useGeoportalCesiumAnnotationToolPlugins", () => {
  it("excludes the label tool from the stable Geoportal toolset", () => {
    useFeatureFlagsMock.mockReturnValue({
      featureFlagCesiumAnnotationAllTools: false,
    });

    const plugins = [
      createPlugin({ id: ANNOTATION_SELECT_TOOL_ID, order: 0 }),
      createPlugin({
        annotationType: ANNOTATION_TYPES.POINT,
        id: ANNOTATION_TYPES.POINT,
        order: 10,
      }),
      createPlugin({
        annotationType: ANNOTATION_TYPES.DISTANCE,
        id: ANNOTATION_TYPES.DISTANCE,
        order: 20,
      }),
      createPlugin({
        annotationType: ANNOTATION_TYPES.LABEL,
        id: ANNOTATION_TYPES.LABEL,
        order: 80,
      }),
      createPlugin({
        annotationType: ANNOTATION_TYPES.AREA_GROUND,
        id: ANNOTATION_TYPES.AREA_GROUND,
        order: 40,
      }),
    ];

    const { result } = renderHook(() =>
      useGeoportalCesiumAnnotationToolPlugins(plugins)
    );

    expect(result.current.map((plugin) => plugin.id)).toEqual([
      ANNOTATION_SELECT_TOOL_ID,
      ANNOTATION_TYPES.POINT,
      ANNOTATION_TYPES.DISTANCE,
    ]);
  });
});
