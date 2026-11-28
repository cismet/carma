import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ layers: [] as unknown[] }));

vi.mock("react-redux", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-redux")>()),
  useSelector: (select: () => unknown) => select(),
}));
vi.mock("../../store/slices/mapping", () => ({
  getLayers: () => state.layers,
}));

import { useEnterLibre3dForMeshLayers } from "./useMeshStyleLayers";

const meshStyle = {
  layers: [{ id: "stamm", metadata: { carmaConf: { "3d": {} } } }],
};
const flatStyle = { layers: [{ id: "fill" }] };
const layer = (id: string, style: unknown) => ({
  id,
  visible: true,
  props: { style },
});

describe("useEnterLibre3dForMeshLayers", () => {
  beforeEach(() => {
    state.layers = [];
  });

  const render = (libre3d = false) => {
    const toggle = vi.fn();
    const hook = renderHook(
      ({ libre3d }) =>
        useEnterLibre3dForMeshLayers({ enabled: true, libre3d, toggle }),
      { initialProps: { libre3d } }
    );
    return { toggle, rerender: () => hook.rerender({ libre3d }) };
  };

  it("switches to 3D when a mesh style is added in 2D", () => {
    const { toggle, rerender } = render();
    state.layers = [layer("trees", meshStyle)];
    rerender();
    expect(toggle).toHaveBeenCalledTimes(1);
    rerender();
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("leaves flat styles and layers present at mount alone", () => {
    state.layers = [layer("trees", meshStyle)];
    const { toggle, rerender } = render();
    state.layers = [...state.layers, layer("fill", flatStyle)];
    rerender();
    expect(toggle).not.toHaveBeenCalled();
  });

  it("does not toggle when already in 3D", () => {
    const { toggle, rerender } = render(true);
    state.layers = [layer("trees", meshStyle)];
    rerender();
    expect(toggle).not.toHaveBeenCalled();
  });
});
