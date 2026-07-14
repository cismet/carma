import { render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANNOTATION_SELECT_TOOL_ID,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";
import {
  ANNOTATION_INFO_BOX_ACTION_IDS,
  ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS,
  ANNOTATION_INFO_BOX_HELP_ITEM_KINDS,
  type AnnotationInfoBoxHelpItem,
} from "@carma-mapping/annotations/ui";

import type {
  AnnotationToolDraftStore,
  AnnotationToolPlugin,
  AnnotationToolRegistry,
} from "../../registry";
import { ANNOTATION_TOOL_PLUGIN_KINDS } from "../../registry";
import type { StoredAnnotation } from "../../store";

const useAnnotationsRuntimeMock = vi.hoisted(() => vi.fn());
const useActivePointQueryPickResultMock = vi.hoisted(() => vi.fn());

vi.mock("../../context/AnnotationsProvider", () => ({
  useActivePointQueryPickResult: useActivePointQueryPickResultMock,
  useAnnotationsRuntime: useAnnotationsRuntimeMock,
}));

import { RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS } from "./runtime-annotation-info-box-slots.types";
import { useRuntimeAnnotationInfoBoxSlots } from "./use-runtime-annotation-info-box-slots";

type AnnotationInfoBoxGetSlots = NonNullable<
  AnnotationToolPlugin["infoBox"]
>["getSlots"];

const createPlugin = ({
  annotationType = null,
  helpText,
  id,
  getSlots,
  alwaysShowHelpTextWhileActive,
  resolveHelpText,
}: {
  annotationType?: AnnotationToolPlugin["annotationType"];
  helpText?: readonly AnnotationInfoBoxHelpItem[];
  id: AnnotationToolPlugin["id"];
  getSlots?: AnnotationInfoBoxGetSlots;
  alwaysShowHelpTextWhileActive?: boolean;
  resolveHelpText?: AnnotationToolPlugin["resolveHelpText"];
}): AnnotationToolPlugin => ({
  annotationType,
  descriptor: {
    id,
    label: `${id} label`,
    order: 0,
    tooltip: `${id} tooltip`,
  },
  helpText,
  alwaysShowHelpTextWhileActive,
  resolveHelpText,
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
  locked,
  readOnly = false,
  toolType,
}: {
  id: string;
  locked?: boolean;
  readOnly?: boolean;
  toolType: StoredAnnotation["toolType"];
}): StoredAnnotation =>
  ({
    edgeIds: [],
    id,
    locked,
    nodeIds: [],
    readOnly,
    toolType,
  } as StoredAnnotation);

const createDraftStore = (
  draft: ReturnType<AnnotationToolDraftStore["get"]> = {
    coordinates: [],
    linkedNodeGroupIds: [],
    feedback: null,
  }
): AnnotationToolDraftStore => ({
  clear: vi.fn(),
  get: vi.fn(() => draft),
  set: vi.fn(),
  subscribe: vi.fn(() => () => undefined),
});

const createRuntime = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  activeToolType: ANNOTATION_SELECT_TOOL_ID,
  annotationToolDraftStore: createDraftStore(),
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
    useActivePointQueryPickResultMock.mockReset();
    useActivePointQueryPickResultMock.mockReturnValue(null);
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

  it("hides mutating actions for read-only annotations", () => {
    const updateAnnotationDisplayName = vi.fn();
    const updateAnnotationShortLabel = vi.fn();
    const annotation = createAnnotation({
      id: "distance-1",
      readOnly: true,
      toolType: ANNOTATION_TYPES.DISTANCE,
    });
    const slots = {
      content: <span>Distance content</span>,
      footer: <span>Navigation footer</span>,
    };
    const getSlots = vi.fn(() => slots);
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
        updateAnnotationDisplayName,
        updateAnnotationShortLabel,
      })
    );

    const { result } = renderHook(() => useRuntimeAnnotationInfoBoxSlots());

    expect(result.current).toEqual(
      expect.objectContaining({
        annotation,
        kind: RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION,
        slots,
      })
    );
    expect(getSlots).toHaveBeenCalledWith(
      expect.objectContaining({
        annotation,
        infoBoxVisualOptions: expect.objectContaining({
          readOnly: true,
          hiddenActionIds: [
            ANNOTATION_INFO_BOX_ACTION_IDS.LOCK,
            ANNOTATION_INFO_BOX_ACTION_IDS.DELETE,
          ],
        }),
      })
    );
    const context = getSlots.mock.calls[0][0];
    context.updateAnnotationDisplayName(annotation.id, "Renamed");
    context.updateAnnotationShortLabel(annotation.id, "R1");
    expect(updateAnnotationDisplayName).not.toHaveBeenCalled();
    expect(updateAnnotationShortLabel).not.toHaveBeenCalled();
  });

  it("keeps the lock action visible for locked annotations while making fields read-only", () => {
    const annotation = createAnnotation({
      id: "distance-1",
      locked: true,
      toolType: ANNOTATION_TYPES.DISTANCE,
    });
    const slots = {
      content: <span>Distance content</span>,
    };
    const getSlots = vi.fn(() => slots);
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

    renderHook(() => useRuntimeAnnotationInfoBoxSlots());

    expect(getSlots).toHaveBeenCalledWith(
      expect.objectContaining({
        annotation,
        infoBoxVisualOptions: expect.objectContaining({
          readOnly: true,
          hiddenActionIds: [],
        }),
      })
    );
  });

  it("resolves active tool help text as authoring instruction slots when requested", () => {
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
        includeAuthoringInstruction: true,
      })
    );

    expect(result.current).toEqual(
      expect.objectContaining({
        kind: RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.AUTHORING_INSTRUCTION,
        plugin,
        slots: expect.objectContaining({
          collapsible: false,
        }),
      })
    );
    expect(result.current?.slots.headingTitle).toBeUndefined();

    render(<>{result.current?.slots.content}</>);

    expect(screen.getByText("Klick auf die Karte.")).toBeTruthy();
    expect(screen.getByText("Jeder weitere Klick misst neu.")).toBeTruthy();
  });

  it("passes the configured locale into authoring instruction help content", () => {
    const plugin = createPlugin({
      helpText: [
        {
          kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
          inputAlternatives: [
            [ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.CLICK],
            [ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.SHIFT],
          ],
          description: "Setzt den Punkt.",
        },
      ],
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
        helpLocale: "de-DE",
        includeAuthoringInstruction: true,
      })
    );

    render(<>{result.current?.slots.content}</>);

    expect(screen.getByText("Klick")).toBeTruthy();
    expect(screen.getByText("Umschalt")).toBeTruthy();
    expect(screen.queryByText("Click")).toBeNull();
    expect(screen.queryByText("Shift")).toBeNull();
  });

  it("keeps persistent active tool help visible over selected annotation slots", () => {
    const annotation = createAnnotation({
      id: "distance-1",
      toolType: ANNOTATION_TYPES.DISTANCE,
    });
    const selectedPlugin = createPlugin({
      annotationType: ANNOTATION_TYPES.DISTANCE,
      getSlots: vi.fn(() => ({
        content: <span>Selected annotation content</span>,
      })),
      id: ANNOTATION_TYPES.DISTANCE,
    });
    const activePlugin = createPlugin({
      alwaysShowHelpTextWhileActive: true,
      helpText: ["Aktiver Werkzeug-Guide."],
      id: ANNOTATION_TYPES.POINT,
    });

    useAnnotationsRuntimeMock.mockReturnValue(
      createRuntime({
        activeToolType: activePlugin.id,
        annotationToolDraftStore: createDraftStore({
          coordinates: [{ longitude: 7, latitude: 51, altitude: 0 }],
          linkedNodeGroupIds: [null],
          feedback: null,
        }),
        annotationEntries: [annotation],
        registry: createRegistry([selectedPlugin, activePlugin]),
        selectedAnnotationId: annotation.id,
      })
    );

    const { result } = renderHook(() =>
      useRuntimeAnnotationInfoBoxSlots({
        includeAuthoringInstruction: true,
      })
    );

    expect(result.current).toEqual(
      expect.objectContaining({
        annotation,
        instructionToolId: activePlugin.id,
        kind: RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION,
        slots: expect.objectContaining({
          content: expect.anything(),
        }),
      })
    );

    render(
      <>
        {result.current?.kind ===
        RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION
          ? result.current.instructionContent
          : null}
        {result.current?.slots.content}
      </>
    );

    expect(screen.getByText("Aktiver Werkzeug-Guide.")).toBeTruthy();
    expect(screen.getByText("Selected annotation content")).toBeTruthy();
  });

  it("hides persistent active tool help over selected annotation slots after the draft is finished", () => {
    const annotation = createAnnotation({
      id: "distance-1",
      toolType: ANNOTATION_TYPES.DISTANCE,
    });
    const selectedPlugin = createPlugin({
      annotationType: ANNOTATION_TYPES.DISTANCE,
      getSlots: vi.fn(() => ({
        content: <span>Selected annotation content</span>,
      })),
      id: ANNOTATION_TYPES.DISTANCE,
    });
    const activePlugin = createPlugin({
      alwaysShowHelpTextWhileActive: true,
      helpText: ["Aktiver Werkzeug-Guide."],
      id: ANNOTATION_TYPES.POINT,
    });

    useAnnotationsRuntimeMock.mockReturnValue(
      createRuntime({
        activeToolType: activePlugin.id,
        annotationEntries: [annotation],
        registry: createRegistry([selectedPlugin, activePlugin]),
        selectedAnnotationId: annotation.id,
      })
    );

    const { result } = renderHook(() =>
      useRuntimeAnnotationInfoBoxSlots({
        includeAuthoringInstruction: true,
      })
    );

    render(
      <>
        {result.current?.kind ===
        RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION
          ? result.current.instructionContent
          : null}
        {result.current?.slots.content}
      </>
    );

    expect(screen.queryByText("Aktiver Werkzeug-Guide.")).toBeNull();
    expect(screen.getByText("Selected annotation content")).toBeTruthy();
  });

  it("renders active tool draft feedback above authoring instruction help text", () => {
    const plugin = createPlugin({
      helpText: ["Klick auf die Karte."],
      id: ANNOTATION_TYPES.POINT,
    });
    const feedbackMessage = "Der letzte Punkt wurde nicht übernommen.";

    useAnnotationsRuntimeMock.mockReturnValue(
      createRuntime({
        activeToolType: plugin.id,
        annotationToolDraftStore: createDraftStore({
          coordinates: [],
          linkedNodeGroupIds: [],
          feedback: {
            kind: "warning",
            message: feedbackMessage,
          },
        }),
        registry: createRegistry([plugin]),
      })
    );

    const { result } = renderHook(() =>
      useRuntimeAnnotationInfoBoxSlots({
        includeAuthoringInstruction: true,
      })
    );

    const { container } = render(<>{result.current?.slots.content}</>);

    expect(screen.getByText(feedbackMessage)).toBeTruthy();
    expect(container.querySelector(".fa-circle-exclamation")).toBeTruthy();
    expect(
      container
        .querySelector('[data-testid="annotation-help-alert"]')
        ?.getAttribute("data-severity")
    ).toBe("warning");
    expect(screen.getByText("Klick auf die Karte.")).toBeTruthy();
  });

  it("resolves authoring instruction help text from the active draft state when supported", () => {
    const resolveHelpText = vi.fn(({ draftState }) => [
      `${draftState.coordinates.length} gesetzter Punkt`,
    ]);
    const plugin = createPlugin({
      helpText: ["Statischer Hinweis"],
      id: ANNOTATION_TYPES.POINT,
      resolveHelpText,
    });
    const pointQueryPickResult = {
      coordinate: null,
      pointECEF: null,
      screenPosition: { x: 10, y: 20 },
      surfaceNormalECEF: null,
    };
    useActivePointQueryPickResultMock.mockReturnValue(pointQueryPickResult);

    useAnnotationsRuntimeMock.mockReturnValue(
      createRuntime({
        activeToolType: plugin.id,
        annotationToolDraftStore: createDraftStore({
          coordinates: [
            {
              altitude: 100,
              latitude: 51,
              longitude: 7,
            },
          ],
          linkedNodeGroupIds: [null],
          feedback: null,
        }),
        registry: createRegistry([plugin]),
      })
    );

    const { result } = renderHook(() =>
      useRuntimeAnnotationInfoBoxSlots({
        includeAuthoringInstruction: true,
      })
    );

    render(<>{result.current?.slots.content}</>);

    expect(resolveHelpText).toHaveBeenCalledWith(
      expect.objectContaining({
        draftState: expect.objectContaining({
          coordinates: expect.arrayContaining([
            expect.objectContaining({ longitude: 7 }),
          ]),
        }),
        pointQueryPickResult,
      })
    );
    expect(screen.getByText("1 gesetzter Punkt")).toBeTruthy();
    expect(screen.queryByText("Statischer Hinweis")).toBeNull();
  });

  it("does not return authoring instruction slots unless authoring instruction rendering is enabled", () => {
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
