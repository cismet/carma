import { describe, expect, it } from "vitest";
import {
  ADHOC_LAYER_SOURCES,
  ADHOC_LAYER_MAP_MODES,
} from "@carma-appframeworks/portals";
import type { Layer } from "@carma-mapping/layers";

import {
  LEAFLET_MAPLIBRE_ADHOC_LAYER_STYLE_SOURCES,
  isSupportedLeafletMapLibreAdhocLayer,
  shouldShowAdhocLayerIn2dLayerList,
} from "./adhoc-feature-utils";

// The adhoc source / mapMode markers now live on the parsed layer's general
// `layerInfo` object (populated from style.metadata.carmaConf.layerInfo).
const buildLayer = (
  source?: string,
  mapMode?: "2d" | "3d"
): Layer =>
  ({
    id: source ?? "generic",
    layerType: "vector",
    type: "object",
    layerInfo: {
      ...(source ? { source } : {}),
      ...(mapMode ? { mapMode } : {}),
    },
  } as Layer);

describe("adhoc-feature-utils", () => {
  it("keeps 3d annotation adhoc layers out of the 2d layer list and Leaflet/MapLibre support", () => {
    const annotationLayer = buildLayer(
      ADHOC_LAYER_SOURCES.ANNOTATIONS,
      ADHOC_LAYER_MAP_MODES.THREE_D
    );

    expect(shouldShowAdhocLayerIn2dLayerList(annotationLayer)).toBe(false);
    expect(isSupportedLeafletMapLibreAdhocLayer(annotationLayer)).toBe(false);
  });

  it("supports only listed adhoc layer sources in Leaflet/MapLibre", () => {
    expect(LEAFLET_MAPLIBRE_ADHOC_LAYER_STYLE_SOURCES).toEqual([
      ADHOC_LAYER_SOURCES.TWO_D_MEASUREMENTS,
    ]);
    expect(isSupportedLeafletMapLibreAdhocLayer(buildLayer())).toBe(false);
    expect(
      isSupportedLeafletMapLibreAdhocLayer(
        buildLayer(ADHOC_LAYER_SOURCES.TWO_D_MEASUREMENTS)
      )
    ).toBe(true);
  });
});
