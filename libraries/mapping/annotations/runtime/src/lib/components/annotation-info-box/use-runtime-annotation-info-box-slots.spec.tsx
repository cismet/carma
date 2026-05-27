import { render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";

import type {
  AnnotationToolPlugin,
  AnnotationToolRegistry,
} from "../../registry";
import { ANNOTATION_TOOL_PLUGIN_KINDS } from "../../registry";
import type { StoredAnnotation } from "../../store";

const useAnnotationsRuntimeMock = vi.hoisted(() => vi.fn());

vi.mock("../../context/AnnotationsProvider", () => ({
  useAnnotationsRuntime: useAnnotationsRuntimeMock,
}));

import {
  RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS,
  useRuntimeAnnotationInfoBoxSlots,
} from "./use-runtime-annotation-info-box-slots";

type AnnotationInfoBoxGetSlots = NonNullable<
  AnnotationToolPlugin["infoBox"]
>["getSlots"];

const createPlugin = ({
  annotationType = null,
  helpText,
  id,
  getSlots,
}: {
  annotationType?: AnnotationToolPlugin["annotationType"];
  helpText?: readonly string[];
  id: AnnotationToolPlugin["id"];
  getSlots?: AnnotationInfoBoxGetSlots;
}): AnnotationToolPlugin => ({
  annotationType,
  descriptor: {
    id,
    label: `${id} label`,
    order: 0,
    tooltip: `${id} tooltip`,
  },
  helpText,
  id,
  infoBox: getSlots ? { getSlots } : undefined,
  kind: ANNOTATION_TOOL_PLUGIN_KINDS.MEASUREMENT,
});

const createRegistry = (
  plugins: readonly AnnotationToolPlugin[]
): AnnotationToolRegistry =>
  ({
    plugins,
    getPlugin: (id: string) =>
      plugins.find((plugin) => plugin.id === id) ?? null,
    getPluginsByAnnotationType: (annotationType: string) =>
      plugins.filter((plugin) => plugin.annotationType === annotationType),
  } as AnnotationToolRegistry);

const createAnnotation = ({
  id,
  toolType,
}: {
  id: string;
  toolType: StoredAnnotation["toolType"];
}): StoredAnnotation =>
  ({
    edgeIds: [],
    id,
    nodeIds: [],
    toolType,
  } as StoredAnnotation);

const createRuntime = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  activeToolType: ANNOTATION_TYPES.SELECT,
  annotationEntries: [],
  elevationReferenceAnnotationId: null,
  exportAnnotationGeoJson: vi.fn(),
  flyToAllAnnotations: vi.fn(),
  focusAnnotationId: vi.fn(),
  formatOptions: {},
  nodes: [],
  registry: createRegistry([]),
  removeAnnotationById: vi.fn(),
  selectedAnnotationId: null,
  setElevationReferenceAnnotationId: vi.fn(),
  setSelectedAnnotationId: vi.fn(),
  toggleAnnotationLocked: vi.fn(),
  toggleAnnotationVisibility: vi.fn(),
  updateAnnotationDisplayName: vi.fn(),
  updateAnnotationShortLabel: vi.fn(),
  ...overrides,
});

describe("useRuntimeAnnotationInfoBoxSlots", () => {
  beforeEach(() => {
    useAnnotationsRuntimeMock.mockReset();
  });

  it("resolves selected annotation slots through the owning plugin", () => {
    const annotation = createAnnotation({
      id: "distance-1",
      toolType: ANNOTATION_TYPES.DISTANCE,
    });
    const slots = {
      headingTitle: "Distance",
      content: <span>Distance content</span>,
    };
    const getSlots = vi.fn(() => slots);
    const resolveVisualOptions = vi.fn(() => ({
      bodyTextClassName: "custom-body",
      showSubtitleMetaText: false,
    }));
    const plugin = createPlugin({
      annotationType: ANNOTATION_TYPES.DISTANCE,
      getSlots,
      id: ANNOTATION_TYPES.DISTANCE,
    });

    useAnnotationsRuntimeMock.mockReturnValue(
      createRuntime({
        annotationEntries: [annotation],
        registry: createRegistry([plugin]),
        selectedAnnotationId: annotation.id,
      })
    );

    const { result } = renderHook(() =>
      useRuntimeAnnotationInfoBoxSlots({
        visualOptions: resolveVisualOptions,
      })
    );

    expect(result.current).toEqual(
      expect.objectContaining({
        annotation,
        kind: RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION,
        slots,
      })
    );
    expect(result.current?.visualOptions.bodyTextClassName).toBe("custom-body");
    expect(result.current?.visualOptions.showSubtitleMetaText).toBe(false);
    expect(resolveVisualOptions).toHaveBeenCalledWith({
      annotation,
      kind: RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION,
    });
    expect(getSlots).toHaveBeenCalledWith(
      expect.objectContaining({
        annotation,
        selectedAnnotationId: annotation.id,
        infoBoxVisualOptions: expect.objectContaining({
          bodyTextClassName: "custom-body",
          showSubtitleMetaText: false,
        }),
      })
    );
  });

  it("resolves active tool help text as fallback slots when requested", () => {
    const plugin = createPlugin({
      helpText: ["Klick auf die Karte.", "Jeder weitere Klick misst neu."],
      id: ANNOTATION_TYPES.POINT,
    });

    useAnnotationsRuntimeMock.mockReturnValue(
      createRuntime({
        activeToolType: plugin.id,
        registry: createRegistry([plugin]),
      })
    );

    const { result } = renderHook(() =>
      useRuntimeAnnotationInfoBoxSlots({
        includeFallback: true,
      })
    );

    expect(result.current).toEqual(
      expect.objectContaining({
        kind: RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.FALLBACK,
        plugin,
        slots: expect.objectContaining({
          collapsible: true,
          headingTitle: plugin.descriptor.label,
        }),
      })
    );

    render(<>{result.current?.slots.content}</>);

    expect(screen.getByText("Klick auf die Karte.")).toBeTruthy();
    expect(screen.getByText("Jeder weitere Klick misst neu.")).toBeTruthy();
  });

  it("does not return fallback slots unless fallback rendering is enabled", () => {
    const plugin = createPlugin({
      helpText: ["Klick auf die Karte."],
      id: ANNOTATION_TYPES.POINT,
    });

    useAnnotationsRuntimeMock.mockReturnValue(
      createRuntime({
        activeToolType: plugin.id,
        registry: createRegistry([plugin]),
      })
    );

    const { result } = renderHook(() => useRuntimeAnnotationInfoBoxSlots());

    expect(result.current).toBeNull();
  });
});
