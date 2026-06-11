import { describe, expect, it, vi } from "vitest";
import type { Layer } from "@carma-mapping/layers";

import {
  DEFAULT_LAYER_VISIBILITY_TOGGLE_LABELS,
  getLayerVisibilityToggleProps,
  layerSupportsCesiumVisibilityToggle,
  type LayerVisibilityToggleLabels,
} from "./layer-visibility-toggle-props";

const buildLayer = (overrides: Partial<Layer>): Layer =>
  ({
    id: "layer-1",
    title: "Layer",
    layerType: "vector",
    type: "layer",
    visible: true,
    ...overrides,
  } as Layer);

describe("layer-visibility-toggle-props", () => {
  const customLabels: LayerVisibilityToggleLabels = {
    disabled: "Nicht verfügbar",
    hide: "Aus",
    show: "An",
  };

  it("enables cesium visibility toggles for 3d object layers", () => {
    const layer = buildLayer({
      id: "buga-bridge",
      type: "object",
    });
    const onChangeLayerVisibility = vi.fn();

    const props = getLayerVisibilityToggleProps({
      isCesium: true,
      layer,
      onChangeLayerVisibility,
    });

    expect(layerSupportsCesiumVisibilityToggle(layer)).toBe(true);
    expect(props.visibilityToggleDisabled).toBe(false);
    expect(props.visibilityToggleLabels).toEqual(
      DEFAULT_LAYER_VISIBILITY_TOGGLE_LABELS
    );

    props.onToggleVisibility?.(false);

    expect(onChangeLayerVisibility).toHaveBeenCalledWith("buga-bridge", false);
  });

  it("keeps unsupported cesium layers disabled", () => {
    const props = getLayerVisibilityToggleProps({
      isCesium: true,
      labels: customLabels,
      layer: buildLayer({ type: "layer" }),
      onChangeLayerVisibility: vi.fn(),
    });

    expect(props).toEqual({
      visibilityToggleDisabled: true,
      visibilityToggleLabels: customLabels,
    });
  });

  it("leaves non-cesium toggles on the default VisibilityToggle path", () => {
    const props = getLayerVisibilityToggleProps({
      isCesium: false,
      labels: customLabels,
      layer: buildLayer({ type: "object" }),
      onChangeLayerVisibility: vi.fn(),
    });

    expect(props).toEqual({
      visibilityToggleLabels: customLabels,
    });
  });
});
