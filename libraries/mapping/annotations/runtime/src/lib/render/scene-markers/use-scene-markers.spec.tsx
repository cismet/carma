import { renderHook } from "@testing-library/react";
import { Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";

import type {
  AnnotationEngine,
  AnnotationSceneMarkerHandle,
  AnnotationSceneMarkerOptions,
} from "@carma-mapping/annotations/core";
import {
  canDrawHandlesInScene,
  type SceneMarkerModel,
  type SceneMarkerPlacement,
} from "./scene-marker-models";
import { resolvePointMarkerSceneStyles } from "./scene-marker-styles";
import { useSceneMarkers } from "./use-scene-markers";

const createEngine = () => {
  const preRender = new Set<() => void>();
  const added: AnnotationSceneMarkerOptions[] = [];
  const handles: (AnnotationSceneMarkerHandle & {
    setPosition: ReturnType<typeof vi.fn>;
    setStyle: ReturnType<typeof vi.fn>;
    setVisible: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  })[] = [];
  const collection = {
    addMarker: (options: AnnotationSceneMarkerOptions) => {
      added.push(options);
      const handle = {
        id: options.id,
        setPosition: vi.fn(),
        setStyle: vi.fn(),
        setVisible: vi.fn(),
        destroy: vi.fn(),
      };
      handles.push(handle);
      return handle;
    },
    destroy: vi.fn(),
  };
  const engine = {
    capabilities: { occludedLinesInScene: true, occlusionPerFrame: true },
    isDestroyed: () => false,
    requestRender: vi.fn(),
    createMarkerCollection: () => collection,
    subscribePreRender: (listener: () => void) => {
      preRender.add(listener);
      return () => preRender.delete(listener);
    },
  } as unknown as AnnotationEngine;
  return {
    engine,
    added,
    handles,
    collection,
    frame: () => preRender.forEach((listener) => listener()),
  };
};

const STYLES = resolvePointMarkerSceneStyles({
  pixelSize: 10,
  fill: "transparent",
  outline: "white",
  outlineWidth: 1,
});

const model = (
  id: string,
  place: () => SceneMarkerPlacement | null
): SceneMarkerModel => ({ id, ...STYLES, place });

describe("canDrawHandlesInScene", () => {
  it("needs markers and dashed occluded lines", () => {
    expect(canDrawHandlesInScene(createEngine().engine)).toBe(true);
    expect(
      canDrawHandlesInScene({
        capabilities: { occludedLinesInScene: true },
      } as unknown as AnnotationEngine)
    ).toBe(false);
    expect(canDrawHandlesInScene(null)).toBe(false);
  });
});

describe("useSceneMarkers", () => {
  it("adds markers at their placement and places them before every frame", () => {
    const { engine, added, handles, frame } = createEngine();
    let placement: SceneMarkerPlacement | null = {
      positionECEF: new Vector3(1, 2, 3),
    };
    const markers = [model("a", () => placement)];
    renderHook(() => useSceneMarkers(engine, markers));
    expect(added[0]).toMatchObject({
      id: "a",
      sizePx: 10,
      visible: true,
      occluded: false,
      opacity: 1,
    });

    placement = { positionECEF: new Vector3(4, 5, 6), hovered: true };
    frame();
    expect(handles[0]!.setPosition).toHaveBeenLastCalledWith(
      placement.positionECEF,
      undefined
    );
    expect(handles[0]!.setStyle).toHaveBeenLastCalledWith({
      ...STYLES.hoverStyle,
      occluded: false,
      opacity: 1,
    });

    placement = null;
    frame();
    expect(handles[0]!.setVisible).toHaveBeenLastCalledWith(false);
    expect(handles[0]!.setStyle).toHaveBeenLastCalledWith({
      ...STYLES.style,
      occluded: false,
      opacity: 1,
    });
  });

  it("restyles a marker whole when its anchor's verdict flips, and only then", () => {
    const { engine, added, handles, frame } = createEngine();
    let placement: SceneMarkerPlacement = {
      positionECEF: new Vector3(1, 2, 3),
      occluded: true,
      opacity: 0.75,
    };
    const markers = [model("a", () => placement)];
    renderHook(() => useSceneMarkers(engine, markers));
    expect(added[0]).toMatchObject({ occluded: true, opacity: 0.75 });
    expect(handles[0]!.setStyle).not.toHaveBeenCalled();

    placement = { positionECEF: new Vector3(1, 2, 3) };
    frame();
    expect(handles[0]!.setStyle).toHaveBeenLastCalledWith({
      ...STYLES.style,
      occluded: false,
      opacity: 1,
    });
    frame();
    expect(handles[0]!.setStyle).toHaveBeenCalledOnce();
  });

  it("keeps markers of the same id and destroys the dropped ones", () => {
    const { engine, added, handles, collection } = createEngine();
    const place = () => ({ positionECEF: new Vector3() });
    const { rerender, unmount } = renderHook(
      ({ markers }) => useSceneMarkers(engine, markers),
      { initialProps: { markers: [model("a", place), model("b", place)] } }
    );
    rerender({ markers: [model("a", place)] });
    expect(added).toHaveLength(2);
    expect(handles[1]!.destroy).toHaveBeenCalledOnce();
    expect(handles[0]!.destroy).not.toHaveBeenCalled();
    unmount();
    expect(collection.destroy).toHaveBeenCalledOnce();
  });
});
