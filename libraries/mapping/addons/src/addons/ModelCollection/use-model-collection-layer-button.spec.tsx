import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Layer, LayerStackEntry } from "@carma-mapping/layers";

const stateMock = vi.hoisted(() => ({
  setModelState: vi.fn(),
  loadLayer: vi.fn(),
  shadowEnabled: false,
  routeAddons: [
    {
      kind: "modelCollection",
      config: { manifestUrl: "/assets/dz-b-prm/collection.json" },
    },
  ],
}));

vi.mock("../../lib/AddonStateContext", () => ({
  useRouteAddons: () => stateMock.routeAddons,
  useAddonState: (kind: string) =>
    kind === "shadowSimulation"
      ? [{ enabled: stateMock.shadowEnabled }, vi.fn()]
      : [{ visible: true }, stateMock.setModelState],
}));
vi.mock("../../lib/addon-overrides-storage", () => ({
  usePersistedAddonOverrides: () => [undefined],
}));
vi.mock("../../lib/addon-overrides", () => ({
  applyAddonOverrides: (entries: unknown[]) => entries,
}));
vi.mock("../../lib/registry", () => ({
  resolveAddonEntries: (entries: unknown[]) => entries,
}));
vi.mock("./dzb-prm-layer", () => ({
  MODEL_COLLECTION_LAYER_ID: "dzb-prm-buga",
  loadDzbPrmLayer: stateMock.loadLayer,
}));

import {
  useModelCollectionLayerButton,
  type ModelCollectionLayerBridge,
} from "./use-model-collection-layer-button";

const createBridge = () => {
  let layers: readonly LayerStackEntry[] = [];
  const listeners = new Set<() => void>();
  const setLayers = (next: readonly LayerStackEntry[]) => {
    layers = next;
    listeners.forEach((listener) => listener());
  };
  const bridge: ModelCollectionLayerBridge = {
    baseHref: "https://example.org/",
    getLayerStack: () => layers,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    append: (layer) => setLayers([...layers, layer]),
    update: (layer: Layer) =>
      setLayers(
        layers.map((current) => (current.id === layer.id ? layer : current))
      ),
    remove: (id) => setLayers(layers.filter((layer) => layer.id !== id)),
  };
  return bridge;
};

describe("useModelCollectionLayerButton", () => {
  beforeEach(() => {
    stateMock.setModelState.mockReset();
    stateMock.shadowEnabled = false;
    stateMock.loadLayer.mockReset().mockResolvedValue({
      id: "dzb-prm-buga",
      title: "BuGa",
      type: "object",
      visible: true,
    });
  });

  it("adds the model row with the shadow workflow and respects later removal", async () => {
    const bridge = createBridge();
    const { rerender } = renderHook(() =>
      useModelCollectionLayerButton(bridge)
    );

    expect(stateMock.loadLayer).not.toHaveBeenCalled();
    expect(bridge.getLayerStack()).toEqual([]);

    stateMock.shadowEnabled = true;
    rerender();

    await waitFor(() =>
      expect(bridge.getLayerStack()).toEqual([
        expect.objectContaining({ id: "dzb-prm-buga" }),
      ])
    );
    expect(stateMock.loadLayer).toHaveBeenCalledTimes(1);

    bridge.remove("dzb-prm-buga");
    await waitFor(() =>
      expect(stateMock.setModelState).toHaveBeenCalledWith({ visible: false })
    );
    expect(stateMock.loadLayer).toHaveBeenCalledTimes(1);
  });
});
