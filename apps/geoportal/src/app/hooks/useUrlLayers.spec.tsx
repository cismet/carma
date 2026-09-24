import { StrictMode, type PropsWithChildren } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUrlLayers } from "./useUrlLayers";

const mocks = vi.hoisted(() => ({
  search: "",
  layers: [] as { id: string }[],
  dispatch: vi.fn(),
  navigate: vi.fn(),
  load: vi.fn(),
  error: vi.fn(),
}));
vi.mock("react-router-dom", () => ({
  useLocation: () => ({ search: mocks.search }),
  useNavigate: () => mocks.navigate,
}));
vi.mock("react-redux", () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: () => mocks.layers,
}));
vi.mock("antd", () => ({ message: { error: mocks.error } }));
vi.mock("../constants/discover", () => ({
  layerCatalogConfig: { vectorTileServerUrl: "https://tiles.test" },
}));
vi.mock("../store/slices/mapping", () => ({
  getLayerStack: vi.fn(),
  appendLayer: (payload: unknown) => ({ type: "append", payload }),
  changeVisibility: (payload: unknown) => ({ type: "visible", payload }),
}));
vi.mock("@carma-mapping/layers", () => ({
  loadVectorStyle: (...args: unknown[]) => mocks.load(...args),
  styleUrlTitle: (url: string) => url,
  buildVectorStyleItem: ({ id }: { id: string }) => ({ item: { id } }),
}));
vi.mock("@carma-mapping/utils", () => ({
  parseToMapLayer: async (item: unknown) => item,
}));
const wrapper = ({ children }: PropsWithChildren) => (
  <StrictMode>{children}</StrictMode>
);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.layers = [];
  mocks.search = "";
  mocks.load.mockResolvedValue({});
});
afterEach(cleanup);

describe("useUrlLayers", () => {
  it("waits for config, imports encoded repeated values in order once under StrictMode, and never syncs", async () => {
    const first = "https://tiles.test/a.json?x=1&y=2";
    const second = "https://tiles.test/b.json";
    mocks.search = `?lat=51&ff=debug&addLayer=${encodeURIComponent(
      first
    )}&addLayer=${encodeURIComponent(second)}&addLayer=${encodeURIComponent(
      first
    )}`;
    let resolveFirst!: (value: unknown) => void;
    mocks.load.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );
    const { rerender } = renderHook(({ ready }) => useUrlLayers(ready), {
      initialProps: { ready: false },
      wrapper,
    });
    expect(mocks.load).not.toHaveBeenCalled();
    rerender({ ready: true });
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
    await act(async () => resolveFirst({}));
    await waitFor(() => expect(mocks.dispatch).toHaveBeenCalledTimes(2));
    expect(mocks.load.mock.calls.map((call) => call[0])).toEqual([
      first,
      second,
    ]);
    expect(mocks.dispatch.mock.calls.map((call) => call[0].payload.id)).toEqual(
      [`custom:${first}`, `custom:${second}`]
    );
    expect(mocks.navigate).toHaveBeenCalledWith(
      { search: "lat=51&ff=debug" },
      { replace: true }
    );
    mocks.search = "?addLayer=https%3A%2F%2Ftiles.test%2Fc.json";
    rerender({ ready: true });
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });
  it("continues after invalid or failed URLs and activates an existing layer without duplication", async () => {
    mocks.search =
      "?addLayer=javascript%3Aalert(1)&addLayer=https://tiles.test/bad.json&addLayer=https://tiles.test/good.json";
    mocks.layers = [{ id: "custom:https://tiles.test/good.json" }];
    mocks.load.mockRejectedValueOnce(new Error("offline"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderHook(() => useUrlLayers(true), { wrapper });
    await waitFor(() => expect(mocks.dispatch).toHaveBeenCalledTimes(1));
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: "visible",
      payload: { id: mocks.layers[0].id, visible: true },
    });
    expect(mocks.load).toHaveBeenCalledTimes(2);
    warning.mockRestore();
  });
  it("does not append after unmount", async () => {
    mocks.search = "?addLayer=https://tiles.test/a.json";
    let resolve!: (value: unknown) => void;
    mocks.load.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const { unmount } = renderHook(() => useUrlLayers(true), { wrapper });
    unmount();
    await act(async () => resolve({}));
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
