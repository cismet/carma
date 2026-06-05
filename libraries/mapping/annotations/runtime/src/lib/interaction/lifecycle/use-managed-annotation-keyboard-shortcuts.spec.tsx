import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ANNOTATION_SELECT_TOOL_ID,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";

import { createInitialAnnotationsStoreState } from "../../store";
import {
  ANNOTATION_TOOL_PLUGIN_KINDS,
  type AnnotationToolDraftStore,
  type AnnotationToolPlugin,
  type AnnotationToolSessionContext,
} from "../../registry";
import type { StoredAnnotation } from "../../store";
import { ANNOTATION_DELETE_CONFIRMATION_SOURCES } from "../../context/annotation-delete-confirmation";
import { useManagedAnnotationKeyboardShortcuts } from "./use-managed-annotation-keyboard-shortcuts";

const createDraftStore = (
  coordinates: ReturnType<AnnotationToolDraftStore["get"]>["coordinates"] = []
): AnnotationToolDraftStore => ({
  clear: vi.fn(),
  get: vi.fn(() => ({
    coordinates,
    linkedNodeGroupIds: [],
    feedback: null,
  })),
  set: vi.fn(),
  subscribe: vi.fn(() => () => undefined),
});

const createSessionContext = (
  draftStore: AnnotationToolDraftStore,
  selectedAnnotationIds: readonly string[] = ["measurement-1"],
  annotationEntries: readonly StoredAnnotation[] = selectedAnnotationIds.map(
    (id) =>
      ({
        edgeIds: [],
        id,
        nodeIds: [],
        toolType: ANNOTATION_TYPES.AREA_PLANAR,
      } as StoredAnnotation)
  )
): AnnotationToolSessionContext => {
  const state = createInitialAnnotationsStoreState({
    initialToolType: ANNOTATION_TYPES.AREA_PLANAR,
  });

  return {
    getState: () => ({
      ...state,
      selectionState: {
        ...state.selectionState,
        selectedAnnotationIds,
      },
      annotationEntries,
    }),
    dispatch: vi.fn(),
    setActiveToolType: vi.fn(),
    drafts: draftStore,
    addAnnotation: vi.fn(),
  } as unknown as AnnotationToolSessionContext;
};

const createKeyboardEvent = (key: string, shiftKey = false) =>
  new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key,
    shiftKey,
  });

type RenderOptions = Partial<
  Parameters<typeof useManagedAnnotationKeyboardShortcuts>[0]
>;

const renderShortcuts = (options: RenderOptions = {}) => {
  const draftStore = options.sessionContext?.drafts ?? createDraftStore();

  return renderHook(() =>
    useManagedAnnotationKeyboardShortcuts({
      activePlugin: null,
      activeToolSession: null,
      activeToolType: ANNOTATION_TYPES.AREA_PLANAR,
      cancelToolId: ANNOTATION_SELECT_TOOL_ID,
      clearInteractionState: vi.fn(),
      focusAdjacentAnnotationEntry: vi.fn(),
      removeSelectedAnnotations: vi.fn(),
      requestActivateTool: vi.fn(),
      requestFinishMeasurement: vi.fn(),
      requestModeChange: vi.fn(),
      sessionContext: createSessionContext(draftStore),
      setActiveToolTypeInStore: vi.fn(),
      ...options,
    })
  );
};

describe("useManagedAnnotationKeyboardShortcuts", () => {
  it("cancels active measurement tools into the configured cancel tool", () => {
    const activeToolSession = {
      discardDraft: vi.fn(),
      requestFinish: vi.fn(),
      requestStart: vi.fn(),
      toolType: ANNOTATION_TYPES.AREA_PLANAR,
    };
    const clearInteractionState = vi.fn();
    const setActiveToolTypeInStore = vi.fn();
    const { unmount } = renderShortcuts({
      activeToolSession,
      cancelToolId: ANNOTATION_SELECT_TOOL_ID,
      clearInteractionState,
      setActiveToolTypeInStore,
    });
    const event = createKeyboardEvent("Escape");

    act(() => {
      window.dispatchEvent(event);
    });

    expect(activeToolSession.discardDraft).toHaveBeenCalled();
    expect(setActiveToolTypeInStore).toHaveBeenCalledWith(
      ANNOTATION_SELECT_TOOL_ID
    );
    expect(clearInteractionState).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    unmount();
  });

  it("keeps active measurement tools active on Escape when no annotations can be selected", () => {
    const activeToolSession = {
      discardDraft: vi.fn(),
      requestFinish: vi.fn(),
      requestStart: vi.fn(),
      toolType: ANNOTATION_TYPES.AREA_PLANAR,
    };
    const clearInteractionState = vi.fn();
    const setActiveToolTypeInStore = vi.fn();
    const { unmount } = renderShortcuts({
      activeToolSession,
      cancelToolId: ANNOTATION_SELECT_TOOL_ID,
      clearInteractionState,
      sessionContext: createSessionContext(createDraftStore(), [], []),
      setActiveToolTypeInStore,
    });
    const event = createKeyboardEvent("Escape");

    act(() => {
      window.dispatchEvent(event);
    });

    expect(activeToolSession.discardDraft).toHaveBeenCalled();
    expect(setActiveToolTypeInStore).not.toHaveBeenCalled();
    expect(clearInteractionState).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    unmount();
  });

  it("routes Backspace on selected complete measurements through confirmed delete", () => {
    const removeSelectedAnnotations = vi.fn();
    const { unmount } = renderShortcuts({ removeSelectedAnnotations });
    const event = createKeyboardEvent("Backspace");

    act(() => {
      window.dispatchEvent(event);
    });

    expect(removeSelectedAnnotations).toHaveBeenCalledWith({
      skipConfirmation: false,
      source: ANNOTATION_DELETE_CONFIRMATION_SOURCES.KEYBOARD,
    });
    expect(event.defaultPrevented).toBe(true);
    unmount();
  });

  it("skips delete confirmation for Shift+Backspace", () => {
    const removeSelectedAnnotations = vi.fn();
    const { unmount } = renderShortcuts({ removeSelectedAnnotations });
    const event = createKeyboardEvent("Backspace", true);

    act(() => {
      window.dispatchEvent(event);
    });

    expect(removeSelectedAnnotations).toHaveBeenCalledWith({
      skipConfirmation: true,
      source: ANNOTATION_DELETE_CONFIRMATION_SOURCES.KEYBOARD,
    });
    expect(event.defaultPrevented).toBe(true);
    unmount();
  });

  it("does not delete selected complete measurements while an active draft consumes Backspace", () => {
    const clearInteractionState = vi.fn();
    const removeSelectedAnnotations = vi.fn();
    const onKeyDown = vi.fn(({ event }: { event: KeyboardEvent }) => {
      event.preventDefault();
      return true;
    });
    const activePlugin = {
      annotationType: ANNOTATION_TYPES.AREA_PLANAR,
      descriptor: {
        id: ANNOTATION_TYPES.AREA_PLANAR,
        label: "Area",
        order: 0,
        tooltip: "Area",
      },
      id: ANNOTATION_TYPES.AREA_PLANAR,
      kind: ANNOTATION_TOOL_PLUGIN_KINDS.MEASUREMENT,
      keyboard: {
        onKeyDown,
      },
    } as AnnotationToolPlugin;
    const draftStore = createDraftStore([
      { longitude: 7, latitude: 51, altitude: 100 },
    ]);
    const { unmount } = renderShortcuts({
      activePlugin,
      clearInteractionState,
      removeSelectedAnnotations,
      sessionContext: createSessionContext(draftStore),
    });
    const event = createKeyboardEvent("Backspace");

    act(() => {
      window.dispatchEvent(event);
    });

    expect(onKeyDown).toHaveBeenCalled();
    expect(removeSelectedAnnotations).not.toHaveBeenCalled();
    expect(clearInteractionState).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    unmount();
  });

  it("blocks complete measurement deletion while an active draft is open", () => {
    const clearInteractionState = vi.fn();
    const removeSelectedAnnotations = vi.fn();
    const draftStore = createDraftStore([
      { longitude: 7, latitude: 51, altitude: 100 },
    ]);
    const { unmount } = renderShortcuts({
      clearInteractionState,
      removeSelectedAnnotations,
      sessionContext: createSessionContext(draftStore),
    });
    const event = createKeyboardEvent("Delete");

    act(() => {
      window.dispatchEvent(event);
    });

    expect(removeSelectedAnnotations).not.toHaveBeenCalled();
    expect(clearInteractionState).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    unmount();
  });
});
