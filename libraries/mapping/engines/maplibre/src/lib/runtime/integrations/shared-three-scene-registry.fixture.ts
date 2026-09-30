import { afterEach, beforeEach, vi } from "vitest";

import { buildSharedThreeSceneLayer } from "./shared-three-scene-layer";

export const installSharedThreeSceneRegistryFixture = () => {
  const dispose = vi.fn();
  const sharedLayer = {
    id: "carma-shared-three-scene",
    addRuntime: vi.fn(),
    removeRuntime: vi.fn(),
    getScene: vi.fn(),
    getRuntimes: vi.fn(() => []),
    getRenderer: vi.fn(),
    projectSceneToLngLat: vi.fn(
      (position: readonly [number, number, number]) =>
        [position[0], position[2]] as [number, number]
    ),
    setMapStylePresentationEnabled: vi.fn(),
    dispose,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Label overlay maintenance is rate limited; drive its trailing pass
    // deterministically.
    vi.useFakeTimers();
    sharedLayer.getRuntimes.mockReturnValue([]);
    vi.mocked(buildSharedThreeSceneLayer).mockReturnValue(sharedLayer as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  return { dispose, sharedLayer };
};
