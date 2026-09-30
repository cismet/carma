import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useProgressivePreviewSource } from "./useProgressivePreviewSource";

const images: {
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}[] = [];
const installImages = () => {
  images.length = 0;
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        images.push(this);
      }
    }
  );
};
afterEach(() => vi.unstubAllGlobals());

describe("progressive image resolution", () => {
  it("keeps the decoded image while upgrading and when a sharper level is unavailable", () => {
    installImages();
    const onError = vi.fn();
    const { result, rerender } = renderHook(
      ({ url }) =>
        useProgressivePreviewSource({
          previewPath: "/images",
          imageId: "test",
          finalPreviewUrl: url,
          onError,
        }),
      { initialProps: { url: "/images/3/test.jpg" } }
    );
    act(() => images.at(-1)!.onload?.());
    expect(result.current).toBe("/images/3/test.jpg");
    rerender({ url: "/images/2/test.jpg" });
    expect(result.current).toBe("/images/3/test.jpg");
    act(() => images.at(-1)!.onerror?.());
    expect(result.current).toBe("/images/3/test.jpg");
    expect(onError).not.toHaveBeenCalled();
    rerender({ url: "/images/1/test.jpg" });
    act(() => images.at(-1)!.onload?.());
    expect(result.current).toBe("/images/1/test.jpg");
  });
  it("ignores a late completion from the previous image and reports an initial failure", () => {
    installImages();
    const onError = vi.fn();
    const { result, rerender } = renderHook(
      ({ id }) =>
        useProgressivePreviewSource({
          previewPath: "/images",
          imageId: id,
          finalPreviewUrl: `/images/3/${id}.jpg`,
          onError,
        }),
      { initialProps: { id: "first" } }
    );
    const first = images.at(-1)!;
    rerender({ id: "second" });
    act(() => first.onload?.());
    expect(result.current).toBe("/images/6/second.jpg");
    act(() => images.at(-1)!.onerror?.());
    expect(onError).toHaveBeenCalledOnce();
  });
});
