import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Matrix3, Matrix4, PerspectiveCamera, Vector2, Vector3 } from "three";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { SharedThreeSceneFrame } from "@carma-mapping/engines/maplibre";
import type { DevicePixels } from "@carma-units";
import {
  useScenePreviewImage,
  type ScenePreviewImageContent,
  type ScenePreviewImageMapping,
  type ScenePreviewPhoto,
} from "./useScenePreviewImage";

import * as photoProjection from "../../core/utils/image-projection";

const shared = vi.hoisted(() => ({
  callback: null as ((frame: SharedThreeSceneFrame) => void) | null,
  setOverlay: vi.fn(),
  release: vi.fn(),
  setPointLabels: vi.fn(),
  projectSceneToLngLat: vi.fn(() => [7, 51]),
  projectLngLatToScene: vi.fn(),
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  acquireSharedThreeScene: () => ({
    release: shared.release,
    setPointLabelOverlayVisible: shared.setPointLabels,
    layer: {
      setMapStyleScreenOverlay: shared.setOverlay,
      projectSceneToLngLat: shared.projectSceneToLngLat,
      projectLngLatToScene: shared.projectLngLatToScene,
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
  it("samples transition opacity on the same texture without replacing pixels or geometry", () => {
    const { options, frame } = setup();
    const opacityRef = { current: 1 };
    const hook = renderHook(() =>
      useScenePreviewImage({ ...options, opacityRef })
    );
    act(() => shared.callback?.(frame));
    const original = shared.setOverlay.mock.calls.at(-1)![1];
    for (const opacity of [0.5, 0, 0.5, 1]) {
      opacityRef.current = opacity;
      act(() => shared.callback?.(frame));
      const current = shared.setOverlay.mock.calls.at(-1)![1];
      expect(current.opacity).toBe(opacity);
      expect(current.texture).toBe(original.texture);
      expect(current.viewportToTexture).toBe(original.viewportToTexture);
    }
    hook.unmount();
  });

  it("uses caller-controlled priority-zero opacity on the first ready frame without a second fade", () => {
    const { options, frame } = setup();
    const opacityRef = { current: 0 };
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    const initialProps = { ...options, priority: 0, opacityRef };
    const hook = renderHook(useScenePreviewImage, { initialProps });
    try {
      act(() => shared.callback?.(frame));
      const original = shared.setOverlay.mock.lastCall![1];
      expect(original.opacity).toBe(0);
      for (const opacity of [1, 0.5, 0, 1]) {
        opacityRef.current = opacity;
        act(() => shared.callback?.(frame));
        const current = shared.setOverlay.mock.lastCall![1];
        expect(current.opacity).toBe(opacity);
        expect(current.texture).toBe(original.texture);
        expect(current.viewportToTexture).toBe(original.viewportToTexture);
      }
    } finally {
      hook.unmount();
      clock.mockRestore();
    }
  });

  it("does not restart an internal fade when a caller-controlled target preview is shown after a handoff", () => {
    const { options, frame } = setup();
    const opacityRef = { current: 1 };
    let now = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    const initialProps = { ...options, priority: 0, opacityRef };
    const hook = renderHook(useScenePreviewImage, { initialProps });
    try {
      act(() => shared.callback?.(frame));
      expect(shared.setOverlay.mock.lastCall![1].opacity).toBe(1);
      hook.rerender({ ...initialProps, shown: false });
      act(() => shared.callback?.(frame));
      const target = document.createElement("canvas");
      target.width = 100;
      target.height = 50;
      now = 10;
      hook.rerender({ ...initialProps, source: target, shown: true });
      act(() => shared.callback?.(frame));
      expect(shared.setOverlay.mock.lastCall![1].texture.image).toBe(target);
      expect(shared.setOverlay.mock.lastCall![1].opacity).toBe(1);
      opacityRef.current = 0.5;
      act(() => shared.callback?.(frame));
      expect(shared.setOverlay.mock.lastCall![1].opacity).toBe(0.5);
    } finally {
      hook.unmount();
      clock.mockRestore();
    }
  });

  it("publishes copied full-sensor mappings independently of texture crops and idle frames", () => {
    const { options, frame } = setup();
    const mapping = vi.fn<(mapping: ScenePreviewImageMapping | null) => void>();
    const hook = renderHook(
      (props: {
        crop?: {
          x: DevicePixels;
          y: DevicePixels;
          width: DevicePixels;
          height: DevicePixels;
        };
      }) =>
        useScenePreviewImage({ ...options, ...props, onImageMapping: mapping }),
      { initialProps: {} }
    );
    act(() => shared.callback?.(frame));
    const sensor =
      shared.setOverlay.mock.lastCall?.[1].border.viewportToImage.clone();
    expect(mapping).toHaveBeenCalledOnce();
    expect(mapping.mock.lastCall?.[0]?.viewport).toEqual({
      width: 100,
      height: 50,
    });
    expect(mapping.mock.lastCall?.[0]?.viewportToImage).toEqual(sensor);
    // A consumer cannot corrupt rendering or the publisher's deduplication state.
    mapping.mock.lastCall![0]!.viewportToImage.elements[0] = 999;
    mapping.mock.lastCall![0]!.viewport.width = 999 as never;
    act(() => shared.callback?.(frame));
    expect(mapping).toHaveBeenCalledOnce();
    expect(shared.setOverlay.mock.lastCall?.[1].border.viewportToImage).toEqual(
      sensor
    );
    hook.rerender({
      crop: {
        x: 10 as DevicePixels,
        y: 5 as DevicePixels,
        width: 40 as DevicePixels,
        height: 20 as DevicePixels,
      },
    });
    act(() => shared.callback?.(frame));
    expect(shared.setOverlay.mock.lastCall?.[1].viewportToTexture).not.toEqual(
      sensor
    );
    expect(shared.setOverlay.mock.lastCall?.[1].border.viewportToImage).toEqual(
      sensor
    );
    expect(mapping).toHaveBeenCalledOnce();
    frame.cssViewport.set(120, 60);
    act(() => shared.callback?.(frame));
    expect(mapping).toHaveBeenCalledTimes(2);
    expect(mapping.mock.lastCall?.[0]?.viewport).toEqual({
      width: 120,
      height: 60,
    });
    hook.unmount();
    expect(mapping.mock.lastCall?.[0]).toBeNull();
  });

  it("clears mappings once when hidden, missing content, invalid viewport, or disposed", () => {
    const { options, frame } = setup();
    const mapping = vi.fn();
    const hook = renderHook(
      (props) =>
        useScenePreviewImage({ ...options, ...props, onImageMapping: mapping }),
      {
        initialProps: {
          shown: true,
          source: options.source as HTMLCanvasElement | null,
        },
      }
    );
    act(() => shared.callback?.(frame));
    hook.rerender({ shown: false, source: options.source });
    act(() => shared.callback?.(frame));
    expect(mapping.mock.lastCall?.[0]).toBeNull();
    const clearedCount = mapping.mock.calls.length;
    act(() => shared.callback?.(frame));
    expect(mapping).toHaveBeenCalledTimes(clearedCount);
    hook.rerender({ shown: true, source: options.source });
    act(() => shared.callback?.(frame));
    expect(mapping.mock.lastCall?.[0]).not.toBeNull();
    hook.rerender({ shown: true, source: null });
    act(() => shared.callback?.(frame));
    expect(mapping.mock.lastCall?.[0]).toBeNull();
    hook.rerender({ shown: true, source: options.source });
    act(() => shared.callback?.(frame));
    frame.cssViewport.set(0, 0);
    act(() => shared.callback?.(frame));
    expect(mapping.mock.lastCall?.[0]).toBeNull();
    frame.cssViewport.set(100, 50);
    act(() => shared.callback?.(frame));
    expect(mapping.mock.lastCall?.[0]).not.toBeNull();
    hook.unmount();
    expect(mapping.mock.lastCall?.[0]).toBeNull();
  });

  it.each([false, true])(
    "pairs the optional finite-depth projector with the requested sensor ROI (anchor=%s)",
    (anchored) => {
      const { options, frame, camera } = setup();
      const anchor = { longitude: 7.1, latitude: 51.2, heightMeters: 250 };
      const sceneAnchor = new Vector3(10, 20, 30);
      shared.projectLngLatToScene.mockReset().mockReturnValue(sceneAnchor);
      const imageProjector = vi
        .spyOn(photoProjection, "imageProjectionMatrix")
        .mockReturnValue(new Matrix4());
      const localProjector = vi
        .spyOn(photoProjection, "sceneToPhotoEnu")
        .mockReturnValue(new Matrix4());
      const firstMatrix = new Matrix3().set(0.5, 0, 0.2, 0, 0.5, 0.1, 0, 0, 1);
      const secondMatrix = new Matrix3().set(0.4, 0, 0.3, 0, 0.4, 0.2, 0, 0, 1);
      const viewportProjector = vi
        .spyOn(photoProjection, "viewportImageProjection")
        .mockReturnValueOnce(firstMatrix)
        .mockReturnValue(secondMatrix);
      const before = vi.fn();
      const mapping = vi.fn();
      const photo = {
        record: { id: "selected-photo" },
        calibration: {},
        pose: {},
        altitude: 1000,
        ...(anchored ? { projectionAnchor: anchor } : {}),
      } as ScenePreviewPhoto;
      const localFrame = {
        ...frame,
        localFrame: { revision: 1, sceneFromLocal: new Matrix4() },
      } as SharedThreeSceneFrame;
      const hook = renderHook(
        (props) =>
          useScenePreviewImage({
            ...options,
            onBeforeRender: before,
            onImageMapping: mapping,
            ...props,
          }),
        {
          initialProps: {
            photo: photo as ScenePreviewPhoto | undefined,
            shown: true,
            source: options.source as HTMLCanvasElement | null,
          },
        }
      );
      try {
        act(() => shared.callback?.(localFrame));
        expect(viewportProjector.mock.calls[0][2]).toBe(
          anchored ? sceneAnchor : undefined
        );
        if (anchored) {
          expect(shared.projectLngLatToScene).toHaveBeenCalledWith(
            [7.1, 51.2],
            250,
            expect.any(Vector3)
          );
        } else {
          expect(shared.projectLngLatToScene).not.toHaveBeenCalled();
        }
        expect(before.mock.lastCall?.[0].viewportToImage).toBe(
          anchored ? firstMatrix : undefined
        );
        expect(shared.setOverlay.mock.lastCall?.[1].viewportToTexture).toBe(
          firstMatrix
        );
        expect(viewportProjector.mock.invocationCallOrder[0]).toBeLessThan(
          before.mock.invocationCallOrder[0]
        );

        camera.matrixWorldInverse.makeTranslation(5, 0, 0);
        act(() => shared.callback?.(localFrame));
        expect(before.mock.lastCall?.[0].viewportToImage).toBe(
          anchored ? secondMatrix : undefined
        );
        expect(shared.setOverlay.mock.lastCall?.[1].viewportToTexture).toBe(
          secondMatrix
        );
        expect(mapping).toHaveBeenCalledTimes(2);
        expect(mapping.mock.lastCall?.[0]).toEqual({
          imageId: "selected-photo",
          viewport: { width: 100, height: 50 },
          viewportToImage: secondMatrix,
        });
        expect(mapping.mock.lastCall?.[0].viewportToImage).not.toBe(
          secondMatrix
        );
        // The anchor belongs to the shared local frame, not the current viewport camera.
        expect(shared.projectLngLatToScene).toHaveBeenCalledTimes(
          anchored ? 1 : 0
        );

        for (const blocked of ["hidden", "missing-texture"] as const) {
          const replacement = { ...photo, altitude: photo.altitude + 1 };
          const replacementMatrix = secondMatrix.clone();
          replacementMatrix.elements[6] += blocked === "hidden" ? 0.1 : 0.2;
          viewportProjector.mockReturnValue(replacementMatrix);
          hook.rerender({
            photo: replacement,
            shown: blocked !== "hidden",
            source: blocked === "missing-texture" ? null : options.source,
          });
          act(() => shared.callback?.(localFrame));
          expect(shared.setOverlay.mock.lastCall?.[1]).toBeNull();
          const calculations = viewportProjector.mock.calls.length;
          // An unchanged blocked frame reuses the computed projector without losing its pending application.
          act(() => shared.callback?.(localFrame));
          expect(viewportProjector).toHaveBeenCalledTimes(calculations);
          hook.rerender({
            photo: replacement,
            shown: true,
            source: options.source,
          });
          act(() => shared.callback?.(localFrame));
          expect(viewportProjector).toHaveBeenCalledTimes(calculations);
          expect(shared.setOverlay.mock.lastCall?.[1].viewportToTexture).toBe(
            replacementMatrix
          );
        }
        // Removing photo projection while hidden must also invalidate the applied matrix.
        hook.rerender({
          photo: undefined,
          shown: false,
          source: options.source,
        });
        act(() => shared.callback?.(localFrame));
        hook.rerender({
          photo: undefined,
          shown: true,
          source: options.source,
        });
        act(() => shared.callback?.(localFrame));
        expect(before.mock.lastCall?.[0].viewportToImage).toBeUndefined();
        expect(shared.setOverlay.mock.lastCall?.[1].viewportToTexture).not.toBe(
          viewportProjector.mock.results.at(-1)?.value
        );
      } finally {
        hook.unmount();
        viewportProjector.mockRestore();
        imageProjector.mockRestore();
        localProjector.mockRestore();
      }
    }
  );

  it("hides the 3D point labels with the draped labels while the photo is shown", () => {
    const { options } = setup();
    shared.setPointLabels.mockClear();
    const hook = renderHook((props) => useScenePreviewImage(props), {
      initialProps: { ...options, showBasemapLabels: true },
    });
    expect(shared.setPointLabels).not.toHaveBeenCalled();
    const releases = shared.release.mock.calls.length;
    hook.rerender({ ...options, showBasemapLabels: false });
    expect(shared.setPointLabels).toHaveBeenCalledWith(false);
    hook.rerender({ ...options, showBasemapLabels: true });
    expect(shared.release.mock.calls.length).toBe(releases + 1);
    hook.unmount();
  });

  it("uses the final normalized render camera and physical viewport before drawing", () => {
    const { map, options, camera, frame } = setup();
    const geometry = vi.fn();
    const hostRenderState = {
      framebuffer: null,
      depthRange: [0, 0.9] as const,
    };
    frame.hostRenderState = hostRenderState;
    const hook = renderHook(() =>
      useScenePreviewImage({ ...options, onBeforeRender: geometry })
    );
    act(() => shared.callback?.(frame));
    expect(geometry.mock.lastCall?.[2]).toBe(hostRenderState);
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
    // The motion upload limit follows the physical viewport, not a fixed image size.
    next.width = 200;
    next.height = 100;
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

  it("removes all decorations and restores them on toggle without replacing the image", () => {
    const { map, options, frame } = setup();
    const hook = renderHook(
      ({ decorations }) =>
        useScenePreviewImage({
          ...options,
          decorations,
          backdropLook: { contrast: 50, brightness: 125, saturation: 50 },
          backdropTint: [0.1, 0.2, 0.3, 0.4],
        }),
      { initialProps: { decorations: false } }
    );
    act(() => shared.callback?.(frame));
    const undecorated = shared.setOverlay.mock.lastCall?.[1];
    expect(undecorated.border).toBeUndefined();
    expect(undecorated.backdropLook).toBeUndefined();
    expect(undecorated.backdropTint).toBeUndefined();
    const version = undecorated.texture.version;
    const repaint = vi.mocked(map.triggerRepaint).mock.calls.length;
    hook.rerender({ decorations: true });
    expect(vi.mocked(map.triggerRepaint).mock.calls.length).toBeGreaterThan(
      repaint
    );
    act(() => shared.callback?.(frame));
    const decorated = shared.setOverlay.mock.lastCall?.[1];
    expect(decorated.border).toMatchObject({
      width: 2,
      opacity: 0.9,
      feather: 50,
    });
    expect(decorated.backdropLook).toEqual({
      contrast: 0.5,
      brightness: 1.25,
      saturation: 0.5,
    });
    expect(decorated.backdropTint).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(decorated.texture).toBe(undecorated.texture);
    expect(decorated.texture.version).toBe(version);
    expect(decorated.viewportToTexture).toBe(undecorated.viewportToTexture);
    hook.rerender({ decorations: false });
    act(() => shared.callback?.(frame));
    const disabledAgain = shared.setOverlay.mock.lastCall?.[1];
    expect(disabledAgain.border).toBeUndefined();
    expect(disabledAgain.backdropLook).toBeUndefined();
    expect(disabledAgain.backdropTint).toBeUndefined();
    const publications = shared.setOverlay.mock.calls.length;
    act(() => shared.callback?.(frame));
    expect(shared.setOverlay).toHaveBeenCalledTimes(publications);
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
