import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredAnnotation } from "@carma-mapping/annotations/runtime";

const dispatchMock = vi.hoisted(() => vi.fn());
const updateAnnotationEntryByIdMock = vi.hoisted(() =>
  vi.fn((payload) => ({
    payload,
    type: "annotations/updateAnnotationEntryById",
  }))
);

vi.mock("@carma-mapping/annotations/runtime", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@carma-mapping/annotations/runtime")>();

  return {
    ...actual,
    updateAnnotationEntryById: updateAnnotationEntryByIdMock,
    useAnnotationsDispatch: () => dispatchMock,
  };
});

import { LabelToolInfoBoxContent } from "./label-tool-info-box-content";

const createAnnotation = (
  annotation: Partial<StoredAnnotation> = {}
): StoredAnnotation => ({
  edgeIds: [],
  id: "label-1",
  nodeIds: ["node-1"],
  toolType: "label",
  ...annotation,
});

describe("LabelToolInfoBoxContent", () => {
  beforeEach(() => {
    dispatchMock.mockReset();
    updateAnnotationEntryByIdMock.mockClear();
  });

  it("updates the label background color from native input events", () => {
    render(<LabelToolInfoBoxContent annotation={createAnnotation()} />);

    fireEvent.input(screen.getByLabelText("Hintergrundfarbe"), {
      target: { value: "#123456" },
    });

    expect(updateAnnotationEntryByIdMock).toHaveBeenCalledWith({
      annotationId: "label-1",
      labelAppearance: {
        backgroundColor: "#123456",
      },
    });
    expect(dispatchMock).toHaveBeenCalledWith({
      payload: {
        annotationId: "label-1",
        labelAppearance: {
          backgroundColor: "#123456",
        },
      },
      type: "annotations/updateAnnotationEntryById",
    });
  });

  it("updates only the changed label text color from native change events", () => {
    render(
      <LabelToolInfoBoxContent
        annotation={createAnnotation({
          labelAppearance: {
            backgroundColor: "#123456",
          },
        })}
      />
    );

    fireEvent.change(screen.getByLabelText("Textfarbe"), {
      target: { value: "#abcdef" },
    });

    expect(updateAnnotationEntryByIdMock).toHaveBeenCalledWith({
      annotationId: "label-1",
      labelAppearance: {
        textColor: "#abcdef",
      },
    });
  });

  it("resets color input swatches when switching to another label annotation", () => {
    const { rerender } = render(
      <LabelToolInfoBoxContent
        annotation={createAnnotation({
          id: "label-1",
          labelAppearance: {
            backgroundColor: "#123456",
            textColor: "#abcdef",
          },
        })}
      />
    );

    expect(
      (screen.getByLabelText("Hintergrundfarbe") as HTMLInputElement).value
    ).toBe("#123456");
    expect((screen.getByLabelText("Textfarbe") as HTMLInputElement).value).toBe(
      "#abcdef"
    );

    rerender(
      <LabelToolInfoBoxContent
        annotation={createAnnotation({
          id: "label-2",
        })}
      />
    );

    expect(
      (screen.getByLabelText("Hintergrundfarbe") as HTMLInputElement).value
    ).not.toBe("#123456");
    expect(
      (screen.getByLabelText("Textfarbe") as HTMLInputElement).value
    ).not.toBe("#abcdef");
  });

  it("applies color changes to the currently rendered label input, not the previously opened label", () => {
    const { rerender } = render(
      <LabelToolInfoBoxContent
        annotation={createAnnotation({
          id: "label-1",
        })}
      />
    );

    fireEvent.pointerDown(screen.getByLabelText("Hintergrundfarbe"));

    rerender(
      <LabelToolInfoBoxContent
        annotation={createAnnotation({
          id: "label-2",
        })}
      />
    );

    fireEvent.change(screen.getByLabelText("Hintergrundfarbe"), {
      target: { value: "#123456" },
    });

    expect(updateAnnotationEntryByIdMock).toHaveBeenCalledWith({
      annotationId: "label-2",
      labelAppearance: {
        backgroundColor: "#123456",
      },
    });
  });

  it("keeps color picker events inside the info box content", () => {
    const onPointerDown = vi.fn();
    const onMouseDown = vi.fn();
    const onClick = vi.fn();
    const onInput = vi.fn();
    const onChange = vi.fn();

    render(
      <div
        onPointerDown={onPointerDown}
        onMouseDown={onMouseDown}
        onClick={onClick}
        onInput={onInput}
        onChange={onChange}
      >
        <LabelToolInfoBoxContent annotation={createAnnotation()} />
      </div>
    );

    const input = screen.getByLabelText("Hintergrundfarbe");

    fireEvent.pointerDown(input);
    fireEvent.mouseDown(input);
    fireEvent.click(input);
    fireEvent.input(input, { target: { value: "#123456" } });
    fireEvent.change(input, { target: { value: "#654321" } });

    expect(onPointerDown).not.toHaveBeenCalled();
    expect(onMouseDown).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
    expect(onInput).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
