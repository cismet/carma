import { describe, expect, it } from "vitest";
import {
  ADHOC_LAYER_SOURCES,
  ADHOC_LAYER_MAP_MODES,
} from "@carma-appframeworks/portals";
import type { Item, Layer } from "@carma-mapping/layers";

import {
  LEAFLET_MAPLIBRE_ADHOC_LAYER_STYLE_SOURCES,
  MEASUREMENT_SERVICE_NAME,
  isSavedMeasurement3dItem,
  isSupportedLeafletMapLibreAdhocLayer,
  shouldShowAdhocLayerIn2dLayerList,
} from "./adhoc-feature-utils";

// The adhoc source / mapMode markers now live on the parsed layer's general
// `layerInfo` object (populated from style.metadata.carmaConf.layerInfo).
const buildLayer = (source?: string, mapMode?: "2d" | "3d"): Layer =>
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

  describe("isSavedMeasurement3dItem", () => {
    const item = (fields: Record<string, unknown>) =>
      ({ id: "item", title: "Item", description: "", ...fields } as Item);

    it("accepts 3D items of the measurement service and of the annotation source", () => {
      expect(
        isSavedMeasurement3dItem(
          item({ serviceName: MEASUREMENT_SERVICE_NAME, mapMode: "3d" })
        )
      ).toBe(true);
      expect(
        isSavedMeasurement3dItem(
          item({
            serviceName: "other",
            source: ADHOC_LAYER_SOURCES.ANNOTATIONS,
            mapMode: "3d",
          })
        )
      ).toBe(true);
    });

    it("rejects 2D items and other 3D items", () => {
      expect(
        isSavedMeasurement3dItem(
          item({ serviceName: MEASUREMENT_SERVICE_NAME, mapMode: "2d" })
        )
      ).toBe(false);
      expect(
        isSavedMeasurement3dItem(item({ serviceName: "other", mapMode: "3d" }))
      ).toBe(false);
    });
  });
});
