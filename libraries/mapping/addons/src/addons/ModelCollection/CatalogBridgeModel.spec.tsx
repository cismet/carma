import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const bridgeMock = vi.hoisted(() => ({
  runtime: null as { root: THREE.Group; update: () => void } | null,
  shadowOnly: false,
  bridge: "existing" as "existing" | "catalog",
}));

vi.mock("../../lib/AddonStateContext", () => ({
  useRouteAddons: () => [
    { addon: "modelCollection", config: { manifestUrl: "/collection.json" } },
  ],
  useAddonState: (kind: string) => [
    kind === "shadowTexture"
      ? { shadowOnly: bridgeMock.shadowOnly }
      : kind === "shadowSimulation"
      ? { enabled: true }
      : { visible: true, bridge: bridgeMock.bridge },
  ],
}));

vi.mock("../../lib/registry", () => ({
  resolveAddonEntries: () => [
    { kind: "modelCollection", config: { manifestUrl: "/collection.json" } },
  ],
}));

vi.mock("./dzb-prm-collection", () => ({
  loadDzbPrmCollection: async () => ({ boardBottomHeightMeters: 124.35 }),
}));

vi.mock("@carma-mapping/engines/maplibre", async () => {
  const three = await import("three");
  return {
    acquireSharedThreeScene: () => ({
      layer: {
        addRuntime: (runtime: typeof bridgeMock.runtime) => {
          bridgeMock.runtime = runtime;
          runtime?.update();
        },
        hasRuntime: () => true,
        removeRuntime: vi.fn(),
        projectLngLatToScene: (_lngLat: unknown, altitude: number) =>
          new three.Vector3(10, altitude, 20),
      },
      release: vi.fn(),
    }),
    registerSharedThreeSceneRuntime: () => vi.fn(),
  };
});

import { CatalogBridgeModel } from "./CatalogBridgeModel";

describe("catalog bridge MapLibre mount", () => {
  afterEach(() => {
    cleanup();
    bridgeMock.runtime = null;
    bridgeMock.shadowOnly = false;
    bridgeMock.bridge = "existing";
    vi.restoreAllMocks();
  });

  it("uses the collection board-bottom datum and avoids duplicate/hidden presentation", async () => {
    vi.spyOn(GLTFLoader.prototype, "loadAsync").mockImplementation(
      () => new Promise(() => undefined)
    );
    const map = {
      triggerRepaint: () => bridgeMock.runtime?.update(),
    } as unknown as MaplibreMap;
    const view = render(
      <CatalogBridgeModel map={map} opacity={1} visible={true} />
    );

    await waitFor(() => {
      expect(bridgeMock.runtime?.root.position.y).toBeCloseTo(245.4 - 124.35);
      expect(bridgeMock.runtime?.root.visible).toBe(true);
    });

    bridgeMock.shadowOnly = true;
    view.rerender(<CatalogBridgeModel map={map} opacity={1} visible={true} />);
    expect(bridgeMock.runtime?.root.visible).toBe(false);

    bridgeMock.shadowOnly = false;
    view.rerender(<CatalogBridgeModel map={map} opacity={1} visible={false} />);
    expect(bridgeMock.runtime?.root.visible).toBe(false);
    expect(bridgeMock.runtime).not.toBeNull();

    bridgeMock.bridge = "catalog";
    view.rerender(<CatalogBridgeModel map={map} opacity={1} visible={true} />);
    expect(bridgeMock.runtime?.root.visible).toBe(false);
  });
});
