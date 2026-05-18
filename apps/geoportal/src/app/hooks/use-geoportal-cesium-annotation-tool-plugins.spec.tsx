import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
  annotationType?: string;
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

describe("useGeoportalCesiumAnnotationToolPlugins", () => {
  it("excludes the label tool from the stable Geoportal toolset", () => {
    useFeatureFlagsMock.mockReturnValue({
      featureFlagCesiumAnnotationAllTools: false,
    });

    const plugins = [
      createPlugin({ id: "select", order: 0 }),
      createPlugin({
        annotationType: "point",
        id: "point",
        order: 10,
      }),
      createPlugin({
        annotationType: "distance",
        id: "distance",
        order: 20,
      }),
      createPlugin({
        annotationType: "label",
        id: "label",
        order: 80,
      }),
      createPlugin({
        annotationType: "area-ground",
        id: "area-ground",
        order: 40,
      }),
    ];

    const { result } = renderHook(() =>
      useGeoportalCesiumAnnotationToolPlugins(plugins)
    );

    expect(result.current.map((plugin) => plugin.id)).toEqual([
      "select",
      "point",
      "distance",
    ]);
  });
});
