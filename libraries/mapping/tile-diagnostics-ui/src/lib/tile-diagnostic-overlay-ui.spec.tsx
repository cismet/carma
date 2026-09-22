// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PerspectiveCamera } from "three";
import type {
  TileDiagnostics,
  TileDiagnosticModel,
} from "@carma-mapping/engines/maplibre";
import { createTileDiagnosticOverlayComponent } from "./TileDiagnosticOverlay";

afterEach(cleanup);

describe("overlay UI isolation", () => {
  it("publishes scene snapshots without rendering window chrome or recreating the worker", () => {
    const controller = {
      update: vi.fn(),
      updateCamera: vi.fn(),
      dispose: vi.fn(),
    };
    const create = vi.fn(() => controller);
    const Overlay = createTileDiagnosticOverlayComponent({
      createTileDiagnosticOverlay: create,
    } as unknown as TileDiagnostics);
    const model: TileDiagnosticModel = {
      width: 800,
      height: 600,
      rects: [],
      extent: null,
      intersectionEdges: null,
      centerHit: null,
      footprintBounds: null,
      target: 4,
    };
    let publish: (model: TileDiagnosticModel) => void = () => {};
    let camera: (camera: PerspectiveCamera, cameras: []) => void = () => {};
    const unsubscribeModel = vi.fn();
    const unsubscribeCamera = vi.fn();
    const renderChrome = vi.fn();
    function Chrome() {
      renderChrome();
      return (
        <Overlay
          subscribeModel={(listener) => {
            publish = listener;
            listener(model);
            return unsubscribeModel;
          }}
          subscribeCamera={(listener) => {
            camera = listener;
            return unsubscribeCamera;
          }}
          freeView={null}
          up="tileset"
          interactive={false}
          popout={false}
          opacity={1}
          labels="none"
          hover={null}
          followCamera={false}
          showFrustum={true}
          updateOnRender={true}
          onViewChange={() => {}}
          onOrbitChange={() => {}}
          onReset={() => {}}
          onHover={() => {}}
        />
      );
    }
    const result = render(<Chrome />);
    for (let i = 1; i <= 60; i++) {
      act(() => publish({ ...model, target: i }));
    }
    expect(renderChrome).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(controller.update.mock.lastCall?.[0].model.target).toBe(60);
    expect(controller.update.mock.lastCall?.[0].view).toEqual({
      x: 0,
      y: 0,
      w: 800,
      h: 600,
    });
    const updates = controller.update.mock.calls.length;
    act(() => camera(new PerspectiveCamera(), []));
    expect(controller.updateCamera).toHaveBeenCalledTimes(1);
    expect(controller.update).toHaveBeenCalledTimes(updates);
    result.unmount();
    expect(unsubscribeModel).toHaveBeenCalledOnce();
    expect(unsubscribeCamera).toHaveBeenCalledOnce();
    expect(controller.dispose).toHaveBeenCalledOnce();
  });
});
