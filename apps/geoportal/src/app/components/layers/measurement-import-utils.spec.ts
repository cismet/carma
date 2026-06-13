import { describe, expect, it, vi } from "vitest";

import { ADHOC_LAYER_SOURCES } from "@carma-appframeworks/portals";
import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import type { AnnotationsRuntimeGeoJsonFeatureCollection } from "@carma-mapping/annotations/runtime";
import type { Item } from "@carma-mapping/layers";

import {
  buildCesiumAnnotationLayerId,
  buildCesiumAnnotationLayerStyle,
} from "./SaveCesiumAnnotations";
import {
  buildSavedMeasurementItemFromAnnotationCarrier,
  resolveAnnotationCarrierFromItem,
  withSavedMeasurementCarrierImport,
} from "./measurement-import-utils";

const createAnnotationsGeoJson =
  (): AnnotationsRuntimeGeoJsonFeatureCollection => ({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "distance-1",
        geometry: {
          type: "LineString",
          coordinates: [
            [7, 51, 100],
            [7.001, 51.001, 101],
          ],
        },
        properties: {},
      },
    ],
    metadata: {
      carmaConf: {
        formatId: "carma-3d-annotations-geojson",
        formatVersion: 1,
        source: "geoportal-cesium-annotations",
        annotationsRuntimePersistence: {
          formatId: "annotations-runtime-persistence",
          version: 1,
          tables: {
            annotationEntries: [
              {
                id: "distance-1",
                toolType: ANNOTATION_TYPES.DISTANCE,
                nodeIds: ["node-1", "node-2"],
                edgeIds: [],
              },
            ],
            nodes: [
              {
                id: "node-1",
                coordinate: { longitude: 7, latitude: 51, altitude: 100 },
              },
              {
                id: "node-2",
                coordinate: {
                  longitude: 7.001,
                  latitude: 51.001,
                  altitude: 101,
                },
              },
            ],
            linkedNodeGroups: [],
            edges: [],
          },
          settings: {
            elevationReferenceAnnotationId: null,
            lastActiveToolType: null,
            nextShortLabelCounterByToolType: {},
          },
        },
      },
    },
  });

const createAnnotationCarrierStyle = () =>
  buildCesiumAnnotationLayerStyle({
    annotationsGeoJson: createAnnotationsGeoJson(),
    title: "Messung A",
    icon: "emoji:1f4cf",
    description: "Beschreibung A",
  });

const createDroppedCarrierItem = (
  styleData: object = createAnnotationCarrierStyle()
): Item =>
  ({
    description: "",
    id: "custom:Messung A.json",
    layerType: "vector",
    title: "Messung A.json",
    serviceName: "custom",
    type: "object",
    keywords: [`carmaConf://vectorStyle:${JSON.stringify(styleData)}`],
    path: "Externe Dienste",
  } as unknown as Item);

describe("resolveAnnotationCarrierFromItem", () => {
  it("resolves a dropped annotation carrier from vectorStyle keywords", () => {
    const resolution = resolveAnnotationCarrierFromItem(
      createDroppedCarrierItem()
    );

    expect(resolution).not.toBeNull();
    expect(resolution?.styleData.source).toBe(ADHOC_LAYER_SOURCES.ANNOTATIONS);
    expect(
      resolution?.annotationsGeoJson.metadata.carmaConf
        .annotationsRuntimePersistence.formatId
    ).toBe("annotations-runtime-persistence");
  });

  it("returns null for generic adhoc carriers without annotations GeoJSON", () => {
    const genericStyle = {
      version: 8,
      sources: {
        adhoc: {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        },
      },
      layers: [],
    };

    expect(
      resolveAnnotationCarrierFromItem(createDroppedCarrierItem(genericStyle))
    ).toBeNull();
  });

  it("returns null for carriers marked with a non-annotation source", () => {
    const styleData = {
      ...createAnnotationCarrierStyle(),
      source: ADHOC_LAYER_SOURCES.TWO_D_MEASUREMENTS,
    };

    expect(
      resolveAnnotationCarrierFromItem(createDroppedCarrierItem(styleData))
    ).toBeNull();
  });

  it("returns null for items that are already saved measurements", () => {
    const item = {
      ...createDroppedCarrierItem(),
      serviceName: "measurements",
    } as Item;

    expect(resolveAnnotationCarrierFromItem(item)).toBeNull();
  });
});

describe("buildSavedMeasurementItemFromAnnotationCarrier", () => {
  it("builds the same saved measurement item shape as the portal save flow", () => {
    const item = createDroppedCarrierItem();
    const resolution = resolveAnnotationCarrierFromItem(item);
    expect(resolution).not.toBeNull();

    const measurementItem = buildSavedMeasurementItemFromAnnotationCarrier({
      item,
      ...resolution!,
      existingMeasurements: [],
    });

    expect(measurementItem.id).toBe(
      buildCesiumAnnotationLayerId(resolution!.annotationsGeoJson)
    );
    expect(measurementItem.id.startsWith("measurement-3d-")).toBe(true);
    expect(measurementItem.serviceName).toBe("measurements");
    expect(measurementItem.type).toBe("object");
    expect((measurementItem as { layerType?: string }).layerType).toBe(
      "vector"
    );
    expect(measurementItem.title).toBe("Messung A");
    expect(measurementItem.description).toBe("Inhalt: Beschreibung A");
    expect(measurementItem.icon).toBe("emoji:1f4cf");
    expect((measurementItem as { tags?: string[] }).tags).toEqual([
      "Messung",
      "3D-Messung",
    ]);
    expect(
      (
        measurementItem as {
          metadata?: { carmaConf?: { annotationsGeoJson?: unknown } };
        }
      ).metadata?.carmaConf?.annotationsGeoJson
    ).toEqual(resolution!.annotationsGeoJson);

    const vectorStyle = JSON.parse(
      (measurementItem as { vectorStyle?: string }).vectorStyle ?? "null"
    );
    expect(vectorStyle.source).toBe(ADHOC_LAYER_SOURCES.ANNOTATIONS);
  });

  it("reuses an existing saved measurement with the same content id", () => {
    const item = createDroppedCarrierItem();
    const resolution = resolveAnnotationCarrierFromItem(item)!;
    const existingId = buildCesiumAnnotationLayerId(
      resolution.annotationsGeoJson
    );
    const existingMeasurement = {
      id: existingId,
      title: "Bereits gespeichert",
      serviceName: "measurements",
      type: "object",
    } as unknown as Item;

    const measurementItem = buildSavedMeasurementItemFromAnnotationCarrier({
      item,
      ...resolution,
      existingMeasurements: [existingMeasurement],
    });

    expect(measurementItem).toBe(existingMeasurement);
  });

  it("keeps titles unique against existing measurements", () => {
    const item = createDroppedCarrierItem();
    const resolution = resolveAnnotationCarrierFromItem(item)!;
    const otherMeasurement = {
      id: "measurement-3d-other",
      title: "Messung A",
      serviceName: "measurements",
      type: "object",
    } as unknown as Item;

    const measurementItem = buildSavedMeasurementItemFromAnnotationCarrier({
      item,
      ...resolution,
      existingMeasurements: [otherMeasurement],
    });

    expect(measurementItem.title).toBe("Messung A (1)");
  });
});

describe("withSavedMeasurementCarrierImport", () => {
  it("rewrites dropped annotation carriers without recording them as measurements", () => {
    const updateLayers = vi.fn();
    const wrapped = withSavedMeasurementCarrierImport(updateLayers, {
      measurements: [],
    });

    wrapped(createDroppedCarrierItem(), false, false, false, true);

    expect(updateLayers).toHaveBeenCalledTimes(1);
    const forwardedItem = updateLayers.mock.calls[0][0] as Item;
    expect(forwardedItem.serviceName).toBe("measurements");
    expect(forwardedItem.id.startsWith("measurement-3d-")).toBe(true);
    expect(updateLayers.mock.calls[0].slice(1)).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });

  it("passes non-carrier items and delete calls through unchanged", () => {
    const updateLayers = vi.fn();
    const wrapped = withSavedMeasurementCarrierImport(updateLayers, {
      measurements: [],
    });
    const genericItem = {
      id: "wms:demo",
      title: "Demo",
      serviceName: "custom",
      type: "layer",
      keywords: [],
    } as unknown as Item;

    wrapped(genericItem);
    const carrierItem = createDroppedCarrierItem();
    wrapped(carrierItem, true);

    expect(updateLayers).toHaveBeenNthCalledWith(
      1,
      genericItem,
      false,
      undefined,
      undefined,
      undefined
    );
    expect(updateLayers).toHaveBeenNthCalledWith(
      2,
      carrierItem,
      true,
      undefined,
      undefined,
      undefined
    );
  });
});
