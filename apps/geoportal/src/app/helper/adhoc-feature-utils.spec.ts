import { describe, expect, it } from "vitest";
import { ADHOC_LAYER_SOURCES } from "@carma-appframeworks/portals";
import type { Layer } from "@carma-mapping/layers";

import {
  LEAFLET_MAPLIBRE_ADHOC_LAYER_SOURCES,
  isSupportedLeafletMapLibreAdhocLayer,
  shouldShowAdhocLayerIn2dLayerList,
} from "./adhoc-feature-utils";

const buildLayer = (source?: string): Layer =>
  ({
    id: source ?? "generic",
    layerType: "vector",
    type: "object",
    props: {
      style: source ? { source } : {},
    },
  } as Layer);

describe("adhoc-feature-utils", () => {
  it("keeps 3d annotation adhoc layers out of the 2d layer list and Leaflet/MapLibre support", () => {
    const annotationLayer = buildLayer(ADHOC_LAYER_SOURCES.ANNOTATIONS);

    expect(shouldShowAdhocLayerIn2dLayerList(annotationLayer)).toBe(false);
    expect(isSupportedLeafletMapLibreAdhocLayer(annotationLayer)).toBe(false);
  });

  it("supports generic and listed adhoc layer sources in Leaflet/MapLibre", () => {
    expect(LEAFLET_MAPLIBRE_ADHOC_LAYER_SOURCES).toEqual([
      ADHOC_LAYER_SOURCES.TWO_D_MEASUREMENTS,
    ]);
    expect(isSupportedLeafletMapLibreAdhocLayer(buildLayer())).toBe(true);
    expect(
      isSupportedLeafletMapLibreAdhocLayer(
        buildLayer(ADHOC_LAYER_SOURCES.TWO_D_MEASUREMENTS)
      )
    ).toBe(true);
  });
});
