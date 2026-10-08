import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PerspectiveCamera, Vector2, Vector3 } from "three";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { SharedThreeSceneFrame } from "@carma-mapping/engines/maplibre";
import type { DevicePixels } from "@carma-units";
import {
  useScenePreviewImage,
  type ScenePreviewImageContent,
} from "./useScenePreviewImage";

const shared = vi.hoisted(() => ({
  callback: null as ((frame: SharedThreeSceneFrame) => void) | null,
  setOverlay: vi.fn(),
  release: vi.fn(),
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  acquireSharedThreeScene: () => ({
    release: shared.release,
    layer: {
      setMapStyleScreenOverlay: shared.setOverlay,
      addBeforeRenderCallback: (
        callback: (frame: SharedThreeSceneFrame) => void
      ) => {
        shared.callback = callback;
        return () => {
          shared.callback = null;
        };
      },
    },
  }),
}));

const setup = () => {
  shared.setOverlay.mockClear();
  shared.release.mockClear();
  const map = {
    triggerRepaint: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    isMoving: vi.fn(() => false),
  } as unknown as MaplibreMap;
  const source = document.createElement("canvas");
  source.width = 100;
  source.height = 50;
  const options = {
    map,
    source,
    shown: true,
    halfFovTan: 0.5,
    nativeSize: { width: 100 as DevicePixels, height: 50 as DevicePixels },
    principal: { xOffset: 0, yOffset: 0 },
    rollDeg: 0,
    priority: 1,
  };
  const camera = new PerspectiveCamera();
  // An equivalent projection scaled by 3, as MapLibre's composite camera is.
  camera.projectionMatrix.set(
    3,
    0,
    -0.3,
    0,
    0,
    6,
    0.6,
    0,
    0,
    0,
    -3,
    -6,
    0,
    0,
    -3,
    0
  );
  const frame = {
    map,
    renderCamera: camera,
    cssViewport: new Vector2(100, 50),
    viewport: new Vector2(200, 100),
  } as unknown as SharedThreeSceneFrame;
  return { map, source, options, camera, frame };
};

describe("shared-frame preview image", () => {
  it("uses the final normalized render camera and physical viewport before drawing", () => {
    const { map, options, camera, frame } = setup();
    const geometry = vi.fn();
    const hook = renderHook(() =>
      useScenePreviewImage({ ...options, onBeforeRender: geometry })
    );
    act(() => shared.callback?.(frame));
    expect(geometry.mock.lastCall?.[0]).toMatchObject({
      viewport: { width: 100, height: 50 },
      image: { width: 50, height: 25 },
      offset: { x: 5, y: 5 },
      pixelRatio: 2,
    });
    let overlay = shared.setOverlay.mock.lastCall?.[1];
    let uv = new Vector3(0.5, 0.5, 1).applyMatrix3(overlay.viewportToTexture);
    expect(uv.x).toBeCloseTo(0.4);
    expect(uv.y).toBeCloseTo(0.7);
    // A pan is visible to the overlay in this very callback, without map.render or React.
    camera.projectionMatrix.elements[8] = -0.6;
    act(() => shared.callback?.(frame));
    overlay = shared.setOverlay.mock.lastCall?.[1];
    uv = new Vector3(0.5, 0.5, 1).applyMatrix3(overlay.viewportToTexture);
    expect(uv.x).toBeCloseTo(0.3);
    expect(map.on).toHaveBeenCalledWith("moveend", expect.any(Function));
    expect(map.on).not.toHaveBeenCalledWith("render", expect.any(Function));
    hook.unmount();
    expect(shared.callback).toBeNull();
    expect(shared.setOverlay.mock.lastCall?.[1]).toBeNull();
    expect(shared.release).toHaveBeenCalledOnce();
  });

  it("does not rewrite unchanged matrices or schedule idle repaints", () => {
    const { map, options, frame } = setup();
    const hook = renderHook(() => useScenePreviewImage(options));
    act(() => shared.callback?.(frame));
    const calls = shared.setOverlay.mock.calls.length;
    vi.mocked(map.triggerRepaint).mockClear();
    act(() => shared.callback?.(frame));
    expect(shared.setOverlay).toHaveBeenCalledTimes(calls);
    expect(map.triggerRepaint).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("reads completed native content imperatively after same-frame cancellation", () => {
    const { options, source, frame } = setup();
    const contentRef: { current: ScenePreviewImageContent | null } = {
      current: null,
    };
    const before = vi.fn(() => {
      contentRef.current = {
        source,
        crop: {
          x: 10 as DevicePixels,
          y: 0 as DevicePixels,
          width: 50 as DevicePixels,
          height: 50 as DevicePixels,
        },
      };
    });
    const hook = renderHook(() =>
      useScenePreviewImage({
        ...options,
        source: null,
        contentRef,
        onBeforeRender: before,
      })
    );
    act(() => shared.callback?.(frame));
    expect(before).toHaveBeenCalledOnce();
    expect(shared.setOverlay.mock.lastCall?.[1]?.texture.image).toBe(source);
    const overlay = shared.setOverlay.mock.lastCall?.[1];
    expect(overlay.border).toMatchObject({
      imageSize: { width: 50, height: 25 },
      width: 2,
      opacity: 0.9,
      feather: 50,
      featherOpacity: 0.8,
    });
    // The crop samples a smaller region; the white frame still follows the whole photograph.
    const imageUv = new Vector3(0.5, 0.5, 1).applyMatrix3(
      overlay.border.viewportToImage
    );
    const cropUv = new Vector3(0.5, 0.5, 1).applyMatrix3(
      overlay.viewportToTexture
    );
    expect(imageUv.x).toBeCloseTo(0.4);
    expect(imageUv.y).toBeCloseTo(0.7);
    expect(cropUv.x).toBeCloseTo(0.6);
    hook.unmount();
  });

  it("defers a large replacement with its crop while keeping the old image aligned during pan", () => {
    const { map, options, source, camera, frame } = setup();
    const oldCrop = {
      x: 0 as DevicePixels,
      y: 0 as DevicePixels,
      width: 50 as DevicePixels,
      height: 50 as DevicePixels,
    };
    const newCrop = {
      ...oldCrop,
      x: 20 as DevicePixels,
      width: 80 as DevicePixels,
    };
    const contentRef: { current: ScenePreviewImageContent | null } = {
      current: { source, crop: oldCrop },
    };
    const before = vi.fn();
    const hook = renderHook(() =>
      useScenePreviewImage({
        ...options,
        source: null,
        contentRef,
        onBeforeRender: before,
      })
    );
    act(() => shared.callback?.(frame));
    const oldTexture = shared.setOverlay.mock.lastCall?.[1].texture;
    const dispose = vi.spyOn(oldTexture, "dispose");
    const version = oldTexture.version;
    const large = document.createElement("canvas");
    large.width = 2048;
    large.height = 1024;
    vi.mocked(map.isMoving).mockReturnValue(true);
    contentRef.current = { source: large, crop: newCrop };
    camera.projectionMatrix.elements[8] = -0.6;
    vi.mocked(map.triggerRepaint).mockClear();
    act(() => shared.callback?.(frame));
    const deferred = shared.setOverlay.mock.lastCall?.[1];
    expect(deferred.texture).toBe(oldTexture);
    expect(deferred.texture.version).toBe(version);
    expect(dispose).not.toHaveBeenCalled();
    expect(
      new Vector3(0.5, 0.5, 1).applyMatrix3(deferred.viewportToTexture).x
    ).toBeCloseTo(0.6);
    expect(before).toHaveBeenCalledTimes(2);
    expect(map.triggerRepaint).not.toHaveBeenCalled();

    const moveend = vi
      .mocked(map.on)
      .mock.calls.find(([name]) => name === "moveend")?.[1] as () => void;
    vi.mocked(map.isMoving).mockReturnValue(false);
    act(() => moveend());
    expect(map.triggerRepaint).toHaveBeenCalledOnce();
    act(() => shared.callback?.(frame));
    const admitted = shared.setOverlay.mock.lastCall?.[1];
    expect(admitted.texture.image).toBe(large);
    expect(
      new Vector3(0.5, 0.5, 1).applyMatrix3(admitted.viewportToTexture).x
    ).toBeCloseTo(0.125);
    expect(admitted.texture).not.toBe(oldTexture);
    expect(dispose).toHaveBeenCalledOnce();
    vi.mocked(map.triggerRepaint).mockClear();
    act(() => moveend());
    expect(map.triggerRepaint).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("reallocates resized crops, including an in-place canvas resize, and keeps their sampling bounds paired", () => {
    const { options, source, frame } = setup();
    const contentRef: { current: ScenePreviewImageContent | null } = {
      current: { source },
    };
    const hook = renderHook(() =>
      useScenePreviewImage({ ...options, source: null, contentRef })
    );
    act(() => shared.callback?.(frame));
    const first = shared.setOverlay.mock.lastCall?.[1].texture;
    const dispose = vi.spyOn(first, "dispose");
    source.width = 240;
    source.height = 80;
    contentRef.current = {
      source,
      crop: {
        x: 10 as DevicePixels,
        y: 0 as DevicePixels,
        width: 90 as DevicePixels,
        height: 30 as DevicePixels,
      },
    };
    act(() => shared.callback?.(frame));
    const next = shared.setOverlay.mock.lastCall?.[1].texture;
    expect(next).not.toBe(first);
    expect(dispose).toHaveBeenCalledOnce();
    expect(next.image).toBe(source);
    const version = next.version;
    act(() => shared.callback?.(frame));
    expect(shared.setOverlay.mock.lastCall?.[1].texture).toBe(next);
    expect(next.version).toBe(version);
    hook.unmount();
  });

  it("reuses one texture for new pixels and changes only matrices for crop or camera updates", () => {
    const { options, frame, camera } = setup();
    const contentRef: { current: ScenePreviewImageContent | null } = {
      current: { source: options.source },
    };
    const hook = renderHook(() =>
      useScenePreviewImage({ ...options, source: null, contentRef })
    );
    act(() => shared.callback?.(frame));
    const texture = shared.setOverlay.mock.lastCall?.[1].texture;
    const dispose = vi.spyOn(texture, "dispose");
    const version = texture.version;
    const next = document.createElement("canvas");
    next.width = 100;
    next.height = 50;
    contentRef.current = { source: next };
    act(() => shared.callback?.(frame));
    expect(shared.setOverlay.mock.lastCall?.[1].texture).toBe(texture);
    expect(texture.image).toBe(next);
    expect(texture.version).toBe(version + 1);
    expect(dispose).not.toHaveBeenCalled();
    contentRef.current = {
      source: next,
      crop: {
        x: 10 as DevicePixels,
        y: 0 as DevicePixels,
        width: 80 as DevicePixels,
        height: 50 as DevicePixels,
      },
    };
    act(() => shared.callback?.(frame));
    camera.projectionMatrix.elements[8] = -0.6;
    act(() => shared.callback?.(frame));
    expect(texture.version).toBe(version + 1);
    expect(dispose).not.toHaveBeenCalled();
    hook.unmount();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("admits a bounded full-image base during motion without waiting for a large foreground ROI", () => {
    const { map, options, source, frame } = setup();
    const contentRef: { current: ScenePreviewImageContent | null } = {
      current: { source },
    };
    const hook = renderHook(() =>
      useScenePreviewImage({
        ...options,
        priority: 0,
        source: null,
        contentRef,
      })
    );
    act(() => shared.callback?.(frame));
    const texture = shared.setOverlay.mock.lastCall?.[1].texture;
    const next = document.createElement("canvas");
    next.width = 1024;
    next.height = 768;
    vi.mocked(map.isMoving).mockReturnValue(true);
    contentRef.current = { source: next };
    act(() => shared.callback?.(frame));
    expect(shared.setOverlay.mock.lastCall?.[1].texture).not.toBe(texture);
    expect(shared.setOverlay.mock.lastCall?.[1].texture.image).toBe(next);
    hook.unmount();
  });

  it("defers large same-source revisions and their crop until movement ends", () => {
    const { map, options, source, camera, frame } = setup();
    source.width = 2048;
    source.height = 1024;
    const crop = {
      x: 0 as DevicePixels,
      y: 0 as DevicePixels,
      width: 50 as DevicePixels,
      height: 50 as DevicePixels,
    };
    const contentRef: { current: ScenePreviewImageContent | null } = {
      current: { source, revision: 1, crop },
    };
    const hook = renderHook(() =>
      useScenePreviewImage({ ...options, source: null, contentRef })
    );
    act(() => shared.callback?.(frame));
    const texture = shared.setOverlay.mock.lastCall?.[1].texture;
    const version = texture.version;
    vi.mocked(map.isMoving).mockReturnValue(true);
    // Even mutable caller metadata cannot change the crop already admitted with the texture.
    crop.x = 20 as DevicePixels;
    crop.width = 80 as DevicePixels;
    contentRef.current = {
      source,
      revision: 2,
      crop,
    };
    camera.projectionMatrix.elements[8] = -0.6;
    act(() => shared.callback?.(frame));
    const deferred = shared.setOverlay.mock.lastCall?.[1];
    expect(deferred.texture).toBe(texture);
    expect(texture.version).toBe(version);
    expect(
      new Vector3(0.5, 0.5, 1).applyMatrix3(deferred.viewportToTexture).x
    ).toBeCloseTo(0.6);
    vi.mocked(map.isMoving).mockReturnValue(false);
    act(() => shared.callback?.(frame));
    const admitted = shared.setOverlay.mock.lastCall?.[1];
    expect(admitted.texture).toBe(texture);
    expect(texture.version).toBeGreaterThan(version);
    expect(
      new Vector3(0.5, 0.5, 1).applyMatrix3(admitted.viewportToTexture).x
    ).toBeCloseTo(0.125);
    hook.unmount();
  });

  it("waits for large sources without a current texture but admits a small thumbnail during movement", () => {
    const { map, options, source, frame } = setup();
    vi.mocked(map.isMoving).mockReturnValue(true);
    const large = document.createElement("canvas");
    large.width = 1024;
    large.height = 512;
    const contentRef: { current: ScenePreviewImageContent | null } = {
      current: { source: large },
    };
    const before = vi.fn();
    const hook = renderHook(() =>
      useScenePreviewImage({
        ...options,
        source: null,
        contentRef,
        onBeforeRender: before,
      })
    );
    act(() => shared.callback?.(frame));
    expect(shared.setOverlay).not.toHaveBeenCalled();
    expect(before).toHaveBeenCalledOnce();
    source.width = 512;
    source.height = 256;
    contentRef.current = { source };
    act(() => shared.callback?.(frame));
    expect(shared.setOverlay.mock.lastCall?.[1].texture.image).toBe(source);
    hook.unmount();
  });

  it("publishes backdrop changes as uniforms without reuploading texture or rebuilding a camera matrix", () => {
    const { options, frame } = setup();
    const initialProps = {
      look: { contrast: 50, brightness: 125, saturation: 50 },
      tint: [0, 0, 0, 0.13] as const,
    };
    const hook = renderHook(
      ({ look, tint }) =>
        useScenePreviewImage({
          ...options,
          backdropLook: look,
          backdropTint: tint,
        }),
      { initialProps }
    );
    act(() => shared.callback?.(frame));
    const first = shared.setOverlay.mock.lastCall?.[1];
    const textureVersion = first.texture.version;
    expect(first.backdropLook).toEqual({
      contrast: 0.5,
      brightness: 1.25,
      saturation: 0.5,
    });
    expect(first.backdropTint).toEqual([0, 0, 0, 0.13]);
    const calls = shared.setOverlay.mock.calls.length;
    hook.rerender({ look: { ...initialProps.look }, tint: [0, 0, 0, 0.13] });
    act(() => shared.callback?.(frame));
    expect(shared.setOverlay).toHaveBeenCalledTimes(calls);
    hook.rerender({
      ...initialProps,
      look: { contrast: 60, brightness: 125, saturation: 40 },
    });
    act(() => shared.callback?.(frame));
    const updated = shared.setOverlay.mock.lastCall?.[1];
    expect(updated.backdropLook).toEqual({
      contrast: 0.6,
      brightness: 1.25,
      saturation: 0.4,
    });
    expect(updated.texture).toBe(first.texture);
    expect(updated.texture.version).toBe(textureVersion);
    expect(updated.viewportToTexture).toBe(first.viewportToTexture);
    hook.unmount();
  });
});

describe("preview outline handoff", () => {
  it("waits for an admitted texture and shared draw, then notifies once after publishing its visible border", () => {
    const { options, source, frame } = setup();
    const onOutlineReady = vi.fn(() => {
      const overlay = shared.setOverlay.mock.lastCall?.[1];
      expect(overlay).toMatchObject({
        opacity: 1,
        border: { width: 2, opacity: 0.9 },
      });
      expect(overlay.texture.image).toBe(source);
    });
    const initialProps: Parameters<typeof useScenePreviewImage>[0] = {
      ...options,
      source: null,
      onOutlineReady,
    };
    const hook = renderHook(useScenePreviewImage, { initialProps });
    expect(onOutlineReady).not.toHaveBeenCalled();
    act(() => shared.callback?.(frame));
    expect(onOutlineReady).not.toHaveBeenCalled();
    hook.rerender({ ...initialProps, source });
    expect(onOutlineReady).not.toHaveBeenCalled();
    act(() => shared.callback?.(frame));
    expect(onOutlineReady).toHaveBeenCalledOnce();
    expect(onOutlineReady.mock.invocationCallOrder[0]).toBeGreaterThan(
      shared.setOverlay.mock.invocationCallOrder.at(-1)!
    );
    const refinement = document.createElement("canvas");
    refinement.width = 400;
    refinement.height = 200;
    hook.rerender({ ...initialProps, source: refinement });
    act(() => shared.callback?.(frame));
    expect(shared.setOverlay.mock.lastCall?.[1].texture.image).toBe(refinement);
    expect(onOutlineReady).toHaveBeenCalledOnce();
    const publications = shared.setOverlay.mock.calls.length;
    act(() => shared.callback?.(frame));
    expect(shared.setOverlay).toHaveBeenCalledTimes(publications);
    expect(onOutlineReady).toHaveBeenCalledOnce();
    hook.unmount();
  });

  it("waits for the entire priority-zero fade before handing off and ignores subsequent refinements and idle frames", () => {
    const { map, options, frame } = setup();
    let now = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    const onOutlineReady = vi.fn(() =>
      expect(shared.setOverlay.mock.lastCall?.[1]).toMatchObject({
        opacity: 1,
        priority: 0,
        border: { width: 2, opacity: 0.9 },
      })
    );
    const initialProps = { ...options, priority: 0, onOutlineReady };
    const hook = renderHook(useScenePreviewImage, { initialProps });
    try {
      expect(onOutlineReady).not.toHaveBeenCalled();
      for (const time of [0, 125, 249]) {
        now = time;
        act(() => shared.callback?.(frame));
        expect(shared.setOverlay.mock.lastCall?.[1].opacity).toBeCloseTo(
          time / 250,
          8
        );
        expect(onOutlineReady).not.toHaveBeenCalled();
      }
      now = 250;
      act(() => shared.callback?.(frame));
      expect(onOutlineReady).toHaveBeenCalledOnce();
      expect(onOutlineReady.mock.invocationCallOrder[0]).toBeGreaterThan(
        shared.setOverlay.mock.invocationCallOrder.at(-1)!
      );
      const texture = shared.setOverlay.mock.lastCall?.[1].texture;
      const version = texture.version;
      hook.rerender({ ...initialProps, revision: 1 });
      act(() => shared.callback?.(frame));
      expect(shared.setOverlay.mock.lastCall?.[1].texture).toBe(texture);
      expect(texture.version).toBeGreaterThan(version);
      expect(onOutlineReady).toHaveBeenCalledOnce();
      const publications = shared.setOverlay.mock.calls.length;
      vi.mocked(map.triggerRepaint).mockClear();
      now = 1000;
      act(() => shared.callback?.(frame));
      expect(shared.setOverlay).toHaveBeenCalledTimes(publications);
      expect(map.triggerRepaint).not.toHaveBeenCalled();
      expect(onOutlineReady).toHaveBeenCalledOnce();
    } finally {
      hook.unmount();
      clock.mockRestore();
    }
  });
});
