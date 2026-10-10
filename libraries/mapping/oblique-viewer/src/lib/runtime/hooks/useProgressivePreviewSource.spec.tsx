import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProgressivePreviewSource } from "./useProgressivePreviewSource";

const images: {
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}[] = [];
beforeEach(() => {
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
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const loaded = async () => {
  await act(async () => images.at(-1)!.onload?.());
};
const failed = async () => {
  const image = images.at(-1)!;
  await act(async () => {
    image.onerror?.();
    image.onerror?.();
  });
};
const paths = () =>
  images.map((image) => new URL(image.src, "https://imagery.test").pathname);

describe("progressive DOM image fallback", () => {
  it("loads and publishes every intermediate JPEG level from the thumbnail to the final source", async () => {
    const onError = vi.fn();
    const view = renderHook(() =>
      useProgressivePreviewSource({
        previewPath: "/images",
        imageId: "test",
        finalPreviewUrl: "/images/1/test.jpg",
        onError,
      })
    );
    expect(view.result.current).toBe("/images/6/test.jpg");
    for (const level of [6, 5, 4, 3, 2, 1]) {
      expect(images.at(-1)!.src).toBe("/images/" + level + "/test.jpg");
      await loaded();
      expect(view.result.current).toBe("/images/" + level + "/test.jpg");
    }
    expect(paths()).toEqual(
      [6, 5, 4, 3, 2, 1].map((level) => "/images/" + level + "/test.jpg")
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it("starts at the supplied physical-pixel source and skips an unavailable intermediate without dropping the decoded image", async () => {
    const onError = vi.fn();
    const view = renderHook(() =>
      useProgressivePreviewSource({
        previewPath: "/images",
        imageId: "test",
        initialPreviewUrl: "/images/4/test.jpg",
        finalPreviewUrl: "/images/1/test.jpg",
        onError,
      })
    );
    expect(images.at(-1)!.src).toBe("/images/4/test.jpg");
    await loaded();
    expect(view.result.current).toBe("/images/4/test.jpg");
    expect(images.at(-1)!.src).toBe("/images/3/test.jpg");
    await failed();
    expect(view.result.current).toBe("/images/4/test.jpg");
    expect(images.at(-1)!.src).toBe("/images/2/test.jpg");
    await loaded();
    expect(view.result.current).toBe("/images/2/test.jpg");
    await loaded();
    expect(view.result.current).toBe("/images/1/test.jpg");
    expect(paths()).toEqual(
      [4, 3, 2, 1].map((level) => "/images/" + level + "/test.jpg")
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it("retains the last good source during a failed upgrade and does not regress when the requested final level becomes coarser", async () => {
    const onError = vi.fn();
    const view = renderHook(
      ({ final }) =>
        useProgressivePreviewSource({
          previewPath: "/images",
          imageId: "test",
          initialPreviewUrl: "/images/3/test.jpg",
          finalPreviewUrl: final,
          onError,
        }),
      { initialProps: { final: "/images/3/test.jpg" } }
    );
    await loaded();
    view.rerender({ final: "/images/2/test.jpg" });
    expect(view.result.current).toBe("/images/3/test.jpg");
    await failed();
    expect(view.result.current).toBe("/images/3/test.jpg");
    expect(onError).not.toHaveBeenCalled();
    view.rerender({ final: "/images/1/test.jpg" });
    expect(images.at(-1)!.src).toBe("/images/2/test.jpg");
    await failed();
    await loaded();
    expect(view.result.current).toBe("/images/1/test.jpg");
    const downloads = images.length;
    view.rerender({ final: "/images/3/test.jpg" });
    expect(images).toHaveLength(downloads);
    expect(view.result.current).toBe("/images/1/test.jpg");
  });

  it("aborts the old image on source change and ignores its captured late completion", async () => {
    const onError = vi.fn();
    const view = renderHook(
      ({ id }) =>
        useProgressivePreviewSource({
          previewPath: "/images",
          imageId: id,
          finalPreviewUrl: "/images/3/" + id + ".jpg",
          onError,
        }),
      { initialProps: { id: "first" } }
    );
    const old = images.at(-1)!;
    const late = old.onload;
    view.rerender({ id: "second" });
    expect(old.src).toBe("");
    expect(old.onload).toBeNull();
    expect(old.onerror).toBeNull();
    await act(async () => late?.());
    expect(view.result.current).toBe("/images/6/second.jpg");
    await loaded();
    expect(view.result.current).toBe("/images/6/second.jpg");
    expect(images.at(-1)!.src).toBe("/images/5/second.jpg");
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports an initial failure only after every eligible level has failed", async () => {
    const onError = vi.fn();
    renderHook(() =>
      useProgressivePreviewSource({
        previewPath: "/images",
        imageId: "test",
        finalPreviewUrl: "/images/3/test.jpg",
        onError,
      })
    );
    for (const level of [6, 5, 4, 3]) {
      expect(images.at(-1)!.src).toBe("/images/" + level + "/test.jpg");
      expect(onError).not.toHaveBeenCalled();
      await failed();
    }
    expect(onError).toHaveBeenCalledOnce();
  });

  it("cancels the pending DOM load and further refinements when the preview unmounts", async () => {
    const onError = vi.fn();
    const view = renderHook(() =>
      useProgressivePreviewSource({
        previewPath: "/images",
        imageId: "test",
        finalPreviewUrl: "/images/1/test.jpg",
        onError,
      })
    );
    const pending = images.at(-1)!;
    const late = pending.onload;
    view.unmount();
    expect(pending.src).toBe("");
    expect(pending.onload).toBeNull();
    expect(pending.onerror).toBeNull();
    await act(async () => late?.());
    expect(images).toHaveLength(1);
    expect(onError).not.toHaveBeenCalled();
  });
});
