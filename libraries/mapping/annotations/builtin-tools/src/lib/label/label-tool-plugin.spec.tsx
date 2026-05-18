import { describe, expect, it, vi } from "vitest";

import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import type {
  AnnotationLabelTextRequester,
  AnnotationToolSessionContext,
} from "@carma-mapping/annotations/runtime";

import { createLabelToolPlugin } from "./label-tool-plugin";

const coordinate = {
  latitude: 51,
  longitude: 7,
  altitude: 120,
};

const createSessionContext = ({
  requestLabelText,
}: {
  requestLabelText?: AnnotationLabelTextRequester;
} = {}) => {
  const addAnnotation = vi.fn();

  return {
    addAnnotation,
    context: {
      getState: () => ({
        annotationEntries: [],
      } as ReturnType<AnnotationToolSessionContext["getState"]>),
      dispatch: vi.fn(),
      setActiveToolType: vi.fn(),
      drafts: {
        get: vi.fn(),
        set: vi.fn(),
        clear: vi.fn(),
        subscribe: vi.fn(),
      },
      requestLabelText,
      addAnnotation,
    } as AnnotationToolSessionContext,
  };
};

describe("createLabelToolPlugin", () => {
  it("uses the annotation provider label text requester when registered", async () => {
    const requestLabelText = vi.fn().mockResolvedValue("Tor 9");
    const { addAnnotation, context } = createSessionContext({
      requestLabelText,
    });
    const plugin = createLabelToolPlugin();
    const session = plugin.session?.createSession(context);

    session?.onNodeCreated?.(coordinate, "group-1");
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(requestLabelText).toHaveBeenCalledWith({
      coordinate,
      defaultText: "Beschriftung 1",
      labelTextSuggestions: [],
      linkedNodeGroupId: "group-1",
    });
    expect(addAnnotation).toHaveBeenCalledWith(
      ANNOTATION_TYPES.LABEL,
      [coordinate],
      { displayName: "Tor 9" },
      ["group-1"],
      ANNOTATION_TYPES.LABEL
    );
  });

  it("falls back to the default label text without a requester", () => {
    const { addAnnotation, context } = createSessionContext();
    const plugin = createLabelToolPlugin();
    const session = plugin.session?.createSession(context);

    session?.onNodeCreated?.(coordinate, null);

    expect(addAnnotation).toHaveBeenCalledWith(
      ANNOTATION_TYPES.LABEL,
      [coordinate],
      { displayName: "Beschriftung 1" },
      [null],
      ANNOTATION_TYPES.LABEL
    );
  });
});
